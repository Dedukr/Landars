#!/bin/bash
# Shared fail-closed policy for backup uploads and remote retention cleanup.
# Reads from production S3 remain available regardless of this policy.
cloud_storage_writes_allowed() {
    case "${URL_BASE:-https://localhost}" in
        http://localhost*|https://localhost*|http://127.0.0.1*|https://127.0.0.1*|http://\[::1\]*|https://\[::1\]*|http://0.0.0.0*|https://0.0.0.0*) return 1 ;;
    esac
    case "${APP_ENV:-}" in
        development) return 1 ;;
        production|"") ;;
        *) return 1 ;;
    esac
    case "${DEBUG:-True}" in
        False|false|0) return 0 ;;
        *) return 1 ;;
    esac
}

# archive_command and backup uploads return success without a remote copy when
# writes are blocked. That is expected for APP_ENV=development. An empty or
# production APP_ENV means the process was supposed to reach S3.
warn_if_cloud_write_blocked_unexpectedly() {
    case "${APP_ENV:-}" in
        ""|production)
            local message="WARNING: cloud storage write blocked (APP_ENV=${APP_ENV:-unset} DEBUG=${DEBUG:-unset} URL_BASE=${URL_BASE:-unset}). Data stays local and was not uploaded to S3."
            if declare -F log_warning >/dev/null 2>&1; then
                log_warning "$message"
            else
                echo "$message" >&2
            fi
            ;;
    esac
}

# Keep the local WAL directory from filling the archive volume. WAL_RETENTION_DAYS
# matches management/pg_backup.sh (default 14). Prune failure must not fail
# archive_command after the segment has been copied.
prune_development_wal_archive() {
    local dir="${1:-}"
    local days="${WAL_RETENTION_DAYS:-14}"
    case "$days" in
        ''|*[!0-9]*) days=14 ;;
    esac
    if [ "${days}" -lt 1 ]; then
        days=14
    fi
    if [ -z "$dir" ] || [ ! -d "$dir" ]; then
        return 0
    fi
    find "$dir" -type f -mtime "+${days}" -delete || \
        echo "WARNING: could not prune development WAL archive ${dir}" >&2
}
