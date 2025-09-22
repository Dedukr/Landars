# Custom PostgreSQL Dockerfile with WAL Archiving Support
FROM postgres:15-alpine

# Install additional packages for WAL archiving
RUN apk add --no-cache \
    bash \
    coreutils \
    findutils

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
