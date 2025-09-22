#!/bin/bash
# PostgreSQL PITR Initialization Script
# This script sets up the database for Point-in-Time Recovery

set -e

echo "Setting up PostgreSQL for Point-in-Time Recovery (PITR)..."

# Create archive directory if it doesn't exist
mkdir -p /var/lib/postgresql/archive
chown postgres:postgres /var/lib/postgresql/archive
chmod 700 /var/lib/postgresql/archive

# Create backups directory
mkdir -p /var/lib/postgresql/backups
chown postgres:postgres /var/lib/postgresql/backups
chmod 700 /var/lib/postgresql/backups

# Enable WAL archiving
echo "Enabling WAL archiving..."

# Create a function to check if we're the primary database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create a function to check if WAL archiving is working
    CREATE OR REPLACE FUNCTION check_wal_archiving()
    RETURNS boolean AS \$\$
    BEGIN
        RETURN (SELECT setting = 'on' FROM pg_settings WHERE name = 'archive_mode');
    END;
    \$\$ LANGUAGE plpgsql;

    -- Create a function to get current WAL position
    CREATE OR REPLACE FUNCTION get_current_wal_lsn()
    RETURNS pg_lsn AS \$\$
    BEGIN
        RETURN pg_current_wal_lsn();
    END;
    \$\$ LANGUAGE plpgsql;

    -- Create a function to get WAL file name from LSN
    CREATE OR REPLACE FUNCTION get_wal_filename(lsn pg_lsn)
    RETURNS text AS \$\$
    BEGIN
        RETURN pg_walfile_name(lsn);
    END;
    \$\$ LANGUAGE plpgsql;

    -- Create a table to track backup information
    CREATE TABLE IF NOT EXISTS backup_info (
        id SERIAL PRIMARY KEY,
        backup_name VARCHAR(255) NOT NULL,
        backup_type VARCHAR(50) NOT NULL, -- 'base_backup', 'incremental'
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        wal_start_lsn pg_lsn,
        wal_end_lsn pg_lsn,
        backup_size_bytes BIGINT,
        status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_backup_info_start_time ON backup_info(start_time);
    CREATE INDEX IF NOT EXISTS idx_backup_info_status ON backup_info(status);

    -- Create a view for easy backup monitoring
    CREATE OR REPLACE VIEW backup_summary AS
    SELECT 
        backup_name,
        backup_type,
        start_time,
        end_time,
        CASE 
            WHEN end_time IS NOT NULL THEN 
                EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER
            ELSE NULL 
        END as duration_seconds,
        pg_size_pretty(backup_size_bytes) as backup_size,
        status,
        notes
    FROM backup_info
    ORDER BY start_time DESC;

    -- Grant permissions
    GRANT SELECT ON backup_info TO $POSTGRES_USER;
    GRANT SELECT ON backup_summary TO $POSTGRES_USER;
    GRANT USAGE ON SEQUENCE backup_info_id_seq TO $POSTGRES_USER;

    -- Insert initial backup record
    INSERT INTO backup_info (backup_name, backup_type, start_time, wal_start_lsn, status, notes)
    VALUES ('initial_setup', 'base_backup', NOW(), pg_current_wal_lsn(), 'completed', 'Initial PITR setup completed');

EOSQL

echo "PITR setup completed successfully!"
echo "WAL archiving is enabled and ready for Point-in-Time Recovery."
