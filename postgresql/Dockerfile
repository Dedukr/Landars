# Custom PostgreSQL Dockerfile with WAL Archiving Support
FROM postgres:15-alpine

# Install additional packages for WAL archiving
# Note: In multi-platform builds (especially arm64 emulation), package triggers may fail
# even though packages install successfully. We handle this by verifying installation.
RUN set -euo pipefail; \
    # Install packages (allow non-zero exit due to trigger failures in emulation)
    apk add --no-cache \
        bash \
        coreutils \
        findutils || \
    # If installation failed, verify packages are actually installed
    ( \
        echo "Warning: Package installation reported errors (likely trigger failures in emulation)" >&2; \
        # Verify all required packages are present
        command -v bash > /dev/null && \
        command -v date > /dev/null && \
        command -v find > /dev/null && \
        echo "Packages verified: installation successful despite trigger errors" \
    ) || \
    ( \
        echo "ERROR: Required packages failed to install" >&2; \
        echo "Missing packages:" >&2; \
        command -v bash > /dev/null || echo "  - bash" >&2; \
        command -v date > /dev/null || echo "  - coreutils (date)" >&2; \
        command -v find > /dev/null || echo "  - findutils (find)" >&2; \
        exit 1 \
    ); \
    echo "✓ Required packages installed and verified: bash, coreutils, findutils"

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
