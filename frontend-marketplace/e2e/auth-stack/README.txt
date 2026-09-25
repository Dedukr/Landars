Auth real-browser E2E stack (Chrome + real Django + real Next dev). Not part of `npm run test:e2e`.

  cd frontend-marketplace
  e2e/auth-stack/start_stack.sh --fresh-db      # Django :8011 (scratch SQLite) + next dev :3011 (first compile is slow)
  npx playwright test -c playwright.auth.config.ts --project=desktop-chrome
  npx playwright test -c playwright.auth.config.ts --project=mobile-chrome-iphone13   # only the @mobile tests
  e2e/auth-stack/stop_stack.sh

* Restart Django (stop/start) after any backend change: it runs with --noreload.
* DB, mail files, logs and pids live in ${AUTH_E2E_DIR:-${TMPDIR:-/tmp}/landars-auth-e2e}; delete it any time.
* e2e_settings.py neutralises the repo .env (python-dotenv is disabled before the real settings load), blanks every
  AWS/R2/Telegram/Sendcloud/Stripe credential, uses a file mail backend + eager Celery + LocMem cache, and never
  touches backend/db/db.sqlite3. Nothing is sent to any external service.
* Needs the system Google Chrome (Playwright channel "chrome"); nothing is downloaded. "mobile" = Chrome with iPhone-13
  emulation, not real Safari/WebKit. Overrides: AUTH_E2E_DIR, AUTH_E2E_PYTHON, AUTH_E2E_BASE_URL.
* `next dev` writes to frontend-marketplace/.next (git-ignored); Playwright output goes to test-results/ (git-ignored).
