#!/usr/bin/env python
"""
Script to fix PostgreSQL sequence values to match actual max IDs.
This prevents the "duplicate key value violates unique constraint" error.
"""

import os
import sys

import django

# Add the backend directory to Python path
sys.path.append("/backend")

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.db import connection


def fix_sequences():
    """Fix all PostgreSQL sequences to match actual max IDs."""
    cursor = connection.cursor()

    print("Checking and fixing sequence values...")

    # Get all tables with sequences
    cursor.execute(
        """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%_id_seq'
    """
    )

    sequences = cursor.fetchall()
    fixed_count = 0

    for (seq_name,) in sequences:
        # Extract table name from sequence name
        table_name = seq_name.replace("_id_seq", "")

        try:
            # Get max ID from table
            cursor.execute(f"SELECT MAX(id) FROM {table_name};")
            max_id = cursor.fetchone()[0]

            if max_id is None:
                max_id = 0

            # Get current sequence value
            cursor.execute(f"SELECT last_value FROM {seq_name};")
            seq_value = cursor.fetchone()[0]

            # Fix if max_id > seq_value
            if max_id > seq_value:
                # Fix the sequence to max_id + 1 to avoid conflicts
                new_seq_value = max_id + 1
                cursor.execute(f"SELECT setval('{seq_name}', {new_seq_value});")
                print(
                    f"✓ Fixed {table_name}: Max ID {max_id}, Sequence reset to {new_seq_value}"
                )
                fixed_count += 1
            else:
                print(f"✓ {table_name}: Max ID {max_id}, Sequence {seq_value} - OK")

        except Exception as e:
            print(f"✗ {table_name}: Error - {e}")

    if fixed_count > 0:
        print(f"\nSequence fix completed! Fixed {fixed_count} sequences.")
    else:
        print("\nAll sequences are already correct!")


if __name__ == "__main__":
    fix_sequences()
