#!/bin/bash

#######################################################################################
# Category System Redesign — STAGE 2 (schema finalize + cleanup)
#
# Run this AFTER category_migration_stage1_data.sh has completed successfully AND you
# have deployed the full code changes to this server via your normal pipeline
# (e.g. ./management/deploy.sh), which brings up a backend image where:
#   - backend/api/models.py no longer defines ProductCategory.parent
#   - backend/api/migrations/0053_alter_productcategory_options_and_more.py exists
#   - admin.py / serializers.py / views.py / services/*.py no longer reference
#     `.parent` / `subcategories`
#   - backend/api/management/commands/delete_orphaned_parent_categories.py exists
#   - the frontend has been rebuilt against the new category/group API shape
#
# WHAT THIS SCRIPT DOES, IN ORDER:
#   1. Pre-flight checks (confirms the NEW code is actually running — i.e. that
#      ProductCategory.parent is gone — and that stage 1 completed).
#   2. Extra full Postgres backup (schema-changing step is next).
#   3. Applies any pending Django migrations (idempotent — no-ops if your deploy
#      pipeline already ran `manage.py migrate`), then verifies the `parent` column
#      is actually gone from api_productcategory.
#   4. Runs delete_orphaned_parent_categories --dry-run, shows you exactly what it
#      would delete, then (after confirmation) runs it for real. This only ever
#      deletes a ProductCategory row that: has zero directly-tagged products, is not
#      a member of any CategoryGroup, and has an identically-named CategoryGroup
#      already covering its old role — anything ambiguous is left alone and reported.
#   5. Clears the Redis cache (defensive — the deploy already bumped versioned cache
#      keys, so this just frees stale entries immediately instead of waiting for TTL).
#   6. Runs health checks and a live smoke test of /api/categories/ and
#      /api/category-groups/ via nginx.
#
# Usage:
#   ./management/category_migration_stage2_finalize.sh [--status] [--yes] [--force]
#
#   --yes     Skip interactive confirmation prompts (for unattended/CI use).
#   --force   On prod only: proceed without stage 1 marker even if schema state is unclear.
#             Usually not needed — stage 2 auto-detects already-migrated dev/prod schema.
#######################################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/db_backups"
STAMP="$(date +'%Y%m%d_%H%M%S')"
CLEANUP_LOG="$LOG_DIR/category_migration_stage2_cleanup_${STAMP}.log"
MARKER_FILE="$LOG_DIR/.category_migration_stage1_complete"
STAGE2_MARKER_FILE="$LOG_DIR/.category_migration_stage2_complete"

# shellcheck source=category_migration_common.sh
source "$SCRIPT_DIR/category_migration_common.sh"

ASSUME_YES=false
FORCE=false
STATUS_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --yes|-y) ASSUME_YES=true ;;
        --force) FORCE=true ;;
        --status) STATUS_ONLY=true ;;
        --help|-h)
            sed -n '3,45p' "$0"
            exit 0
            ;;
        *) ;;
    esac
done

log()   { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"; }
warn()  { echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"; }
error() { echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"; }
info()  { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"; }
section() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${CYAN}$1${NC}\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

confirm() {
    local prompt="$1"
    if [ "$ASSUME_YES" = true ]; then
        return 0
    fi
    if [ ! -t 0 ]; then
        error "Not an interactive terminal and --yes was not passed. Aborting rather than guessing."
        exit 1
    fi
    read -r -p "$prompt [type 'yes' to continue]: " reply
    if [[ "$reply" != "yes" ]]; then
        log "Aborted by user."
        exit 1
    fi
}

load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$PROJECT_DIR/.env"
        set +a
        log "Environment variables loaded"
    else
        warn "No .env file found — relying on already-exported environment"
    fi
}

preflight() {
    section "STEP 1/6 — Pre-flight checks"

    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running."
        exit 1
    fi
    cd "$PROJECT_DIR"

    if [ -z "$(dc ps -q backend 2>/dev/null)" ]; then
        error "No running 'backend' container found. Deploy the new code first (e.g. ./management/deploy.sh)."
        exit 1
    fi

    info "Checking category schema state (model field + database column)..."
    local has_parent parent_col verdict
    has_parent=$(django_model_has_parent_field) || true
    parent_col=$(django_db_has_parent_id_column) || true
    verdict=$(category_migration_verdict) || verdict="check_failed"

    if [[ "$has_parent" == ERROR:* ]] || [[ "$parent_col" == ERROR:* ]]; then
        error "Could not inspect category schema state:"
        [[ "$has_parent" == ERROR:* ]] && error "  model check: ${has_parent#ERROR:}"
        [[ "$parent_col" == ERROR:* ]] && error "  database check: ${parent_col#ERROR:}"
        exit 1
    fi

    info "  ProductCategory.parent on model: $has_parent"
    info "  parent_id column in database:  $parent_col"

    if [ "$has_parent" = "True" ] || [ "$parent_col" = "present" ]; then
        error "The running backend still has the OLD category schema."
        error "Deploy the full category-redesign code first (./management/deploy.sh), then re-run"
        error "this script. If stage 1 data migration has not run yet, run:"
        error "  ./management/category_migration_stage1_data.sh"
        exit 1
    fi
    log "Confirmed: running backend has the new schema-less category model."

    if [ ! -f "$MARKER_FILE" ]; then
        if [ "$verdict" = "ready_stage2" ] || [ "$verdict" = "already_complete" ]; then
            warn "Stage 1 completion marker not found: $MARKER_FILE"
            warn "Schema is already migrated — this is normal on dev after manual/ad-hoc migration."
            print_category_data_summary
            if [ "$FORCE" != true ] && [ "$ASSUME_YES" != true ]; then
                confirm "Continue stage 2 finalize without stage 1 marker?"
            fi
        elif [ "$FORCE" = true ]; then
            warn "Stage 1 marker missing; proceeding because --force was passed."
        else
            error "Stage-1 completion marker not found: $MARKER_FILE"
            error "On production, run ./management/category_migration_stage1_data.sh first."
            error "If schema is already migrated (dev), re-run — this script should auto-detect that."
            exit 1
        fi
    else
        log "Found stage-1 completion marker:"
        sed 's/^/    /' "$MARKER_FILE"
    fi

    if [ -f "$STAGE2_MARKER_FILE" ]; then
        warn "Stage 2 already completed previously:"
        sed 's/^/    /' "$STAGE2_MARKER_FILE"
        confirm "Re-run stage 2 anyway? (idempotent: cleanup, cache, health checks)"
    fi

    info "Checking delete_orphaned_parent_categories command is available..."
    if ! dc exec -T backend python manage.py help delete_orphaned_parent_categories > /dev/null 2>&1; then
        error "delete_orphaned_parent_categories is not available in the running backend image."
        error "The deploy may be incomplete/stale. Verify the deployed image actually contains the"
        error "full category-redesign commit before continuing."
        exit 1
    fi
    log "Command is available — new image confirmed deployed."

    mkdir -p "$LOG_DIR"
}

do_backup() {
    section "STEP 2/6 — Extra full PostgreSQL backup (before/around the schema migration)"
    if [ ! -x "$SCRIPT_DIR/pg_backup.sh" ]; then
        error "$SCRIPT_DIR/pg_backup.sh not found or not executable. Refusing to proceed without a backup."
        exit 1
    fi
    if ! "$SCRIPT_DIR/pg_backup.sh" backup; then
        error "Backup failed. Aborting."
        exit 1
    fi
    log "Backup completed successfully."
}

apply_schema_migration() {
    section "STEP 3/6 — Applying/confirming the schema migration"

    if dc exec -T backend python manage.py migrate --check > /dev/null 2>&1; then
        log "No pending migrations — schema migration was already applied (likely by your deploy pipeline)."
    else
        info "Pending migrations detected — applying now."
        confirm "About to run 'manage.py migrate --noinput', which will drop the ProductCategory.parent column. Continue?"
        if ! dc exec -T backend python manage.py migrate --noinput; then
            error "Migration failed. Investigate before proceeding — do not run delete_orphaned_parent_categories yet."
            exit 1
        fi
        log "Migrations applied."
    fi

    info "Verifying the parent_id column is actually gone from api_productcategory..."
    parent_col=$(django_db_has_parent_id_column) || true
    if [[ "$parent_col" == ERROR:* ]]; then
        error "Could not verify database column: ${parent_col#ERROR:}"
        exit 1
    fi
    if [ "$parent_col" = "present" ]; then
        error "Column 'parent_id' still exists on api_productcategory after migration. Something is wrong."
        exit 1
    fi
    log "Confirmed: parent_id column has been dropped from api_productcategory."
}

cleanup_orphans() {
    section "STEP 4/6 — Cleaning up orphaned former-parent ProductCategory rows"

    info "Dry run first (preview only, no deletions)..."
    dc exec -T backend python manage.py delete_orphaned_parent_categories --dry-run 2>&1 | tee "$CLEANUP_LOG"

    if grep -q "No orphaned former-parent categories found" "$CLEANUP_LOG"; then
        log "Nothing to clean up."
        return 0
    fi

    echo ""
    warn "Review the candidates above (also saved to: $CLEANUP_LOG)."
    confirm "Proceed with deleting these orphaned former-parent categories?"

    dc exec -T backend python manage.py delete_orphaned_parent_categories 2>&1 | tee -a "$CLEANUP_LOG"
    log "Cleanup complete."
}

clear_caches() {
    section "STEP 5/6 — Clearing Redis cache (defensive — versioned cache keys already changed)"
    if dc exec -T backend python manage.py shell -c \
        "from django.core.cache import cache; cache.clear(); print('cache cleared')" 2>/dev/null | grep -q "cache cleared"; then
        log "Redis cache cleared."
    else
        warn "Could not confirm cache clear (non-critical — versioned cache keys already prevent stale reads)."
    fi
}

run_health_checks() {
    section "STEP 6/6 — Health checks + live category API smoke test"

    local health_ok=true
    if [ -x "$SCRIPT_DIR/health_check.sh" ]; then
        if ! "$SCRIPT_DIR/health_check.sh"; then
            warn "health_check.sh reported failures (see above)."
            health_ok=false
        fi
    else
        warn "health_check.sh not found, skipping full health check."
    fi

    info "Smoke-testing /api/categories/ and /api/category-groups/..."
    local cat_result groups_result smoke_ok=true
    cat_result=$(curl_api_smoke "/api/categories/") || true
    groups_result=$(curl_api_smoke "/api/category-groups/") || true

    if [[ "$cat_result" == 200* ]]; then
        log "/api/categories/ OK ($cat_result)"
    else
        error "/api/categories/ failed ($cat_result)"
        smoke_ok=false
    fi
    if [[ "$groups_result" == 200* ]]; then
        log "/api/category-groups/ OK ($groups_result)"
    else
        error "/api/category-groups/ failed ($groups_result)"
        smoke_ok=false
    fi

    if [ "$smoke_ok" = false ]; then
        error "Category API smoke tests failed."
        exit 1
    fi

    if [ "$health_ok" = false ]; then
        warn "Full health_check.sh had issues, but category API smoke tests passed — stage 2 migration checks OK."
    fi
}

main() {
    cd "$PROJECT_DIR"
    load_env

    if [ "$STATUS_ONLY" = true ]; then
        section "Category migration — status check"
        print_category_migration_status
        exit $?
    fi

    section "Category System Redesign — STAGE 2 (schema finalize + cleanup)"
    preflight
    do_backup
    apply_schema_migration
    cleanup_orphans
    clear_caches
    run_health_checks

    {
        echo "completed_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        echo "cleanup_log=$CLEANUP_LOG"
    } > "$STAGE2_MARKER_FILE"

    section "✅ STAGE 2 COMPLETE — Category system redesign is fully live in production"
    cat <<EOF

Summary:
  - ProductCategory.parent column dropped (schema migration applied and verified).
  - Orphaned former-parent category rows cleaned up (see $CLEANUP_LOG).
  - Redis cache cleared.
  - /api/categories/ and /api/category-groups/ verified responding via nginx.

If anything looks wrong on the live site, you have two full Postgres backups from
this rollout (stage 1 + stage 2, plus your deploy pipeline's own pre-deploy backup)
under: $LOG_DIR
Restore with: ./management/pg_backup.sh restore <backup_file> --promote
Or roll back code + DB together with: ./management/rollback.sh

EOF
}

main "$@"
