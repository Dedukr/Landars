#!/usr/bin/env python
"""
Generate a secure SECRET_KEY for Django

Usage:
    python generate_secret_key.py

This will generate a cryptographically secure random secret key
suitable for production use.
"""

from django.core.management.utils import get_random_secret_key

if __name__ == "__main__":
    secret_key = get_random_secret_key()
    print("\n" + "=" * 60)
    print("Django SECRET_KEY Generated")
    print("=" * 60)
    print(f"\nSECRET_KEY={secret_key}\n")
    print("Add this to your .env file")
    print("NEVER commit this key to version control!")
    print("=" * 60 + "\n")
