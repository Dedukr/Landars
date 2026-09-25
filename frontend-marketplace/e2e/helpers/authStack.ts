/**
 * Helpers for the real-browser auth E2E suite (`e2e/auth.spec.ts`).
 *
 * The suite runs against a REAL Django + Next dev stack that is started OUTSIDE Playwright
 * (see e2e/auth-stack/start_stack.sh): Django on :8011 with a throw-away SQLite DB, Next on :3011.
 * DB inspection/mutation goes through short-lived `python -c` snippets that boot Django with the
 * scratch settings module (`e2e_settings`) - never the real dev DB or `.env`.
 *
 * No helper here ever prints tokens or passwords.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// e2e/helpers -> frontend-marketplace -> repo root
const FRONTEND_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
/** Scratch Django settings + stack scripts live next to the spec. */
export const STACK_SCRIPTS_DIR = path.join(FRONTEND_DIR, "e2e", "auth-stack");
/** Throw-away work dir (SQLite DB, mail files, logs) - same default as auth-stack/start_stack.sh. */
export const E2E_DIR = process.env.AUTH_E2E_DIR
  ? path.resolve(process.env.AUTH_E2E_DIR)
  : path.join(process.env.TMPDIR ?? "/tmp", "landars-auth-e2e");
const PYTHON = process.env.AUTH_E2E_PYTHON ?? path.join(BACKEND_DIR, "venv", "bin", "python");

export const BASE_URL = process.env.AUTH_E2E_BASE_URL ?? "http://127.0.0.1:3011";
export const API_ORIGIN = process.env.AUTH_E2E_API_ORIGIN ?? "http://127.0.0.1:8011";
export const STRONG_PASSWORD = "Sup3rSecret-E2E!";

/** Run a Python snippet inside Django (scratch settings). The snippet assigns `result = ...` (JSON-able). */
export function runDjango<T = unknown>(snippet: string, args: Record<string, unknown> = {}): T {
  const program = [
    "import os, sys, json",
    "import django",
    "django.setup()",
    "from django.utils import timezone",
    "from account.models import CustomUser, EmailVerificationToken, PasswordResetToken",
    "args = json.loads(os.environ['E2E_ARGS'])",
    "result = None",
    snippet,
    "sys.stdout.write('\\n@@E2E@@' + json.dumps(result, default=str) + '\\n')",
  ].join("\n");
  const out = execFileSync(PYTHON, ["-c", program], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DJANGO_SETTINGS_MODULE: "e2e_settings",
      PYTHONPATH: STACK_SCRIPTS_DIR,
      AUTH_E2E_DIR: E2E_DIR,
      PYTHONDONTWRITEBYTECODE: "1",
      E2E_ARGS: JSON.stringify(args),
    },
  });
  const marker = out.lastIndexOf("@@E2E@@");
  if (marker < 0) throw new Error("runDjango: no result marker in output");
  return JSON.parse(out.slice(marker + "@@E2E@@".length)) as T;
}

let counter = 0;
/** Unique, syntactically valid address per test (lowercase; example.* domains are rejected by the UI). */
export function uniqueEmail(tag = "u"): string {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
  return `e2e.${tag}.${stamp}@e2e-mail.test`.toLowerCase();
}

export interface UserRow {
  id: number;
  email: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  first_name: string | null;
  surname: string | null;
}

/** Every user row whose email matches case-insensitively (after trim), plus token counts. */
export function dbState(email: string): {
  users: UserRow[];
  verificationTokens: number;
  resetTokens: number;
} {
  return runDjango(
    `
e = args['email'].strip()
qs = CustomUser.objects.filter(email__iexact=e)
users = [dict(id=u.id, email=u.email, is_active=u.is_active, is_email_verified=u.is_email_verified,
              first_name=u.first_name, surname=u.surname) for u in qs]
result = dict(users=users,
  verificationTokens=EmailVerificationToken.objects.filter(user__in=qs).count(),
  resetTokens=PasswordResetToken.objects.filter(user__in=qs).count())
`,
    { email }
  );
}

export function userCount(email: string): number {
  return dbState(email).users.length;
}

/** Newest UNUSED email-verification token for the address (throws if none). Never log the value. */
export function newestVerificationToken(email: string): string {
  const token = runDjango<string | null>(
    `
t = EmailVerificationToken.objects.filter(user__email__iexact=args['email'].strip(), is_used=False).order_by('-id').first()
result = t.token if t else None
`,
    { email }
  );
  if (!token) throw new Error(`no unused verification token for ${email}`);
  return token;
}

export function newestResetToken(email: string): string {
  const token = runDjango<string | null>(
    `
t = PasswordResetToken.objects.filter(user__email__iexact=args['email'].strip(), is_used=False).order_by('-id').first()
result = t.token if t else None
`,
    { email }
  );
  if (!token) throw new Error(`no unused reset token for ${email}`);
  return token;
}

export function setUserFlags(email: string, flags: { is_active?: boolean; is_email_verified?: boolean }): void {
  runDjango(
    `
n = CustomUser.objects.filter(email__iexact=args['email'].strip()).update(**args['flags'])
assert n == 1, f'expected 1 user, updated {n}'
`,
    { email, flags }
  );
}

export function expireVerificationTokens(email: string): void {
  runDjango(
    `
from datetime import timedelta
EmailVerificationToken.objects.filter(user__email__iexact=args['email'].strip()).update(expires_at=timezone.now() - timedelta(hours=1))
`,
    { email }
  );
}

/** Newest verification token's `email_sent_at` (ISO string) or null. */
export function emailSentAt(email: string): string | null {
  return runDjango<string | null>(
    `
t = EmailVerificationToken.objects.filter(user__email__iexact=args['email'].strip()).order_by('-id').first()
result = t.email_sent_at.isoformat() if t and t.email_sent_at else None
`,
    { email }
  );
}

/** Directly create an account (fast set-up for scenarios that are not about sign-up). */
export function createUser(opts: {
  email: string;
  password?: string;
  verified?: boolean;
  active?: boolean;
  firstName?: string;
  surname?: string;
}): void {
  runDjango(
    `
u = CustomUser.objects.create_user(email=args['email'], password=args['password'],
    first_name=args['first'], surname=args['surname'])
u.is_email_verified = args['verified']
u.is_active = args['active']
u.save()
`,
    {
      email: opts.email,
      password: opts.password ?? STRONG_PASSWORD,
      verified: opts.verified ?? true,
      active: opts.active ?? true,
      first: opts.firstName ?? "Ada",
      surname: opts.surname ?? "Tester",
    }
  );
}

/** A fresh, unused email-verification token for an existing user (what the mailed link would carry). */
export function createVerificationToken(email: string): string {
  return runDjango<string>(
    `
u = CustomUser.objects.get(email__iexact=args['email'].strip())
result = EmailVerificationToken.objects.create(user=u).token
`,
    { email }
  );
}

/** Filenames in the file-based mail dir (one file per sent message). */
export function sentMailFiles(): string[] {
  try {
    return readdirSync(path.join(E2E_DIR, "mail")).sort();
  } catch {
    return [];
  }
}

/** Body of the newest mail file (may contain links/tokens - only for assertions, never logged). */
export function newestMailBody(): string {
  const files = sentMailFiles();
  if (!files.length) return "";
  return readFileSync(path.join(E2E_DIR, "mail", files[files.length - 1]), "utf8");
}

/** Pretend `seconds` have passed since the verification mail(s) went out (moves `email_sent_at` back). */
export function ageVerificationEmails(email: string, seconds: number): void {
  runDjango(
    `
from datetime import timedelta
for t in EmailVerificationToken.objects.filter(user__email__iexact=args['email'].strip()):
    if t.email_sent_at:
        t.email_sent_at = t.email_sent_at - timedelta(seconds=args['seconds'])
        t.save(update_fields=['email_sent_at'])
`,
    { email, seconds }
  );
}

/** Remove any leftover row for the address (fixed-address scenarios stay re-runnable). */
export function deleteUser(email: string): void {
  runDjango(`CustomUser.objects.filter(email__iexact=args['email'].strip()).delete()`, { email });
}
