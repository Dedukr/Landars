# Shared helpers for category_migration_stage1_data.sh and category_migration_stage2_finalize.sh
# Sourced by those scripts — not meant to be executed directly.

# Run docker compose (v2) or docker-compose (v1) from PROJECT_DIR.
dc() {
    (
        cd "${PROJECT_DIR:?PROJECT_DIR must be set}"
        if docker compose version > /dev/null 2>&1; then
            docker compose "$@"
        elif command -v docker-compose > /dev/null 2>&1; then
            docker-compose "$@"
        else
            echo "ERROR: neither 'docker compose' nor 'docker-compose' is available" >&2
            return 127
        fi
    )
}

# Last line of manage.py shell output (ignores Django import noise).
_django_shell_last_line() {
    local code="$1"
    local out rc
    out=$(dc exec -T backend python manage.py shell -c "$code" 2>&1) || rc=$?
    if [ "${rc:-0}" -ne 0 ]; then
        echo "ERROR:django shell failed: ${out//$'\n'/ }"
        return 1
    fi
    echo "$out" | tail -1 | tr -d '\r'
}

# Echo: True | False | ERROR:...
django_model_has_parent_field() {
    _django_shell_last_line "from api.models import ProductCategory; print(hasattr(ProductCategory, 'parent'))"
}

# Echo: present | absent | ERROR:...
django_db_has_parent_id_column() {
    _django_shell_last_line "from django.db import connection
c = connection.cursor()
c.execute(\"SELECT 1 FROM information_schema.columns WHERE table_name='api_productcategory' AND column_name='parent_id'\")
print('present' if c.fetchone() else 'absent')"
}

# Echo one of: ready_stage1 | ready_stage2 | already_complete | inconsistent | check_failed
category_migration_verdict() {
    local has_parent parent_col
    has_parent=$(django_model_has_parent_field) || true
    parent_col=$(django_db_has_parent_id_column) || true

    if [[ "$has_parent" == ERROR:* ]] || [[ "$parent_col" == ERROR:* ]]; then
        echo "check_failed"
        return 1
    fi

    if [ "$has_parent" = "True" ] && [ "$parent_col" = "present" ]; then
        echo "ready_stage1"
        return 0
    fi

    if [ "$has_parent" = "False" ] && [ "$parent_col" = "present" ]; then
        echo "ready_stage2"
        return 0
    fi

    if [ "$has_parent" = "False" ] && [ "$parent_col" = "absent" ]; then
        if [ -f "${STAGE2_MARKER_FILE:-}" ]; then
            echo "already_complete"
        else
            echo "ready_stage2"
        fi
        return 0
    fi

    echo "inconsistent"
    return 0
}

print_category_migration_status() {
    local has_parent parent_col verdict
    has_parent=$(django_model_has_parent_field) || true
    parent_col=$(django_db_has_parent_id_column) || true
    verdict=$(category_migration_verdict) || verdict="check_failed"

    echo ""
    echo "Category migration status ($(hostname 2>/dev/null || echo 'server')):"
    echo "  Project dir:              ${PROJECT_DIR}"
    echo "  Backend container:        $(dc ps -q backend 2>/dev/null | head -1 || echo 'not running')"
    echo "  Model has .parent field:  ${has_parent}"
    echo "  DB has parent_id column:  ${parent_col}"
    echo "  Stage 1 marker:           $([ -f "${MARKER_FILE:-}" ] && echo yes || echo no)"
    echo "  Stage 2 marker:           $([ -f "${STAGE2_MARKER_FILE:-}" ] && echo yes || echo no)"
    echo ""

    case "$verdict" in
        ready_stage1)
            echo "VERDICT: READY for ./management/category_migration_stage1_data.sh"
            echo ""
            echo "This is the expected state on production BEFORE the category redesign deploy."
            echo "Do NOT run ./management/deploy.sh or 'docker compose pull/up' before stage 1."
            return 0
            ;;
        ready_stage2)
            echo "VERDICT: OK — run ./management/category_migration_stage2_finalize.sh"
            echo ""
            echo "Stage 1 does not apply here (schema already migrated). Typical on dev after"
            echo "earlier testing, or on prod after deploy when stage 1 already ran."
            echo "Stage 2 does not require the stage 1 marker file in this state."
            return 0
            ;;
        already_complete)
            echo "VERDICT: Migration appears COMPLETE (stage 2 marker present)."
            return 0
            ;;
        inconsistent)
            echo "VERDICT: INCONSISTENT — manual review required"
            echo "  Model and database category schema do not match expected combinations."
            echo "  Expected after stage 1: model=True, db=present"
            echo "  Expected after rebuild (before stage 2 migrate): model=False, db=present"
            echo "  Expected after stage 2: model=False, db=absent"
            return 2
            ;;
        *)
            echo "VERDICT: CHECK FAILED — could not read schema state from backend"
            [[ "$has_parent" == ERROR:* ]] && echo "  model: ${has_parent#ERROR:}"
            [[ "$parent_col" == ERROR:* ]] && echo "  database: ${parent_col#ERROR:}"
            return 3
            ;;
    esac
}

# Quick data sanity output when stage 1 marker is missing (dev / ad-hoc migration).
print_category_data_summary() {
    local out
    out=$(_django_shell_last_line "from api.models import CategoryGroup, Product, ProductCategory
print('categories=%d groups=%d products_without_categories=%d' % (
    ProductCategory.objects.count(),
    CategoryGroup.objects.count(),
    Product.objects.filter(categories__isnull=True).distinct().count(),
))") || true
    if [[ "$out" != ERROR:* ]]; then
        info "Data summary: $out"
    fi
}

# GET $path via nginx (localhost/https) or directly on the backend container. Prints "CODE url".
curl_api_smoke() {
    local path="$1"
    local url status backend_status

    for url in \
        "https://localhost${path}" \
        "http://localhost${path}" \
        "https://127.0.0.1${path}" \
        "http://127.0.0.1${path}"; do
        status=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || true)
        if [ "$status" = "200" ]; then
            echo "200 $url"
            return 0
        fi
    done

    backend_status=$(_django_shell_last_line "import urllib.request
try:
    r = urllib.request.urlopen('http://127.0.0.1:8000${path}', timeout=8)
    print(r.status)
except Exception:
    print(0)" 2>/dev/null || echo "0")

    if [ "$backend_status" = "200" ]; then
        echo "200 http://backend:8000${path}"
        return 0
    fi

    echo "${status:-000} (no nginx/backend response)"
    return 1
}
