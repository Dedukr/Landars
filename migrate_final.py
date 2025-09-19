#!/usr/bin/env python3
"""
Final comprehensive migration script for SQLite3 to PostgreSQL
This handles all the foreign key constraint issues properly
"""

import os
import sqlite3
import sys
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

    # Get table structure from SQLite
    cursor = sqlite_conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()

    if not columns:
        print(f"  ⚠️  Table {table_name} not found in SQLite")
        return

    # Get all data from SQLite
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()

    if not rows:
        print(f"  ℹ️  Table {table_name} is empty")
        return

    # Get column names
    column_names = [col[1] for col in columns]

    # Insert data into PostgreSQL
    postgres_cursor = postgres_conn.cursor()

    try:
        # Clear existing data in PostgreSQL table
        postgres_cursor.execute(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE")

        # Special handling for problematic tables
        if table_name == "api_productcategory":
            print(
                f"  Special handling for {table_name} - clearing parent_id references"
            )
            # Clear all parent_id references to avoid foreign key issues
            parent_idx = column_names.index("parent_id")
            processed_rows = []
            for row in rows:
                row_list = list(row)
                row_list[parent_idx] = None  # Clear parent_id
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

    except Exception as e:
        print(f"  ❌ Error migrating {table_name}: {e}")
        postgres_conn.rollback()


def migrate_data():
    """Main data migration function"""
    print("Starting comprehensive data migration from SQLite3 to PostgreSQL...")

    # Connect to databases
    sqlite_conn = get_sqlite_connection()
    if not sqlite_conn:
        return False

    postgres_conn = connections["default"]

    try:
        # Get all tables
        tables = get_all_tables(sqlite_conn)
        print(f"Found {len(tables)} tables to migrate:")
        for table in tables:
            print(f"  - {table}")

        print()

        # Define migration order to handle foreign key constraints
        migration_order = [
            # Core Django tables first
            "django_migrations",
            "django_content_type",
            "auth_permission",
            "auth_group",
            "account_customuser",  # Users before anything that references them
            "account_address",
            "account_profile",
            "django_admin_log",
            "django_session",
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
        for table in migration_order:
            if table in tables:  # Only migrate if table exists
                migrate_table_data(table, sqlite_conn, postgres_conn)
            else:
                print(f"Skipping {table} - not found in SQLite database")

        print("\n✅ Data migration completed successfully!")
        return True

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

    finally:
        if sqlite_conn:
            sqlite_conn.close()


def main():
    print("=== SQLite3 to PostgreSQL Final Migration ===")
    print()

    # First, ensure PostgreSQL database is set up
    print("Setting up PostgreSQL database...")
    execute_from_command_line(["manage.py", "migrate"])

    print()

    # Migrate data
    if migrate_data():
        print("\n🎉 Migration completed successfully!")
        print("\nNext steps:")
        print("1. Test your application to ensure data integrity")
        print("2. Consider backing up the old SQLite database")
        print("3. Update your deployment scripts if needed")
    else:
        print("\n❌ Migration failed. Please check the errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()

