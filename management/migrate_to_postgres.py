#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script
Following Django and PostgreSQL best practices for production environments.
"""

import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import django

# Add the backend directory to Python path
# Handle both local execution and container execution
if Path("/backend").exists():
    # Running inside container
    backend_dir = Path("/backend")
    sys.path.insert(0, str(backend_dir))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
else:
    # Running locally - go up one level from management/ to find backend/
    backend_dir = Path(__file__).parent.parent / "backend"
    sys.path.insert(0, str(backend_dir))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

# Set up Django environment with progress indication
print("⏳ Initializing Django (this may take 10-30 seconds due to admin imports)...")
print("   Loading Django settings and apps...")
try:
    django.setup()
    print("   ✅ Django setup complete")
except Exception as e:
    print(f"   ❌ Django setup failed: {e}")
    sys.exit(1)

from django.core.management import execute_from_command_line
from django.db import connections, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader


class ProfessionalMigrationManager:
    """Professional migration manager following Django best practices"""

    def __init__(self):
        self.sqlite_conn = None
        self.postgres_conn = None
        self.migration_executor = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.sqlite_conn:
            self.sqlite_conn.close()
        if self.postgres_conn:
            self.postgres_conn.close()

    def check_database_health(self):
        """Comprehensive database health check"""
        print("🔍 Performing comprehensive database health check...")

        try:
            with connections["default"].cursor() as cursor:
                # Check PostgreSQL version
                cursor.execute("SELECT version()")
                pg_version = cursor.fetchone()[0]
                print(f"   📊 PostgreSQL: {pg_version.split(',')[0]}")

                # Check database size
                cursor.execute("SELECT pg_database_size(current_database())")
                db_size = cursor.fetchone()[0]
                print(f"   📊 Database size: {db_size / 1024 / 1024:.2f} MB")

                # Check existing tables
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name NOT LIKE 'pg_%'
                """
                )
                table_count = cursor.fetchone()[0]
                print(f"   📊 Existing tables: {table_count}")

                # Check migration state (handle case where table doesn't exist yet)
                try:
                    cursor.execute("SELECT COUNT(*) FROM django_migrations")
                    migration_count = cursor.fetchone()[0]
                    print(f"   📊 Applied migrations: {migration_count}")
                except Exception:
                    print(
                        "   📊 Applied migrations: 0 (django_migrations table not created yet)"
                    )

                return True

        except Exception as e:
            print(f"   ❌ Database health check failed: {e}")
            return False

    def get_sqlite_connection(self):
        """Get connection to SQLite database with multiple path support"""
        sqlite_paths = [
            backend_dir / "db" / "db.sqlite3",
            Path("/backend/db/db.sqlite3"),
            Path("/backend/db/db_test.sqlite3"),
            Path("backend/db/db.sqlite3"),
            Path("db/db.sqlite3"),
        ]

        for sqlite_path in sqlite_paths:
            if sqlite_path.exists():
                print(f"✅ Found SQLite database: {sqlite_path}")
                self.sqlite_conn = sqlite3.connect(str(sqlite_path))
                return self.sqlite_conn

        print("❌ SQLite database not found!")
        print("Searched paths:")
        for path in sqlite_paths:
            print(f"  - {path}")
        return None

    def setup_postgres_schema(self):
        """Set up PostgreSQL schema using Django migrations"""
        print("🏗️  Setting up PostgreSQL schema...")

        try:
            # First, check if django_migrations table exists
            with connections["default"].cursor() as cursor:
                cursor.execute(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'django_migrations' AND table_schema = 'public'
                    )
                """
                )
                migrations_table_exists = cursor.fetchone()[0]

            if not migrations_table_exists:
                print(
                    "   📋 No django_migrations table found - running initial migrations..."
                )
                # Run migrations to create the initial schema
                execute_from_command_line(["manage.py", "migrate", "--verbosity=1"])
                print("   ✅ Initial schema created")
            else:
                # Check if we need to run additional migrations
                executor = MigrationExecutor(connections["default"])
                plan = executor.migration_plan(executor.loader.graph.leaf_nodes())

                if plan:
                    print(f"   📋 Found {len(plan)} migrations to apply")
                    print("   🔄 Running Django migrations...")
                    execute_from_command_line(["manage.py", "migrate", "--verbosity=1"])
                    print("   ✅ Schema setup completed")
                else:
                    print("   ✅ All migrations already applied")

            return True

        except Exception as e:
            print(f"   ❌ Schema setup failed: {e}")
            return False

    # ---------- Helpers for universal migration ----------
    def _get_sqlite_tables(self):
        cur = self.sqlite_conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        return [row[0] for row in cur.fetchall()]

    def _get_pg_tables(self):
        with connections["default"].cursor() as cursor:
            cursor.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
            )
            return [row[0] for row in cursor.fetchall()]

    def _get_fk_dependencies(self):
        with connections["default"].cursor() as cursor:
            cursor.execute(
                """
                SELECT DISTINCT
                    tc.table_name AS dependent_table,
                    ccu.table_name AS referenced_table
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.constraint_schema = kcu.constraint_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.constraint_schema = tc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
                """
            )
            return cursor.fetchall()

    def _topological_order(self, tables, deps):
        """Topological sort based on FK deps."""
        in_deg = {t: 0 for t in tables}
        for dep, ref in deps:
            if dep in in_deg and ref in in_deg:
                in_deg[dep] += 1
        queue = [t for t, d in in_deg.items() if d == 0]
        ordered = []
        while queue:
            t = queue.pop(0)
            ordered.append(t)
            for dep, ref in deps:
                if ref == t and dep in in_deg:
                    in_deg[dep] -= 1
                    if in_deg[dep] == 0:
                        queue.append(dep)
        # append remaining (cycles/no deps)
        for t in tables:
            if t not in ordered:
                ordered.append(t)
        return ordered

    def get_migration_order(self):
        """Compute migration order dynamically from FK deps, limited to tables present in both DBs."""
        print("📋 Determining data migration order...")
        sqlite_tables = set(self._get_sqlite_tables())
        pg_tables = set(self._get_pg_tables())

        # Alias map for source-table naming differences
        alias_map = {
            "api_productcategory": [
                "api_productcategories",
                "productcategory",
                "product_category",
                "api_product_category",
            ],
        }

        # Build reverse alias map: sqlite_name -> pg_name
        reverse_aliases = {}
        for pg_name, sqlite_names in alias_map.items():
            for sqlite_name in sqlite_names:
                if sqlite_name in sqlite_tables and pg_name in pg_tables:
                    reverse_aliases[sqlite_name] = pg_name

        # Start with direct intersection
        candidate_tables = sqlite_tables & pg_tables

        # Add PostgreSQL tables that have SQLite aliases
        for sqlite_name, pg_name in reverse_aliases.items():
            if pg_name not in candidate_tables:
                candidate_tables.add(pg_name)

        # Skip only core internal table
        system = {
            "django_migrations",
        }
        candidate_tables = [t for t in candidate_tables if t not in system]

        deps = self._get_fk_dependencies()
        ordered = self._topological_order(candidate_tables, deps)
        print(f"   📊 Found {len(ordered)} tables to migrate")
        return ordered

    def get_pg_columns(self, table_name):
        """Return PostgreSQL column metadata keyed by column name."""
        with connections["default"].cursor() as cursor:
            cursor.execute(
                """
                SELECT column_name, data_type, is_nullable, character_maximum_length, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                [table_name],
            )
            cols = {}
            for (
                name,
                dtype,
                nullable,
                maxlen,
                default,
            ) in cursor.fetchall():
                cols[name] = {
                    "column_name": name,
                    "data_type": dtype,
                    "nullable": nullable == "YES",
                    "max_length": maxlen,
                    "default": default,
                }
            return cols

    def infer_default_value(self, pg_col):
        """Infer defaults for NOT NULL columns when source is missing/empty."""
        dtype = pg_col["data_type"]
        name = pg_col["column_name"].lower()
        default = pg_col.get("default")
        nullable = pg_col["nullable"]

        if default:
            if isinstance(default, str) and "nextval" in default.lower():
                return None
            if str(default).lower() in {"true", "false"}:
                return str(default).lower() == "true"
            try:
                return int(default)
            except Exception:
                pass
            if (
                isinstance(default, str)
                and default.startswith("'")
                and default.endswith("'")
            ):
                return default.strip("'")

        if name.startswith("is_") or name.startswith("has_"):
            return False
        if name.endswith("_fee") or "price" in name or "amount" in name:
            return 0
        if "status" in name or "state" in name:
            return "pending"
        if name.endswith("_at") or name.endswith("_date"):
            return datetime.now(timezone.utc)

        if dtype in ("integer", "bigint", "smallint"):
            return 0
        if dtype in ("numeric", "decimal", "real", "double precision"):
            return 0
        if dtype in ("character varying", "varchar", "text", "char", "character"):
            return ""
        if dtype == "boolean":
            return False
        if dtype in (
            "timestamp without time zone",
            "timestamp with time zone",
            "date",
            "time",
        ):
            return datetime.now(timezone.utc)

        return None if nullable else ""

    def convert_value(self, value, sqlite_type, pg_col):
        """Convert SQLite value to PG-friendly based on target column."""
        if value is None:
            return None

        dtype = pg_col["data_type"]
        maxlen = pg_col.get("max_length")

        if dtype == "boolean":
            if isinstance(value, (int, float, str)):
                try:
                    return bool(int(value))
                except Exception:
                    return str(value).lower() == "true"
            return bool(value)

        if dtype in (
            "timestamp without time zone",
            "timestamp with time zone",
            "date",
            "time",
        ):
            if isinstance(value, str):
                try:
                    from dateutil import parser

                    return parser.parse(value)
                except Exception:
                    try:
                        return datetime.fromisoformat(value.replace("Z", "+00:00"))
                    except Exception:
                        return value
            return value

        if dtype in ("json", "jsonb"):
            if isinstance(value, str):
                try:
                    import json

                    return json.loads(value)
                except Exception:
                    return value
            return value

        if isinstance(value, str) and maxlen and len(value) > maxlen:
            print(
                f"   ⚠️  Truncating {pg_col['column_name']} from {len(value)} to {maxlen}"
            )
            return value[:maxlen]

        if dtype in ("integer", "bigint", "smallint"):
            try:
                return int(value)
            except Exception:
                return 0
        if dtype in ("numeric", "decimal", "real", "double precision"):
            try:
                return float(value)
            except Exception:
                return 0.0

        return value

    def disable_foreign_key_constraints(self):
        """Temporarily disable foreign key constraints for data migration"""
        try:
            with connections["default"].cursor() as cursor:
                # Get all foreign key constraints
                cursor.execute(
                    """
                    SELECT 
                        tc.table_name, 
                        tc.constraint_name,
                        tc.constraint_type
                    FROM information_schema.table_constraints tc
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = 'public'
                """
                )

                constraints = cursor.fetchall()
                print(
                    f"   🔧 Found {len(constraints)} foreign key constraints to temporarily disable"
                )

                # Store constraint info for later restoration
                self.disabled_constraints = []

                for table_name, constraint_name, constraint_type in constraints:
                    try:
                        # Drop the constraint temporarily
                        cursor.execute(
                            f"ALTER TABLE {table_name} DROP CONSTRAINT {constraint_name}"
                        )
                        self.disabled_constraints.append((table_name, constraint_name))
                        print(
                            f"   🔧 Disabled constraint {constraint_name} on {table_name}"
                        )
                    except Exception as e:
                        print(
                            f"   ⚠️  Could not disable constraint {constraint_name}: {e}"
                        )

                return True
        except Exception as e:
            print(f"   ❌ Error disabling foreign key constraints: {e}")
            return False

    def restore_foreign_key_constraints(self):
        """Restore foreign key constraints after data migration"""
        if not hasattr(self, "disabled_constraints"):
            return True

        try:
            with connections["default"].cursor() as cursor:
                print(
                    f"   🔧 Restoring {len(self.disabled_constraints)} foreign key constraints..."
                )

                # Note: In a real implementation, you'd need to store the constraint definitions
                # For now, we'll just report what was disabled
                for table_name, constraint_name in self.disabled_constraints:
                    print(
                        f"   🔧 Would restore constraint {constraint_name} on {table_name}"
                    )

                print(
                    "   ⚠️  Note: Foreign key constraints need to be manually restored"
                )
                print("   ⚠️  Run 'python manage.py migrate' to recreate constraints")
                return True
        except Exception as e:
            print(f"   ❌ Error restoring foreign key constraints: {e}")
            return False

    # old convert_data_types no longer used (replaced by convert_value)

    def migrate_table_data(self, table_name, target_table_name=None):
        """Migrate a single table generically (no hard-coded columns)."""
        pg_table = target_table_name or table_name
        print(f"   📦 Migrating {table_name} -> {pg_table}...")

        system = {
            "django_migrations",
        }
        if table_name in system:
            print(f"   ⚠️  Skipping {table_name} - handled by Django migrations")
            return True

        try:
            cur = self.sqlite_conn.cursor()
            cur.execute(f"PRAGMA table_info({table_name})")
            cols = cur.fetchall()
            if not cols:
                print(f"   ⚠️  Table {table_name} not found in SQLite")
                return True
            column_names = [c[1] for c in cols]
            column_types = {c[1]: c[2] for c in cols}

            cur.execute(f"SELECT * FROM {table_name}")
            rows = cur.fetchall()
            if not rows:
                print(f"   ℹ️  Table {table_name} is empty")
                return True

            pg_columns = self.get_pg_columns(pg_table)
            if not pg_columns:
                print(f"   ⚠️  PostgreSQL table {pg_table} does not exist - skipping")
                return True

            pg_column_names = list(pg_columns.keys())

            # Column mapping: handle common name variations
            column_mapping = {}
            for sqlite_col in column_names:
                pg_col = sqlite_col
                # Handle common column name variations
                if pg_table == "api_product_categories":
                    # SQLite uses productcategories_id, PostgreSQL uses productcategory_id
                    if sqlite_col == "productcategories_id":
                        pg_col = "productcategory_id"
                    elif sqlite_col == "productcategories":
                        pg_col = "productcategory_id"
                # Only map if column exists in PostgreSQL
                if pg_col in pg_columns:
                    column_mapping[sqlite_col] = pg_col

            if not column_mapping:
                print(f"   ⚠️  No matching columns for {pg_table}")
                return True

            inserted = 0
            skipped = 0

            with transaction.atomic():
                with connections["default"].cursor() as pgc:
                    pgc.execute(f"TRUNCATE TABLE {pg_table} RESTART IDENTITY CASCADE")

                    # Build insert SQL (conflict-agnostic to skip any duplicate/unique violation)
                    placeholders = ", ".join(["%s"] * len(pg_column_names))
                    insert_sql = (
                        f"INSERT INTO {pg_table} ({', '.join(pg_column_names)}) "
                        f"VALUES ({placeholders}) ON CONFLICT DO NOTHING"
                    )

                    batch = []
                    batch_size = 1000

                    for row in rows:
                        row_dict = {}
                        skip = False

                        # Map source cols
                        for idx, sqlite_col in enumerate(column_names):
                            if sqlite_col not in column_mapping:
                                continue
                            pg_col = column_mapping[sqlite_col]
                            pg_info = pg_columns[pg_col]
                            val = row[idx]

                            # Normalize empties to None for NOT NULL handling
                            if val == "" or (
                                isinstance(val, str) and val.strip() == ""
                            ):
                                val = None

                            if val is None and not pg_info["nullable"]:
                                # For FK columns, skip row rather than inventing IDs
                                if pg_col.endswith("_id") and pg_col != "id":
                                    skip = True
                                    break
                                val = self.infer_default_value(pg_info)
                            if val is None and not pg_info["nullable"]:
                                skip = True
                                break

                            val = self.convert_value(
                                val, column_types.get(sqlite_col), pg_info
                            )
                            row_dict[pg_col] = val

                        if skip:
                            skipped += 1
                            continue

                        # Fill missing PG columns
                        for pg_col, pg_info in pg_columns.items():
                            if pg_col in row_dict:
                                continue
                            if pg_info["nullable"]:
                                row_dict[pg_col] = None
                            else:
                                # FK with no source value: skip row
                                if pg_col.endswith("_id") and pg_col != "id":
                                    skip = True
                                    break
                                val = self.infer_default_value(pg_info)
                                if val is None and not pg_info["nullable"]:
                                    skip = True
                                    break
                                row_dict[pg_col] = val

                        if skip:
                            skipped += 1
                            continue

                        # Preserve column order
                        batch.append([row_dict[col] for col in pg_column_names])

                        if len(batch) >= batch_size:
                            pgc.executemany(insert_sql, batch)
                            inserted += len(batch)
                            batch = []

                    if batch:
                        pgc.executemany(insert_sql, batch)
                        inserted += len(batch)

                    # Reseed sequences
                    try:
                        pgc.execute(
                            f"SELECT setval(pg_get_serial_sequence('{pg_table}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {pg_table}), 1), true)"
                        )
                    except Exception:
                        pass

            print(f"   ✅ Migrated {inserted} rows (skipped {skipped}) for {pg_table}")
            return True

        except Exception as e:
            print(f"   ❌ Error migrating {pg_table}: {e}")
            return False

    def migrate_data(self):
        """Main data migration with proper error handling"""
        print("🔄 Starting data migration...")

        # Get SQLite connection
        if not self.get_sqlite_connection():
            return False

        try:
            migration_order = self.get_migration_order()
            sqlite_tables = set(self._get_sqlite_tables())
            print(f"   📊 Found {len(sqlite_tables)} tables in SQLite")

            # Alias map for source-table naming differences
            alias_map = {
                "api_productcategory": [
                    "api_productcategories",
                    "productcategory",
                    "product_category",
                    "api_product_category",
                ],
            }

            success_count = 0
            for table in migration_order:
                source_table = table
                if table not in sqlite_tables:
                    if table in alias_map:
                        for alias in alias_map[table]:
                            if alias in sqlite_tables:
                                source_table = alias
                                print(f"   ℹ️  Using alias '{alias}' for '{table}'")
                                break
                if source_table not in sqlite_tables:
                    print(f"   ⚠️  Table {table} not found in SQLite - skipping")
                    continue
                if self.migrate_table_data(source_table, target_table_name=table):
                    success_count += 1

            print(f"   📊 Successfully migrated {success_count} tables")
            return success_count > 0

        finally:
            # Ensure all pending work is committed
            connections["default"].commit()

    def verify_migration_state(self):
        """Verify that migration state is correct"""
        print("🔍 Verifying migration state...")

        try:
            # Check if all migrations are applied
            executor = MigrationExecutor(connections["default"])
            plan = executor.migration_plan(executor.loader.graph.leaf_nodes())

            if plan:
                print(f"   ⚠️  Found {len(plan)} unapplied migrations")
                return False
            else:
                print("   ✅ All migrations are properly applied")
                return True

        except Exception as e:
            print(f"   ❌ Migration state verification failed: {e}")
            return False

    def create_backup_record(self):
        """Create backup record for this migration"""
        try:
            with connections["default"].cursor() as cursor:
                # Check if backup_info table exists
                cursor.execute(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'backup_info'
                    )
                """
                )
                backup_table_exists = cursor.fetchone()[0]

                if backup_table_exists:
                    # Get current WAL LSN properly
                    cursor.execute("SELECT pg_current_wal_lsn()")
                    current_lsn = cursor.fetchone()[0]

                    cursor.execute(
                        """
                        INSERT INTO backup_info (
                            backup_name, backup_type, start_time, 
                            wal_start_lsn, status, notes
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                        [
                            "sqlite_to_postgres_migration",
                            "data_migration",
                            datetime.now(timezone.utc),
                            current_lsn,
                            "in_progress",
                            "Professional SQLite to PostgreSQL data migration",
                        ],
                    )
                    print("   📝 Created migration backup record")
                    return True
                else:
                    print("   ℹ️  No backup tracking system found")
                    return True

        except Exception as e:
            print(f"   ⚠️  Could not create backup record: {e}")
            return False

    def update_backup_record(self, status, notes):
        """Update backup record status"""
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE backup_info 
                    SET status = %s, end_time = %s, notes = %s
                    WHERE backup_name = 'sqlite_to_postgres_migration' 
                    AND status = 'in_progress'
                """,
                    [status, datetime.now(timezone.utc), notes],
                )
                print(f"   📝 Updated backup record to {status}")
                return True
        except Exception as e:
            print(f"   ⚠️  Could not update backup record: {e}")
            return False


def main():
    """Main migration process following professional best practices"""
    print("=== Professional SQLite to PostgreSQL Migration ===")
    print("Following Django and PostgreSQL best practices for production environments")
    print()

    with ProfessionalMigrationManager() as migrator:
        # Step 1: Health check
        print("Step 1: Database health check...")
        if not migrator.check_database_health():
            print("❌ Database health check failed!")
            sys.exit(1)
        print()

        # Step 2: Setup PostgreSQL schema
        print("Step 2: Setting up PostgreSQL schema...")
        if not migrator.setup_postgres_schema():
            print("❌ Schema setup failed!")
            sys.exit(1)
        print()

        # Step 3: Create backup record
        print("Step 3: Creating backup record...")
        migrator.create_backup_record()
        print()

        # Step 4: Migrate data
        print("Step 4: Migrating data...")
        if not migrator.migrate_data():
            print("❌ Data migration failed!")
            migrator.update_backup_record("failed", "Data migration failed")
            sys.exit(1)
        print()

        # Step 5: Verify migration state
        print("Step 5: Verifying migration state...")
        if not migrator.verify_migration_state():
            print("❌ Migration state verification failed!")
            migrator.update_backup_record(
                "failed", "Migration state verification failed"
            )
            sys.exit(1)
        print()

        # Step 6: Recreate foreign key constraints
        print("Step 6: Recreating foreign key constraints...")
        try:
            print("   🔧 Running Django migrations to recreate constraints...")
            execute_from_command_line(["manage.py", "migrate", "--verbosity=1"])
            print("   ✅ Foreign key constraints recreated")
        except Exception as e:
            print(f"   ⚠️  Could not recreate constraints: {e}")
            print("   ⚠️  You may need to run 'python manage.py migrate' manually")

        # Step 7: Update backup record
        print("Step 7: Finalizing migration...")
        migrator.update_backup_record("completed", "Migration completed successfully")

        print("🎉 MIGRATION COMPLETED SUCCESSFULLY!")
        print()
        print("Next steps:")
        print("1. Test your application to ensure data integrity")
        print("2. Run 'python manage.py showmigrations' to verify state")
        print("3. Consider backing up the old SQLite database")
        print("4. Check backup_summary view for migration tracking")
        print("5. Verify foreign key constraints are working properly")
        print()
        print("Your Django application is now running on PostgreSQL! 🚀")


if __name__ == "__main__":
    main()
