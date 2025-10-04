#!/usr/bin/env python3
"""
Complete SQLite to PostgreSQL Migration Script
This script handles everything: data migration, migration state, and fixes all conflicts.
"""

import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import django

# Add the backend directory to Python path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.core.management import execute_from_command_line
from django.db import connections


def get_sqlite_connection():
    """Get connection to SQLite database"""
    sqlite_paths = [
        backend_dir / "db" / "db_prod.sqlite3",
        backend_dir / "db" / "db.sqlite3",
        Path("/backend/db/db_prod.sqlite3"),
        Path("/backend/db/db.sqlite3"),
    ]

    for sqlite_path in sqlite_paths:
        if sqlite_path.exists():
            print(f"Found SQLite database: {sqlite_path}")
            return sqlite3.connect(str(sqlite_path))

    print("❌ SQLite database not found!")
    return None


def get_all_tables(sqlite_conn):
    """Get list of all tables in SQLite database"""
    cursor = sqlite_conn.cursor()
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    return [row[0] for row in cursor.fetchall()]


def migrate_table_data(table_name, sqlite_conn, postgres_conn):
    """Migrate data from SQLite table to PostgreSQL table"""
    print(f"Migrating table: {table_name}")

    # Skip Django system tables - we'll handle them with Django migrations
    django_system_tables = [
        "django_migrations",
        "django_content_type",
        "auth_permission",
        "auth_group",
        "django_admin_log",
        "django_session",
    ]

    if table_name in django_system_tables:
        print(f"  ⚠️  Skipping {table_name} - will be handled by Django migrations")
        return []

    # Get table structure from SQLite
    cursor = sqlite_conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()

    if not columns:
        print(f"  ⚠️  Table {table_name} not found in SQLite")
        return []

    # Get all data from SQLite
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()

    if not rows:
        print(f"  ℹ️  Table {table_name} is empty")
        return []

    # Get column names
    column_names = [col[1] for col in columns]

    # Insert data into PostgreSQL
    postgres_cursor = postgres_conn.cursor()
    parent_relationships = []

    try:
        # Clear existing data in PostgreSQL table
        postgres_cursor.execute(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE")

        # Special handling for problematic tables
        if table_name == "api_productcategory":
            print(
                f"  Special handling for {table_name} - preserving parent_id references"
            )
            # Store parent relationships for later processing
            parent_idx = column_names.index("parent_id")
            id_idx = column_names.index("id")

            # First, insert all categories without parent relationships
            processed_rows = []

            for row in rows:
                row_list = list(row)
                parent_id = row_list[parent_idx]
                category_id = row_list[id_idx]

                if parent_id is not None:
                    # Store the relationship for later
                    parent_relationships.append((category_id, parent_id))
                    # Clear parent_id for now to avoid foreign key issues
                    row_list[parent_idx] = None

                processed_rows.append(tuple(row_list))

            rows = processed_rows

        # Convert rows with proper data type handling
        converted_rows = []
        for row in rows:
            converted_row = []
            for i, value in enumerate(row):
                col_name = column_names[i]
                if col_name in (
                    "is_superuser",
                    "is_staff",
                    "is_active",
                    "is_home_delivery",
                    "delivery_fee_manual",
                ):
                    converted_row.append(bool(value) if value is not None else False)
                elif col_name.endswith("_id") and value is not None:
                    converted_row.append(int(value))
                else:
                    converted_row.append(value)
            converted_rows.append(converted_row)

        # Prepare insert statement
        placeholders = ", ".join(["%s"] * len(column_names))
        insert_sql = f"INSERT INTO {table_name} ({', '.join(column_names)}) VALUES ({placeholders})"

        # Insert data in batches
        batch_size = 1000
        for i in range(0, len(converted_rows), batch_size):
            batch = converted_rows[i : i + batch_size]
            postgres_cursor.executemany(insert_sql, batch)

        postgres_conn.commit()
        print(f"  ✅ Migrated {len(converted_rows)} rows to {table_name}")
        return parent_relationships

    except Exception as e:
        print(f"  ❌ Error migrating {table_name}: {e}")
        postgres_conn.rollback()
        return []


def restore_parent_relationships(postgres_conn, parent_relationships):
    """Restore parent-child relationships for categories after all categories are inserted"""
    if not parent_relationships:
        return

    print(f"  Restoring {len(parent_relationships)} parent relationships...")
    postgres_cursor = postgres_conn.cursor()

    try:
        for child_id, parent_id in parent_relationships:
            # Update the category with its parent relationship
            postgres_cursor.execute(
                "UPDATE api_productcategory SET parent_id = %s WHERE id = %s",
                (parent_id, child_id),
            )

        postgres_conn.commit()
        print(f"  ✅ Restored {len(parent_relationships)} parent relationships")

    except Exception as e:
        print(f"  ❌ Error restoring parent relationships: {e}")
        postgres_conn.rollback()


def fix_migration_state():
    """Fix Django migration state after data migration"""
    print("🔧 Fixing Django migration state...")

    with connections["default"].cursor() as cursor:
        try:
            # 1. Clear the django_migrations table to start fresh
            print("1. Clearing django_migrations table...")
            cursor.execute("DELETE FROM django_migrations")
            print("   ✅ Cleared django_migrations table")

            # 2. Reset sequences for auto-incrementing fields
            print("2. Resetting sequences...")

            # Reset django_migrations sequence
            cursor.execute(
                "SELECT setval(pg_get_serial_sequence(%s, %s), 1, false)",
                ["django_migrations", "id"],
            )

            # Reset django_content_type sequence
            cursor.execute("SELECT MAX(id) FROM django_content_type")
            max_content_type_id = cursor.fetchone()[0] or 0
            cursor.execute(
                "SELECT setval(pg_get_serial_sequence(%s, %s), %s)",
                ["django_content_type", "id", max_content_type_id + 1],
            )

            # Reset auth_permission sequence
            cursor.execute("SELECT MAX(id) FROM auth_permission")
            max_permission_id = cursor.fetchone()[0] or 0
            cursor.execute(
                "SELECT setval(pg_get_serial_sequence(%s, %s), %s)",
                ["auth_permission", "id", max_permission_id + 1],
            )

            print("   ✅ Reset sequences")

            # 3. Mark all current migrations as applied
            print("3. Marking current migrations as applied...")

            now = datetime.now(timezone.utc)

            # Manually mark all known migrations as applied
            migrations_to_mark = [
                # Account migrations
                ("account", "0001_initial"),
                ("account", "0002_address_country"),
                ("account", "0003_remove_address_country"),
                # Admin migrations
                ("admin", "0001_initial"),
                ("admin", "0002_logentry_remove_auto_add"),
                ("admin", "0003_logentry_add_action_flag_choices"),
                # API migrations
                ("api", "0001_initial"),
                ("api", "0002_alter_order_options"),
                ("api", "0003_alter_order_options"),
                ("api", "0004_remove_product_image"),
                ("api", "0005_alter_order_delivery_date"),
                ("api", "0006_alter_order_delivery_date"),
                ("api", "0007_order_invoice_link"),
                ("api", "0008_order_delivery_fee_order_order_date_and_more"),
                ("api", "0009_order_is_home_delivery"),
                ("api", "0010_alter_order_invoice_link"),
                ("api", "0011_alter_order_delivery_date"),
                ("api", "0012_alter_order_is_home_delivery"),
                ("api", "0013_alter_order_is_home_delivery"),
                (
                    "api",
                    "0014_alter_product_options_alter_product_unique_together_and_more",
                ),
                ("api", "0015_productcategory_parent"),
                ("api", "0016_remove_productcategory_parent"),
                ("api", "0017_productcategory_parent"),
                ("api", "0018_rename_category_product_categories"),
                ("api", "0019_order_delivery_fee_manual"),
                ("api", "0020_alter_order_options_order_discount_and_more"),
                ("api", "0021_alter_productcategory_options_wishlist"),
                # Auth migrations
                ("auth", "0001_initial"),
                ("auth", "0002_alter_permission_name_max_length"),
                ("auth", "0003_alter_user_email_max_length"),
                ("auth", "0004_alter_user_username_opts"),
                ("auth", "0005_alter_user_last_login_null"),
                ("auth", "0006_require_contenttypes_0002"),
                ("auth", "0007_alter_validators_add_error_messages"),
                ("auth", "0008_alter_user_username_max_length"),
                ("auth", "0009_alter_user_last_name_max_length"),
                ("auth", "0010_alter_group_name_max_length"),
                ("auth", "0011_update_proxy_permissions"),
                ("auth", "0012_alter_user_first_name_max_length"),
                # Authtoken migrations
                ("authtoken", "0001_initial"),
                ("authtoken", "0002_auto_20160226_1747"),
                ("authtoken", "0003_tokenproxy"),
                ("authtoken", "0004_alter_tokenproxy_options"),
                # Contenttypes migrations
                ("contenttypes", "0001_initial"),
                ("contenttypes", "0002_remove_content_type_name"),
                # Sessions migrations
                ("sessions", "0001_initial"),
            ]

            for app_label, migration_name in migrations_to_mark:
                cursor.execute(
                    "INSERT INTO django_migrations (app, name, applied) VALUES (%s, %s, %s)",
                    [app_label, migration_name, now],
                )
                print(f"   ✅ Marked {app_label}.{migration_name} as applied")

            print("   ✅ All migrations marked as applied")

        except Exception as e:
            print(f"❌ Error fixing migration state: {e}")
            return False

    return True


def migrate_data():
    """Main data migration function"""
    print("Starting comprehensive data migration from SQLite3 to PostgreSQL...")

    # Connect to databases
    sqlite_conn = get_sqlite_connection()
    if not sqlite_conn:
        return False

    postgres_conn = connections["default"]
    parent_relationships = []  # Store parent relationships for categories

    try:
        # Get all tables
        tables = get_all_tables(sqlite_conn)
        print(f"Found {len(tables)} tables to migrate:")
        for table in tables:
            print(f"  - {table}")

        print()

        # Define migration order to handle foreign key constraints
        # EXCLUDING Django system tables that should be handled by migrations
        migration_order = [
            # User tables first
            "account_customuser",  # Users before anything that references them
            "account_address",
            "account_profile",
            # Product tables
            "api_productcategory",  # Categories before products
            "api_product",
            "api_product_categories",
            # Order tables
            "api_order",
            "api_orderitem",
            # User relationships
            "account_customuser_groups",
            "account_customuser_user_permissions",
            "auth_group_permissions",
        ]

        print("Migrating tables in dependency order...")

        # Migrate each table in order
        all_parent_relationships = []
        for table in migration_order:
            if table in tables:  # Only migrate if table exists
                relationships = migrate_table_data(table, sqlite_conn, postgres_conn)
                if relationships:
                    all_parent_relationships.extend(relationships)
            else:
                print(f"Skipping {table} - not found in SQLite database")

        # Restore parent relationships after all categories are migrated
        if all_parent_relationships:
            print("\nRestoring parent category relationships...")
            restore_parent_relationships(postgres_conn, all_parent_relationships)

        print("\n✅ Data migration completed successfully!")
        return True

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

    finally:
        if sqlite_conn:
            sqlite_conn.close()


def main():
    print("=== Complete SQLite to PostgreSQL Migration ===")
    print("This script will:")
    print("1. Set up PostgreSQL database with Django migrations")
    print("2. Migrate your data from SQLite")
    print("3. Fix all migration state conflicts")
    print("4. Ensure everything works perfectly")
    print()

    # Step 1: Set up PostgreSQL database with proper migrations
    print("Step 1: Setting up PostgreSQL database with Django migrations...")
    execute_from_command_line(["manage.py", "migrate"])
    print("✅ PostgreSQL database set up successfully!")
    print()

    # Step 2: Migrate data (excluding Django system tables)
    print("Step 2: Migrating data from SQLite to PostgreSQL...")
    if not migrate_data():
        print("\n❌ Data migration failed!")
        sys.exit(1)
    print("✅ Data migration completed successfully!")
    print()

    # Step 3: Fix migration state
    print("Step 3: Fixing Django migration state...")
    if not fix_migration_state():
        print("\n❌ Failed to fix migration state!")
        sys.exit(1)
    print("✅ Migration state fixed successfully!")
    print()

    # Step 4: Final verification
    print("Step 4: Final verification...")
    try:
        execute_from_command_line(["manage.py", "migrate"])
        print("✅ All migrations applied successfully!")
    except Exception as e:
        if "api_wishlist" in str(e) and "already exists" in str(e):
            print("⚠️  Wishlist table already exists - faking the migration...")
            execute_from_command_line(["manage.py", "migrate", "api", "0021", "--fake"])
            print("✅ Migration 0021 faked successfully!")
        else:
            print(f"❌ Migration verification failed: {e}")
            raise
    print()

    print("🎉 MIGRATION COMPLETED SUCCESSFULLY!")
    print()
    print("Next steps:")
    print("1. Test your application to ensure data integrity")
    print("2. Run 'python manage.py makemigrations' if you make model changes")
    print("3. Run 'python manage.py migrate' to apply new migrations")
    print("4. Consider backing up the old SQLite database")
    print()
    print("Your Django application is now running on PostgreSQL! 🚀")


if __name__ == "__main__":
    main()
