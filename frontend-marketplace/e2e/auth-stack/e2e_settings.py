"""Scratch Django settings for the auth real-browser E2E suite. NEVER points at real services.

Safety: python-dotenv is neutralised BEFORE the real settings are imported, so the live
credentials in the repo-root .env are never loaded; every external-service variable is blank.
The SQLite DB and the mail files live in the throw-away work dir (AUTH_E2E_DIR, default
$TMPDIR/landars-auth-e2e), never in the repo and never at backend/db/db.sqlite3.
Use: DJANGO_SETTINGS_MODULE=e2e_settings PYTHONPATH=<this dir> (see start_stack.sh).
"""
import os
from pathlib import Path

_E2E = Path(
    os.environ.get("AUTH_E2E_DIR")
    or (Path(os.environ.get("TMPDIR") or "/tmp") / "landars-auth-e2e")
)
_E2E.mkdir(parents=True, exist_ok=True)
(_E2E / "mail").mkdir(exist_ok=True)

for _k in (
    "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "SENDCLOUD_PUBLIC_KEY", "SENDCLOUD_SECRET_KEY",
    "SENDCLOUD_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "IDEAL_POSTCODES_API_KEY",
    "DJANGO_CACHE_REDIS_URL",
):
    os.environ[_k] = ""
os.environ["DEBUG"] = "True"
os.environ["TELEGRAM_ORDER_ALERTS_ENABLED"] = "false"
os.environ["CELERY_BROKER_URL"] = "memory://"
os.environ["CELERY_RESULT_BACKEND"] = "cache+memory://"
os.environ["EMAIL_BACKEND"] = "django.core.mail.backends.filebased.EmailBackend"
os.environ["FRONTEND_URL"] = "http://127.0.0.1:3011"
os.environ["CSRF_TRUSTED_ORIGINS"] = "http://127.0.0.1:3011,http://localhost:3011"
os.environ["CORS_ALLOWED_ORIGINS"] = "http://127.0.0.1:3011,http://localhost:3011"
# Relaxed throttles (real classes stay active). Scenarios that need the real limit use fakes.
os.environ["REGISTER_RATE_LIMIT"] = os.environ.get("E2E_REGISTER_RATE_LIMIT", "1000/minute")
os.environ["LOGIN_RATE_LIMIT"] = os.environ.get("E2E_LOGIN_RATE_LIMIT", "1000/minute")
os.environ["LOGIN_EMAIL_RATE_LIMIT"] = os.environ.get("E2E_LOGIN_EMAIL_RATE_LIMIT", "1000/minute")
os.environ["REGISTER_EMAIL_RATE_LIMIT"] = "1000/minute"
os.environ["EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT"] = "1000/minute"
os.environ["PASSWORD_RESET_RATE_LIMIT"] = "1000/minute"
os.environ["PASSWORD_RESET_EMAIL_RATE_LIMIT"] = "1000/minute"
os.environ["EMAIL_VERIFICATION_RATE_LIMIT"] = "1000/minute"
os.environ["EMAIL_VERIFICATION_RESEND_RATE_LIMIT"] = "1000/minute"
os.environ["CLIENT_EVENT_RATE_LIMIT"] = "1000/minute"

import dotenv  # noqa: E402

dotenv.load_dotenv = lambda *a, **k: False  # never read the real .env

from backend.settings import *  # noqa: E402,F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(_E2E / "e2e.sqlite3"),
        "OPTIONS": {"timeout": 20},
    }
}
EMAIL_BACKEND = "django.core.mail.backends.filebased.EmailBackend"
EMAIL_FILE_PATH = str(_E2E / "mail")
DEFAULT_FROM_EMAIL = NOREPLY_FROM_EMAIL = SUPPORT_FROM_EMAIL = "e2e@localhost"
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = False
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "e2e"}}
CSRF_TRUSTED_ORIGINS = ["http://127.0.0.1:3011", "http://localhost:3011"]
CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:3011", "http://localhost:3011"]
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_SECURE = False
JWT_REFRESH_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False

# Guard: this settings module must never point at the real dev database.
assert Path(DATABASES["default"]["NAME"]).resolve() != (Path(BASE_DIR) / "db" / "db.sqlite3").resolve(), (
    "e2e_settings must not use backend/db/db.sqlite3"
)
