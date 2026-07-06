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
#   ./management/category_migration_stage2_finalize.sh [--yes] [--force]
#
#   --yes     Skip interactive confirmation prompts (for unattended/CI use).
#   --force   Proceed even if the stage-1 completion marker is missing (not
#             recommended — only use if you're certain stage 1 was already done).
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

ASSUME_YES=false
FORCE=false
for arg in "$@"; do
    case "$arg" in
        --yes|-y) ASSUME_YES=true ;;
        --force) FORCE=true ;;
        --help|-h)
            sed -n '3,40p' "$0"
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

get_postgres_service() {
    local svc
    svc=$(cd "$PROJECT_DIR" && docker compose ps --services 2>/dev/null | grep -iE '^(postgres|pg)$' | head -1)
    echo "${svc:-postgres}"
}

preflight() {
    section "STEP 1/6 — Pre-flight checks"

    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running."
        exit 1
    fi
    cd "$PROJECT_DIR"

    if [ ! -f "$MARKER_FILE" ]; then
        if [ "$FORCE" = true ]; then
            warn "Stage-1 completion marker not found, but --force was passed. Proceeding anyway."
        else
            error "Stage-1 completion marker not found: $MARKER_FILE"
            error "Run ./management/category_migration_stage1_data.sh first, or pass --force if you're"
            error "certain the data migration already happened (e.g. via a manual run)."
            exit 1
        fi
    else
        log "Found stage-1 completion marker:"
        sed 's/^/    /' "$MARKER_FILE"
    fi

    if [ -z "$(docker compose ps -q backend 2>/dev/null)" ]; then
        error "No running 'backend' container found. Deploy the new code first (e.g. ./management/deploy.sh)."
        exit 1
    fi

    info "Checking the running backend image no longer has ProductCategory.parent..."
    local has_parent
    has_parent=$(docker compose exec -T backend python -c \
        "from api.models import ProductCategory; print(hasattr(ProductCategory, 'parent'))" \
        2>/dev/null | tr -d '\r\n' || true)

    if [ "$has_parent" != "False" ]; then
        error "The running backend container still has ProductCategory.parent (got: '${has_parent:-empty}')."
        error "The full code deploy has not happened yet on this server. Deploy it first"
        error "(./management/deploy.sh or your usual pipeline), THEN re-run this script."
        exit 1
    fi
    log "Confirmed: running backend has the new schema-less category model."

    info "Checking delete_orphaned_parent_categories command is available..."
    if ! docker compose exec -T backend python manage.py help delete_orphaned_parent_categories > /dev/null 2>&1; then
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

    if docker compose exec -T backend python manage.py migrate --check > /dev/null 2>&1; then
        log "No pending migrations — schema migration was already applied (likely by your deploy pipeline)."
    else
        info "Pending migrations detected — applying now."
        confirm "About to run 'manage.py migrate --noinput', which will drop the ProductCategory.parent column. Continue?"
        if ! docker compose exec -T backend python manage.py migrate --noinput; then
            error "Migration failed. Investigate before proceeding — do not run delete_orphaned_parent_categories yet."
            exit 1
        fi
        log "Migrations applied."
    fi

    info "Verifying the parent_id column is actually gone from api_productcategory..."
    local pg_service
    pg_service=$(get_postgres_service)
    local column_check
    column_check=$(docker compose exec -T "$pg_service" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
        "SELECT column_name FROM information_schema.columns WHERE table_name='api_productcategory' AND column_name='parent_id';" \
        2>/dev/null | tr -d '\r\n' || true)

    if [ -n "$column_check" ]; then
        error "Column 'parent_id' still exists on api_productcategory after migration. Something is wrong."
        exit 1
    fi
    log "Confirmed: parent_id column has been dropped from api_productcategory."
}

cleanup_orphans() {
    section "STEP 4/6 — Cleaning up orphaned former-parent ProductCategory rows"

    info "Dry run first (preview only, no deletions)..."
    docker compose exec -T backend python manage.py delete_orphaned_parent_categories --dry-run 2>&1 | tee "$CLEANUP_LOG"

    if grep -q "No orphaned former-parent categories found" "$CLEANUP_LOG"; then
        log "Nothing to clean up."
        return 0
    fi

    echo ""
    warn "Review the candidates above (also saved to: $CLEANUP_LOG)."
    confirm "Proceed with deleting these orphaned former-parent categories?"

    docker compose exec -T backend python manage.py delete_orphaned_parent_categories 2>&1 | tee -a "$CLEANUP_LOG"
    log "Cleanup complete."
}

clear_caches() {
    section "STEP 5/6 — Clearing Redis cache (defensive — versioned cache keys already changed)"
    if docker compose exec -T backend python manage.py shell -c \
        "from django.core.cache import cache; cache.clear(); print('cache cleared')" 2>/dev/null | grep -q "cache cleared"; then
        log "Redis cache cleared."
    else
        warn "Could not confirm cache clear (non-critical — versioned cache keys already prevent stale reads)."
    fi
}

run_health_checks() {
    section "STEP 6/6 — Health checks + live category API smoke test"

    if [ -x "$SCRIPT_DIR/health_check.sh" ]; then
        if ! "$SCRIPT_DIR/health_check.sh"; then
            warn "health_check.sh reported failures — review output above before considering this done."
        fi
    else
        warn "health_check.sh not found, skipping full health check."
    fi

    info "Smoke-testing /api/categories/ and /api/category-groups/ via nginx..."
    local cat_status groups_status
    cat_status=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1/api/categories/ || echo "000")
    groups_status=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1/api/category-groups/ || echo "000")

    if [ "$cat_status" = "200" ]; then
        log "/api/categories/ responded 200"
    else
        error "/api/categories/ responded $cat_status"
    fi
    if [ "$groups_status" = "200" ]; then
        log "/api/category-groups/ responded 200"
    else
        error "/api/category-groups/ responded $groups_status"
    fi

    if [ "$cat_status" != "200" ] || [ "$groups_status" != "200" ]; then
        error "One or more category endpoints are not healthy. Investigate before signing off."
        exit 1
    fi
}

main() {
    section "Category System Redesign — STAGE 2 (schema finalize + cleanup)"
    load_env
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
