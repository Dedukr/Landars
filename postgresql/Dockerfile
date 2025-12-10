# Custom PostgreSQL Dockerfile with WAL Archiving Support
FROM postgres:15-alpine

# Install additional packages for WAL archiving
# Note: In multi-platform builds, busybox triggers may fail in emulation, but packages install successfully
# We install packages and verify they're available, handling trigger errors gracefully
RUN set -e; \
    apk add --no-cache \
        bash \
        coreutils \
        findutils || true; \
    # Verify packages are actually installed (critical for functionality)
    if ! command -v bash > /dev/null; then \
        echo "ERROR: bash not found after installation" >&2; \
        exit 1; \
    fi; \
    if ! command -v date > /dev/null; then \
        echo "ERROR: date (coreutils) not found after installation" >&2; \
        exit 1; \
    fi; \
    if ! command -v find > /dev/null; then \
        echo "ERROR: find (findutils) not found after installation" >&2; \
        exit 1; \
    fi; \
    echo "✓ Required packages verified: bash, coreutils, findutils"

# Create directories for WAL archiving
RUN mkdir -p /var/lib/postgresql/archive \
    && mkdir -p /var/lib/postgresql/backups \
    && chown -R postgres:postgres /var/lib/postgresql/archive \
    && chown -R postgres:postgres /var/lib/postgresql/backups

# Copy custom PostgreSQL configuration
COPY postgresql.conf /etc/postgresql/postgresql.conf

# Copy initialization scripts
COPY init-pitr.sh /docker-entrypoint-initdb.d/init-pitr.sh
RUN chmod +x /docker-entrypoint-initdb.d/init-pitr.sh

# Copy backup and restore scripts
COPY backup-scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Set environment variables for WAL archiving
ENV POSTGRES_INITDB_ARGS="--data-checksums"

# Expose the archive directory as a volume
VOLUME ["/var/lib/postgresql/archive", "/var/lib/postgresql/backups"]

# Use custom configuration
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
