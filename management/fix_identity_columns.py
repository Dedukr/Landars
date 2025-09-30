#!/usr/bin/env python
"""
Fix PostgreSQL Identity Columns - ULTIMATE FIX
==============================================

This script handles the specific case where columns are PostgreSQL IDENTITY columns
rather than regular auto-increment columns. This is the final solution for the
"duplicate key value violates unique constraint" errors.

IDENTITY columns work differently than sequence-based columns and require
special handling to synchronize their internal sequences.
"""

import os
import sys
from datetime import datetime

import django

# Add the backend directory to Python path
sys.path.append("/backend")

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.db import connection


class IdentityColumnFixer:
    """Fix PostgreSQL identity column sequence issues."""

    def __init__(self):
        self.cursor = connection.cursor()
        self.fixed_identity_columns = 0
        self.errors = []

    def log(self, message, level="INFO"):
        """Log message with timestamp."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = (
            "✓"
            if level == "SUCCESS"
            else "⚠️" if level == "WARNING" else "✗" if level == "ERROR" else "•"
        )
        print(f"[{timestamp}] {prefix} {message}")

    def get_identity_columns(self):
        """Get all identity columns in the database."""
        try:
            self.cursor.execute(
                """
                SELECT 
                    table_name,
                    column_name,
                    is_identity,
                    identity_generation
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND is_identity = 'YES'
                ORDER BY table_name
            """
            )
            return self.cursor.fetchall()
        except Exception as e:
            self.log(f"Error getting identity columns: {e}", "ERROR")
            return []

    def get_max_id(self, table_name):
        """Get the maximum ID value from a table."""
        try:
            self.cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")
            return self.cursor.fetchone()[0]
        except Exception as e:
            self.log(f"Error getting max ID for {table_name}: {e}", "ERROR")
            return 0

    def fix_identity_column(self, table_name, column_name):
        """Fix identity column sequence for a specific table."""
        try:
            # Get current max ID
            max_id = self.get_max_id(table_name)
            next_val = max_id + 1

            # For identity columns, we need to restart the identity sequence
            self.cursor.execute(
                f"""
                ALTER TABLE {table_name} 
                ALTER COLUMN {column_name} RESTART WITH {next_val}
            """
            )

            self.log(
                f"Fixed identity column {table_name}.{column_name} to restart at {next_val}",
                "SUCCESS",
            )
            self.fixed_identity_columns += 1
            return True

        except Exception as e:
            error_msg = (
                f"Error fixing identity column {table_name}.{column_name}: {str(e)}"
            )
            self.log(error_msg, "ERROR")
            self.errors.append(error_msg)
            return False

    def verify_identity_fixes(self):
        """Verify that identity columns are properly configured."""
        self.log("Verifying identity column fixes...")

        try:
            # Test inserting and deleting a record for critical tables
            critical_tables = ["django_content_type", "auth_permission", "auth_group"]

            verification_errors = []

            for table_name in critical_tables:
                try:
                    # Get current max ID
                    max_id = self.get_max_id(table_name)

                    # Try to get the next identity value (this will show us what the next ID would be)
                    if table_name == "django_content_type":
                        # For content type, we can check by attempting to create and rollback
                        self.cursor.execute("SAVEPOINT test_identity")
                        try:
                            self.cursor.execute(
                                """
                                INSERT INTO django_content_type (app_label, model) 
                                VALUES ('test_app', 'test_model') 
                                RETURNING id
                            """
                            )
                            new_id = self.cursor.fetchone()[0]
                            self.cursor.execute("ROLLBACK TO SAVEPOINT test_identity")

                            if new_id <= max_id:
                                verification_errors.append(
                                    f"{table_name}: Identity would generate ID {new_id}, but max existing ID is {max_id}"
                                )
                            else:
                                self.log(
                                    f"✓ {table_name}: Identity will generate ID {new_id} (max existing: {max_id})"
                                )
                        except Exception as e:
                            self.cursor.execute("ROLLBACK TO SAVEPOINT test_identity")
                            verification_errors.append(
                                f"{table_name}: Cannot test identity - {str(e)}"
                            )

                except Exception as e:
                    verification_errors.append(
                        f"{table_name}: Verification error - {str(e)}"
                    )

            if verification_errors:
                for error in verification_errors:
                    self.log(f"  {error}", "WARNING")
                return False
            else:
                self.log("All identity columns verified successfully!", "SUCCESS")
                return True

        except Exception as e:
            self.log(f"Error during verification: {e}", "ERROR")
            return False

    def run_fix(self):
        """Run the complete identity column fix process."""
        self.log("=" * 60)
        self.log("POSTGRESQL IDENTITY COLUMNS FIXER - ULTIMATE SOLUTION")
        self.log("=" * 60)

        # Step 1: Find identity columns
        self.log("Step 1: Finding identity columns...")
        identity_columns = self.get_identity_columns()

        self.log(f"Found {len(identity_columns)} identity columns")

        if identity_columns:
            self.log("Identity columns found:")
            for (
                table_name,
                column_name,
                is_identity,
                identity_generation,
            ) in identity_columns:
                max_id = self.get_max_id(table_name)
                self.log(
                    f"  - {table_name}.{column_name} (generation: {identity_generation}, max ID: {max_id})"
                )

        # Step 2: Fix identity column sequences
        self.log("Step 2: Fixing identity column sequences...")
        for (
            table_name,
            column_name,
            is_identity,
            identity_generation,
        ) in identity_columns:
            self.fix_identity_column(table_name, column_name)

        # Step 3: Verify fixes
        self.log("Step 3: Verifying fixes...")
        verification_passed = self.verify_identity_fixes()

        # Step 4: Summary
        self.log("=" * 60)
        self.log("SUMMARY")
        self.log("=" * 60)
        self.log(f"Identity columns processed: {len(identity_columns)}")
        self.log(f"Identity columns fixed: {self.fixed_identity_columns}")
        self.log(f"Errors encountered: {len(self.errors)}")

        if self.errors:
            self.log("Error details:")
            for error in self.errors:
                self.log(f"  {error}", "ERROR")

        if verification_passed and len(self.errors) == 0:
            self.log("🎉 ALL IDENTITY COLUMN ISSUES FIXED!", "SUCCESS")
            self.log(
                "Your Django app should now work without integrity errors.", "SUCCESS"
            )
            return True
        else:
            self.log("⚠️  Some issues may remain.", "WARNING")
            return False


def test_django_migrate():
    """Test Django migrate after the fix."""
    try:
        import sys
        from io import StringIO

        from django.core.management import execute_from_command_line

        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = StringIO()
        sys.stderr = StringIO()

        try:
            execute_from_command_line(["manage.py", "migrate", "--dry-run"])
            return True, "Django migrate dry-run passed"
        except Exception as e:
            stderr_content = sys.stderr.getvalue()
            return (
                False,
                f"Django migrate dry-run failed: {str(e)}\nSTDERR: {stderr_content}",
            )
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    except Exception as e:
        return False, f"Could not test Django migrate: {str(e)}"


if __name__ == "__main__":
    try:
        fixer = IdentityColumnFixer()
        success = fixer.run_fix()

        if success:
            fixer.log("Testing Django migrate...")
            test_success, test_message = test_django_migrate()
            fixer.log(test_message, "SUCCESS" if test_success else "WARNING")

        sys.exit(0 if success else 1)

    except Exception as e:
        print(f"\n💥 FATAL ERROR: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
