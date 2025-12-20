# Custom PostgreSQL Dockerfile with WAL-G WAL archiving support (Debian-based)
FROM postgres:15

# Build arguments for version control
ARG WAL_G_VERSION=v2.0.1

# Install system dependencies (Debian/Ubuntu style)
RUN set -euo pipefail; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    findutils \
    curl \
    ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    command -v bash >/dev/null; \
    command -v date >/dev/null; \
    command -v find >/dev/null; \
    command -v curl >/dev/null; \
    echo "✓ System packages installed successfully"

# Install WAL-G for Postgres (downloads the correct arch asset, extracts real binary name safely)
RUN set -euo pipefail; \
    ARCH="$(uname -m)"; \
    case "$ARCH" in \
    aarch64|arm64) WAL_G_ARCH="aarch64" ;; \
    x86_64|amd64)  WAL_G_ARCH="amd64" ;; \
    *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac; \
    \
    # WAL-G release assets sometimes use ubuntu-20.04 vs ubuntu20.04 naming
    for F in \
    "wal-g-pg-ubuntu-20.04-${WAL_G_ARCH}.tar.gz" \
    "wal-g-pg-ubuntu20.04-${WAL_G_ARCH}.tar.gz" \
    ; do \
    echo "Trying ${F}..."; \
    if curl -fsSL "https://github.com/wal-g/wal-g/releases/download/${WAL_G_VERSION}/${F}" -o /tmp/wal-g.tar.gz; then \
    WAL_G_FILE="$F"; \
    break; \
    fi; \
    done; \
    test -n "${WAL_G_FILE:-}"; \
    echo "Downloaded: ${WAL_G_FILE}"; \
    \
    # Find actual binary path inside archive instead of guessing
    BIN_PATH="$(tar -tzf /tmp/wal-g.tar.gz | grep -E '(^|/)(wal-g(-pg)?)([^/]+)?$' | head -n 1)"; \
    test -n "$BIN_PATH"; \
    tar -xzf /tmp/wal-g.tar.gz -C /tmp "$BIN_PATH"; \
    \
    # Move to final location
    mv "/tmp/$BIN_PATH" /usr/local/bin/wal-g; \
    chmod +x /usr/local/bin/wal-g; \
    rm -f /tmp/wal-g.tar.gz; \
    wal-g --version; \
    echo "✓ wal-g installed successfully"

# Create directories for WAL archiving / backups with proper permissions
RUN set -euo pipefail; \
    mkdir -p \
    /var/lib/postgresql/archive \
    /var/lib/postgresql/archive/basebackups \
    /var/lib/postgresql/backups; \
    chown -R postgres:postgres /var/lib/postgresql/archive /var/lib/postgresql/backups; \
    chmod 755 /var/lib/postgresql/archive /var/lib/postgresql/backups

# Copy custom PostgreSQL configuration
COPY postgresql.conf /etc/postgresql/postgresql.conf

# Copy wal-g archive and restore scripts
COPY wal-g-archive.sh /usr/local/bin/wal-g-archive.sh
COPY wal-g-restore.sh /usr/local/bin/wal-g-restore.sh
COPY validate-wal-archiving.sh /usr/local/bin/validate-wal-archiving.sh

# Copy initialization scripts (runs on first init of PGDATA)
COPY init-pitr.sh /docker-entrypoint-initdb.d/init-pitr.sh

# Copy backup and restore scripts
COPY backup-scripts/ /usr/local/bin/backup-scripts/

# Set executable permissions for all scripts
RUN set -euo pipefail; \
    chmod +x \
    /usr/local/bin/wal-g-archive.sh \
    /usr/local/bin/wal-g-restore.sh \
    /usr/local/bin/validate-wal-archiving.sh \
    /docker-entrypoint-initdb.d/init-pitr.sh; \
    find /usr/local/bin/backup-scripts -name "*.sh" -type f -exec chmod +x {} \; || true

# Enable checksums on initdb (only applies on first cluster init)
ENV POSTGRES_INITDB_ARGS="--data-checksums"

# Expose the archive and backup directories as volumes
VOLUME ["/var/lib/postgresql/archive", "/var/lib/postgresql/backups"]

# Use custom PostgreSQL configuration
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]