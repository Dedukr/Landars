#!/bin/bash

#######################################################################################
# Category System Redesign — STAGE 1 (data migration)
#
# Moves ProductCategory parent/child data into CategoryGroup membership and strips
# redundant parent-category tags off products, WITHOUT requiring the new backend/
# frontend code to be deployed yet. It does this by copying the four new, purely
# additive Django management commands directly into the CURRENTLY RUNNING backend
# container (same trick as management/fix_db_sequence.sh), so it can run against the
# OLD code that still has ProductCategory.parent — the model field these commands
# read from.
#
# WHY A TWO-STAGE ROLLOUT:
#   The full code diff removes `ProductCategory.parent` from models.py (see
#   backend/api/migrations/0053_alter_productcategory_options_and_more.py). Once that
#   code is deployed, `.parent` / `.subcategories` no longer exist on the ORM model, so
#   the data-migration commands below can no longer run. They must run BEFORE that
#   deploy, against the OLD running backend image. Stage 2
#   (category_migration_stage2_finalize.sh) runs AFTER you deploy the full diff.
#
# PREREQUISITE ON THIS SERVER (before running this script):
#   Pull/checkout the commit containing the category redesign so the following files
#   exist on disk in this repo checkout (they are NOT run from the Docker image yet,
#   only copied out of your working tree):
#     backend/api/management/commands/audit_category_parent_tree.py
#     backend/api/management/commands/migrate_parent_categories_to_groups.py
#     backend/api/management/commands/strip_parent_categories_from_products.py
#     backend/api/management/commands/validate_category_group_migration.py
#   Do NOT run `docker compose build` / `docker compose pull` / restart the backend
#   yet — the running container must still be the OLD image for this script to work.
#
# WHAT THIS SCRIPT DOES, IN ORDER (matches exactly what was done on dev):
#   1. Pre-flight checks (docker up, backend running, source files present, running
#      backend still has the old `parent` field — i.e. wrong-stage guard).
#   2. Full Postgres backup via management/pg_backup.sh.
#   3. Copy the 4 new command files into the live backend container and confirm
#      Django can see them.
#   4. Run audit_category_parent_tree (read-only) — captures a baseline count of
#      leaf-category product tags and surfaces any edge cases (3+ level chains,
#      parent categories directly tagged on products, group/parent overlaps).
#   5. Run migrate_parent_categories_to_groups (idempotent) — creates/merges a
#      CategoryGroup per structural parent category, with its children as members.
#   6. Run strip_parent_categories_from_products (idempotent) — removes parent-
#      category tags from products, never leaving a product with zero categories
#      (skips + logs those instead of guessing).
#   7. Run validate_category_group_migration against the captured baseline (and any
#      skipped-product ids from step 6) — hard-fails the script if anything is off.
#   8. Writes a completion marker + summary so stage 2 can confirm stage 1 ran.
#
# This script is safe to re-run: every step it triggers is idempotent, and it will
# refuse to proceed if it detects it has already run past a given point incorrectly.
#
# Usage:
#   ./management/category_migration_stage1_data.sh [--yes]
#
#   --yes    Skip interactive confirmation prompts (for unattended/CI use). Backups
#            are still always taken.
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
AUDIT_LOG="$LOG_DIR/category_migration_stage1_audit_${STAMP}.log"
STRIP_LOG="$LOG_DIR/category_migration_stage1_strip_${STAMP}.log"
MARKER_FILE="$LOG_DIR/.category_migration_stage1_complete"

ASSUME_YES=false
for arg in "$@"; do
    case "$arg" in
        --yes|-y) ASSUME_YES=true ;;
        --help|-h)
            sed -n '3,60p' "$0"
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

COMMAND_FILES=(
    "audit_category_parent_tree.py"
    "migrate_parent_categories_to_groups.py"
    "strip_parent_categories_from_products.py"
    "validate_category_group_migration.py"
)
COMMANDS_SRC_DIR="$PROJECT_DIR/backend/api/management/commands"
COMMANDS_DST_DIR="/backend/api/management/commands"

get_backend_container() {
    local cid
    cid=$(cd "$PROJECT_DIR" && docker compose ps -q backend 2>/dev/null | head -1)
    if [ -z "$cid" ]; then
        error "Could not find a running 'backend' container (docker compose ps -q backend was empty)."
        exit 1
    fi
    echo "$cid"
}

preflight() {
    section "STEP 1/8 — Pre-flight checks"

    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running."
        exit 1
    fi
    log "Docker is running"

    cd "$PROJECT_DIR"
    if [ ! -f "docker-compose.yml" ]; then
        error "docker-compose.yml not found in $PROJECT_DIR"
        exit 1
    fi

    BACKEND_CID=$(get_backend_container)
    log "Found running backend container: $BACKEND_CID"

    for f in "${COMMAND_FILES[@]}"; do
        if [ ! -f "$COMMANDS_SRC_DIR/$f" ]; then
            error "Missing source file: $COMMANDS_SRC_DIR/$f"
            error "Pull/checkout the category-redesign commit on this server before running stage 1."
            exit 1
        fi
    done
    log "All 4 stage-1 management command source files found on disk"

    if [ -f "$MARKER_FILE" ]; then
        warn "Stage 1 already completed previously: $(cat "$MARKER_FILE")"
        confirm "Re-run stage 1 anyway? (safe/idempotent, but confirm this is intentional)"
    fi

    # Wrong-stage guard: if the running backend image ALREADY has `parent` removed,
    # the new code has already been deployed and stage 1 no longer applies here.
    info "Checking the currently running backend image still has ProductCategory.parent..."
    local has_parent
    has_parent=$(docker compose exec -T backend python -c \
        "from api.models import ProductCategory; print(hasattr(ProductCategory, 'parent'))" \
        2>/dev/null | tr -d '\r\n' || true)

    if [ "$has_parent" != "True" ]; then
        error "The running backend container does NOT have ProductCategory.parent (got: '${has_parent:-empty}')."
        error "This means the full code has already been deployed to this container."
        error "Stage 1 must run against the OLD backend image, before that deploy."
        error "If stage 1 data migration already ran successfully before this deploy, skip to:"
        error "  ./management/category_migration_stage2_finalize.sh"
        exit 1
    fi
    log "Confirmed: running backend still has the old parent/child schema — safe to proceed."

    mkdir -p "$LOG_DIR"
}

do_backup() {
    section "STEP 2/8 — Full PostgreSQL backup (before any data changes)"
    if [ ! -x "$SCRIPT_DIR/pg_backup.sh" ]; then
        error "$SCRIPT_DIR/pg_backup.sh not found or not executable. Refusing to proceed without a backup."
        exit 1
    fi
    if ! "$SCRIPT_DIR/pg_backup.sh" backup; then
        error "Backup failed. Aborting — do not proceed with data migration without a verified backup."
        exit 1
    fi
    log "Backup completed successfully."
}

copy_commands() {
    section "STEP 3/8 — Injecting stage-1 management commands into the running backend container"
    for f in "${COMMAND_FILES[@]}"; do
        docker cp "$COMMANDS_SRC_DIR/$f" "$BACKEND_CID:$COMMANDS_DST_DIR/$f"
        log "Copied $f into container $BACKEND_CID"
    done

    info "Verifying Django can see the new commands..."
    local help_output
    help_output=$(docker compose exec -T backend python manage.py help 2>/dev/null || true)
    for f in "${COMMAND_FILES[@]}"; do
        local cmd_name="${f%.py}"
        if ! echo "$help_output" | grep -q "$cmd_name"; then
            error "Command '$cmd_name' did not register with Django after copying. Aborting."
            exit 1
        fi
    done
    log "All 4 commands are registered and runnable."
}

run_audit() {
    section "STEP 4/8 — Read-only audit (captures baseline, surfaces edge cases)"
    docker compose exec -T backend python manage.py audit_category_parent_tree 2>&1 | tee "$AUDIT_LOG"

    BASELINE_TOTAL=$(grep -oE 'Total leaf-category product tags: [0-9]+' "$AUDIT_LOG" | grep -oE '[0-9]+' | tail -1 || true)
    if [ -z "${BASELINE_TOTAL:-}" ]; then
        error "Could not extract baseline leaf-category tag total from audit output. Aborting."
        exit 1
    fi
    log "Captured baseline leaf-category product tag total: $BASELINE_TOTAL"

    if grep -qi "has children AND is directly tagged" "$AUDIT_LOG"; then
        warn "Audit found parent categories directly tagged on products — strip_parent_categories_from_products will handle these safely (skip+log if it would zero out a product's categories)."
    fi
    if grep -q "3+ level chains" "$AUDIT_LOG" && ! grep -q "None found — tree is at most 2 levels deep." "$AUDIT_LOG"; then
        warn "Audit found 3+ level category chains. Review $AUDIT_LOG carefully before continuing —"
        warn "these are flattened by migrate_parent_categories_to_groups but you should sanity-check the result."
        confirm "Continue despite 3+ level chains being present?"
    fi

    echo ""
    warn "Review the audit output above (also saved to: $AUDIT_LOG)."
    confirm "Proceed with migrating parent categories into CategoryGroups?"
}

run_migrate_groups() {
    section "STEP 5/8 — Migrating parent categories into CategoryGroups (idempotent)"
    docker compose exec -T backend python manage.py migrate_parent_categories_to_groups
}

run_strip_products() {
    section "STEP 6/8 — Stripping parent-category tags from products (idempotent, never zeroes a product's categories)"
    docker compose exec -T backend python manage.py strip_parent_categories_from_products 2>&1 | tee "$STRIP_LOG"

    SKIPPED_IDS=$(grep -oE 'SKIPPED product .* \(id=[0-9]+\)' "$STRIP_LOG" | grep -oE 'id=[0-9]+' | grep -oE '[0-9]+' | paste -sd, - || true)
    if [ -n "${SKIPPED_IDS:-}" ]; then
        warn "Some products were left with a parent-category tag intact (would have hit zero categories): $SKIPPED_IDS"
        warn "These are passed to validation as an explicit allow-list. Review and re-tag them with a proper"
        warn "leaf category when convenient, then re-run this script (steps are idempotent)."
    else
        log "No products were skipped — every product ended up with only leaf categories."
    fi
}

run_validate() {
    section "STEP 7/8 — Validating migration integrity against the captured baseline"
    local allow_arg=()
    if [ -n "${SKIPPED_IDS:-}" ]; then
        allow_arg=(--allow-parent-tags-on="$SKIPPED_IDS")
    fi

    if ! docker compose exec -T backend python manage.py validate_category_group_migration \
        --baseline-total="$BASELINE_TOTAL" "${allow_arg[@]:-}"; then
        error "VALIDATION FAILED. Do NOT proceed to deploying the full code / stage 2."
        error "The database has NOT had its schema changed — data is still recoverable/inspectable as-is."
        error "If you need to fully undo the CategoryGroup/product changes made so far, restore the backup"
        error "taken in step 2 via: ./management/pg_backup.sh restore <backup_file> --promote"
        exit 1
    fi
    log "Validation passed."
}

write_marker() {
    section "STEP 8/8 — Recording stage-1 completion"
    {
        echo "completed_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        echo "baseline_leaf_category_tag_total=$BASELINE_TOTAL"
        echo "skipped_product_ids=${SKIPPED_IDS:-none}"
        echo "audit_log=$AUDIT_LOG"
        echo "strip_log=$STRIP_LOG"
    } > "$MARKER_FILE"
    log "Wrote completion marker: $MARKER_FILE"
}

main() {
    section "Category System Redesign — STAGE 1 (data migration)"
    load_env
    preflight
    confirm "This will back up the database and then migrate category data (categories into CategoryGroups, strip redundant parent tags from products). Continue?"
    do_backup
    copy_commands
    run_audit
    run_migrate_groups
    run_strip_products
    run_validate
    write_marker

    section "✅ STAGE 1 COMPLETE"
    cat <<EOF

Data migration is done and validated. The database now has:
  - A CategoryGroup for every former structural parent category, with its former
    children as members.
  - Products tagged only with leaf categories (except any explicitly flagged/allowed
    ids listed above, which are safe to leave as-is or fix manually later).

NEXT STEPS (do NOT skip):
  1. Deploy the full code changes normally (models.py parent-field removal + the
     auto-generated migration 0053_alter_productcategory_options_and_more, updated
     admin/serializers/views/services, and the frontend rebuild), e.g. via your usual:
       ./management/deploy.sh
     This will apply the schema migration that drops ProductCategory.parent.
  2. Once that deploy is confirmed healthy, run:
       ./management/category_migration_stage2_finalize.sh

EOF
}

main "$@"
