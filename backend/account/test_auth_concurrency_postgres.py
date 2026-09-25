"""Real multi-thread races on PostgreSQL for the customer-authentication endpoints.

Skipped unless ``AUTH_TEST_POSTGRES=1`` *and* the default database is PostgreSQL, so the
normal (SQLite) runner never needs a server. To run:

    docker run -d --rm --name authfix-pg -e POSTGRES_PASSWORD=x -p 55434:5432 postgres:17-alpine
    POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55434 POSTGRES_DB=postgres POSTGRES_USER=postgres \
      POSTGRES_PASSWORD=x AUTH_TEST_POSTGRES=1 python manage.py test account.test_auth_concurrency_postgres
    docker rm -f authfix-pg

Every scenario uses ``TransactionTestCase`` (real commits), one ``APIClient`` per thread, a
``threading.Barrier`` so the requests genuinely overlap, ``connection.close()`` in each
thread, and several rounds to shake out timing-dependent failures. No response may ever be
a 5xx.
"""

from __future__ import annotations

import json
import os
import threading
import time
import unittest
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import jwt as pyjwt
from django.core.cache import cache
from django.core.management import call_command
from django.db import IntegrityError, OperationalError, connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from account.models import CustomUser, EmailVerificationToken, PasswordResetToken

User = CustomUser

REGISTER = "/api/auth/register/"
LOGIN = "/api/auth/login/"
LOGOUT = "/api/auth/logout/"
REFRESH = "/api/auth/token/refresh/"
CSRF = "/api/auth/csrf-token/"
VERIFY = "/api/auth/verify-email/"
RESEND = "/api/auth/resend-verification/"
RESET_CONFIRM = "/api/auth/password-reset/confirm/"
PROFILE_UPDATE = "/api/auth/profile/update/"

PASSWORD = "SecurePass1"
THREADS = 8
ROUNDS = 6
INDEX_NAME = "account_customuser_email_lower_uniq"

NO_THROTTLE = dict(
    REGISTER_RATE_LIMIT="10000/hour",
    REGISTER_EMAIL_RATE_LIMIT="10000/hour",
    LOGIN_RATE_LIMIT="10000/minute",
    LOGIN_EMAIL_RATE_LIMIT="10000/minute",
    PASSWORD_RESET_RATE_LIMIT="10000/hour",
    EMAIL_VERIFICATION_RATE_LIMIT="10000/hour",
    EMAIL_VERIFICATION_RESEND_RATE_LIMIT="10000/hour",
    EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT="10000/hour",
)


class EnqueueCounter:
    """Thread-safe stand-in for ``Task.delay`` (MagicMock's call_count is not atomic)."""

    def __init__(self):
        self._lock = threading.Lock()
        self.calls: list[tuple] = []

    def __call__(self, *args, **kwargs):
        with self._lock:
            self.calls.append(args)

    def __len__(self):
        return len(self.calls)


def _client(**extra):
    client = APIClient(enforce_csrf_checks=True)
    return client


def _post(path, body, *, cookies=None, **meta):
    """One request from a fresh client (one per thread), as nginx would forward it."""
    client = _client()
    for name, value in (cookies or {}).items():
        client.cookies[name] = value
    meta.setdefault("REMOTE_ADDR", "172.18.0.2")
    meta.setdefault("HTTP_X_FORWARDED_FOR", "198.51.100.10, 198.51.100.10")
    return client.post(path, body, format="json", **meta)


@unittest.skipUnless(
    os.environ.get("AUTH_TEST_POSTGRES") == "1",
    "PostgreSQL race tests: set AUTH_TEST_POSTGRES=1 (and POSTGRES_* env) to run",
)
@override_settings(
    **NO_THROTTLE,
    FRONTEND_URL="https://shop.example.test",
    JWT_REFRESH_COOKIE_SECURE=True,
    JWT_REFRESH_ROTATION_GRACE_SECONDS=30,
    # Hashing time is not under test; a fast hasher lets the threads reach the DB together.
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PgRaceCase(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        if connection.vendor != "postgresql":
            raise unittest.SkipTest("default database is not PostgreSQL")
        super().setUpClass()

    def setUp(self):
        cache.clear()
        self.verify_mail = EnqueueCounter()
        self.confirm_mail = EnqueueCounter()
        self.reset_mail = EnqueueCounter()
        for target, counter in (
            ("send_verification_email_task", self.verify_mail),
            ("send_verification_confirmation_email_task", self.confirm_mail),
            ("send_password_reset_email_task", self.reset_mail),
        ):
            patcher = patch(f"account.views.{target}.delay", side_effect=counter)
            patcher.start()
            self.addCleanup(patcher.stop)

    # -- harness -------------------------------------------------------------------
    def race(self, jobs, *, allow_5xx=False):
        """Run callables on separate threads released together by a barrier.

        Returns their results in order. Fails on any thread exception, any hung thread
        and (unless ``allow_5xx``) any response with status >= 500.
        """
        barrier = threading.Barrier(len(jobs))
        results = [None] * len(jobs)
        errors: list[BaseException] = []

        def runner(index, job):
            try:
                # Pay the TCP/auth cost before the barrier: the requests then hit the
                # database together instead of trickling in behind connection set-up
                # (and a slow Docker port-forward cannot trip the 5 s connect timeout).
                for attempt in range(8):
                    try:
                        connection.ensure_connection()
                        break
                    except OperationalError:
                        if attempt == 7:
                            raise
                        time.sleep(1)
                barrier.wait(timeout=60)
                results[index] = job()
            except BaseException as exc:  # noqa: BLE001 - reported below
                errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=runner, args=(i, job), daemon=True) for i, job in enumerate(jobs)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=90)
        self.assertFalse([t for t in threads if t.is_alive()], "a request hung (deadlock?)")
        self.assertEqual(errors, [], f"thread errors: {errors!r}")
        if not allow_5xx:
            statuses = [getattr(r, "status_code", 0) for r in results]
            self.assertFalse([s for s in statuses if s >= 500], f"5xx during race: {statuses}")
        for reply in results:
            if hasattr(reply, "status_code"):
                self.assertTrue(reply["X-Request-ID"])
        return results

    def rounds(self, count=ROUNDS):
        for number in range(count):
            with self.subTest(round=number):
                cache.clear()
                self.verify_mail.calls.clear()
                self.confirm_mail.calls.clear()
                yield number

    @staticmethod
    def body(reply):
        return reply.json()

    def make_user(self, email="race@example.com", *, verified=True, password=PASSWORD):
        return User.objects.create_user(
            email=email, password=password, first_name="Race", surname="Tester", is_email_verified=verified
        )

    def register_job(self, email, password=PASSWORD):
        return lambda: _post(
            REGISTER, {"email": email, "password": password, "first_name": "Ada", "surname": "Lovelace"}
        )


# ----------------------------------------------------------------------------------
# a - d: sign-up races
# ----------------------------------------------------------------------------------


class SignUpRaceTests(PgRaceCase):
    def test_a_same_email_same_password_creates_one_account_and_resumes_the_rest(self):
        for number in self.rounds():
            email = f"race-a{number}@example.com"
            replies = self.race([self.register_job(email) for _ in range(THREADS)])
            self.assertEqual([r.status_code for r in replies], [201] * THREADS, [r.content[:120] for r in replies])
            bodies = [self.body(r) for r in replies]
            self.assertEqual(sum(1 for b in bodies if b["resumed"] is False), 1, [b["resumed"] for b in bodies])
            self.assertEqual({b["user"]["id"] for b in bodies}, {User.objects.get(email=email).pk})
            self.assertTrue(all(b["email_queued"] for b in bodies))
            self.assertEqual(User.objects.filter(email__iexact=email).count(), 1)
            user = User.objects.get(email=email)
            self.assertTrue(user.check_password(PASSWORD))
            self.assertFalse(user.is_email_verified)
            self.assertEqual(EmailVerificationToken.objects.filter(user=user).count(), 1)
            self.assertTrue(all(not t.is_used for t in EmailVerificationToken.objects.filter(user=user)))
            self.assertTrue(1 <= len(self.verify_mail) <= 2, len(self.verify_mail))

    def test_b_casing_and_whitespace_variants_still_mean_one_account(self):
        variants = [
            "Race-B@Example.com",
            "  race-b@example.com  ",
            "RACE-B@EXAMPLE.COM",
            "race-b@example.com\u200b",
            "\u00a0race-b@example.com",
            "race-b@example.com",
            "Race-B@example.COM ",
            "\uff52\uff41\uff43\uff45\uff0d\uff42\uff20\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45\uff0e\uff43\uff4f\uff4d",
        ]
        for number in self.rounds():
            User.objects.all().delete()
            replies = self.race([self.register_job(v) for v in variants])
            self.assertEqual([r.status_code for r in replies], [201] * len(variants))
            self.assertEqual(sum(1 for r in replies if self.body(r)["resumed"] is False), 1)
            self.assertEqual(list(User.objects.values_list("email", flat=True)), ["race-b@example.com"])
            self.assertTrue(1 <= len(self.verify_mail) <= 2, len(self.verify_mail))

    def test_c_same_email_different_passwords_one_winner_everyone_else_is_told_it_exists(self):
        for number in self.rounds():
            email = f"race-c{number}@example.com"
            passwords = [f"Winner{i}Pass99x" for i in range(THREADS)]
            replies = self.race([self.register_job(email, p) for p in passwords])
            created = [i for i, r in enumerate(replies) if r.status_code == 201]
            self.assertEqual(len(created), 1, [r.status_code for r in replies])
            self.assertFalse(self.body(replies[created[0]])["resumed"])
            others = [self.body(r) for i, r in enumerate(replies) if i != created[0]]
            self.assertEqual([b["code"] for b in others], ["email_exists"] * (THREADS - 1))
            self.assertTrue(all("already exists" in b["error"] for b in others))
            self.assertEqual(User.objects.filter(email__iexact=email).count(), 1)
            user = User.objects.get(email=email)
            self.assertTrue(user.check_password(passwords[created[0]]), "stored password is not the winner's")
            self.assertEqual(sum(user.check_password(p) for p in passwords), 1)

    def test_d_different_emails_in_parallel_all_succeed(self):
        for number in self.rounds():
            emails = [f"race-d{number}-{i}@example.com" for i in range(THREADS)]
            replies = self.race([self.register_job(e) for e in emails])
            self.assertEqual([r.status_code for r in replies], [201] * THREADS)
            self.assertFalse(any(self.body(r)["resumed"] for r in replies))
            self.assertEqual(sorted(User.objects.filter(email__startswith=f"race-d{number}-").values_list("email", flat=True)), sorted(emails))
            self.assertEqual(len(self.verify_mail), THREADS)

    def test_x_mixed_traffic_for_one_address_never_errors(self):
        """Register x4, resend x2, unverified login x2 and verify-with-garbage x2, all at once."""
        for number in self.rounds():
            email = f"race-x{number}@example.com"
            jobs = (
                [self.register_job(email)] * 4
                + [lambda: _post(RESEND, {"email": email})] * 2
                + [lambda: _post(LOGIN, {"email": email, "password": PASSWORD})] * 2
                + [lambda: _post(VERIFY, {"token": "garbage"})] * 2
            )
            replies = self.race(jobs)
            self.assertEqual(User.objects.filter(email__iexact=email).count(), 1)
            for reply in replies[:4]:
                self.assertEqual(reply.status_code, 201)
            for reply in replies[4:6]:
                self.assertIn(reply.status_code, (200, 429))
            for reply in replies[6:8]:  # 401 account_not_found before the row exists, else unverified
                body = self.body(reply)
                self.assertTrue(
                    (reply.status_code, body["code"]) in {(401, "account_not_found"), (200, "email_not_verified")},
                    (reply.status_code, body),
                )
            for reply in replies[8:]:
                self.assertEqual((reply.status_code, self.body(reply)["code"]), (400, "token_invalid"))
            self.assertTrue(all(t.expires_at > timezone.now() for t in EmailVerificationToken.objects.all()))


# ----------------------------------------------------------------------------------
# e - g: login / verify / resend races
# ----------------------------------------------------------------------------------


class LoginVerifyResendRaceTests(PgRaceCase):
    def test_e_parallel_logins_all_succeed_and_wrong_passwords_all_fail(self):
        user = self.make_user("race-e@example.com")
        for number in self.rounds(3):
            before = OutstandingToken.objects.count()
            good = self.race([lambda: _post(LOGIN, {"email": "Race-E@example.com ", "password": PASSWORD})] * THREADS)
            self.assertEqual([r.status_code for r in good], [200] * THREADS)
            for reply in good:
                self.assertTrue(self.body(reply)["access"])
                self.assertTrue(reply.cookies["refresh_token"].value)
                self.assertTrue(reply.cookies["refresh_token"]["httponly"])
            self.assertEqual(len({r.cookies["refresh_token"].value for r in good}), THREADS)  # one session each
            self.assertEqual(OutstandingToken.objects.count() - before, THREADS)

            bad = self.race([lambda: _post(LOGIN, {"email": "race-e@example.com", "password": "Wrong12345"})] * THREADS)
            self.assertEqual([r.status_code for r in bad], [401] * THREADS)
            self.assertEqual({self.body(r)["code"] for r in bad}, {"invalid_password"})
            self.assertTrue(all("refresh_token" not in r.cookies for r in bad))
        user.refresh_from_db()
        self.assertIsNotNone(user.last_login)
        self.assertTrue(user.check_password(PASSWORD))

    def test_f_the_same_verification_link_opened_by_many_threads_verifies_once(self):
        """Whatever the losers are told, the account is verified exactly once, the winner is
        signed in, the welcome mail is queued once and nothing is a 5xx."""
        for number in self.rounds():
            user = self.make_user(f"race-f{number}@example.com", verified=False)
            token = EmailVerificationToken.objects.create(user=user)
            replies = self.race([lambda: _post(VERIFY, {"token": token.token})] * THREADS)
            winners = [r for r in replies if r.status_code == 200 and self.body(r)["already_verified"] is False]
            self.assertEqual(len(winners), 1, [(r.status_code, r.json().get("code")) for r in replies])
            self.assertNotIn("access", self.body(winners[0]))  # verifying never signs in
            self.assertNotIn("refresh_token", winners[0].cookies)
            for reply in replies:
                self.assertIn(reply.status_code, (200, 400), reply.content[:100])
            user.refresh_from_db()
            token.refresh_from_db()
            self.assertTrue(user.is_email_verified)
            self.assertTrue(token.is_used)
            self.assertEqual(len(self.confirm_mail), 1, "welcome mail must be queued exactly once")

    def test_f_the_same_verification_link_opened_by_many_threads_is_200_for_all(self):
        """Was a bug (fixed): the losers of a double-click / prefetch race get
        400 ``token_expired`` although the first request just verified the account.
        ``verify_email`` reads the token with ``select_for_update(of=("self",)).select_related("user")``;
        after waiting for the row lock PostgreSQL re-reads only the locked row, so the joined
        ``user`` row is the pre-commit snapshot (``is_email_verified=False``) while the token
        already shows ``is_used=True`` -> "expired". Dropping ``select_related("user")`` (the user
        is then fetched after the lock) makes all 8 threads answer 200 (verified in a probe)."""
        for number in self.rounds(3):
            user = self.make_user(f"race-f2-{number}@example.com", verified=False)
            token = EmailVerificationToken.objects.create(user=user)
            replies = self.race([lambda: _post(VERIFY, {"token": token.token})] * THREADS)
            self.assertEqual(
                [r.status_code for r in replies], [200] * THREADS,
                [(r.status_code, r.json().get("code")) for r in replies],
            )
            self.assertEqual(sorted(self.body(r)["already_verified"] for r in replies), [False] + [True] * (THREADS - 1))

    def test_g_concurrent_resend_with_a_live_link_reuses_it(self):
        for number in self.rounds():
            user = self.make_user(f"race-g{number}@example.com", verified=False)
            token = EmailVerificationToken.objects.create(user=user)
            replies = self.race([lambda: _post(RESEND, {"email": user.email})] * THREADS)
            self.assertEqual([r.status_code for r in replies], [200] * THREADS)
            self.assertEqual(EmailVerificationToken.objects.filter(user=user).count(), 1)
            token.refresh_from_db()
            self.assertFalse(token.is_used)
            self.assertTrue(token.is_valid())
            self.assertTrue(1 <= len(self.verify_mail) <= 2, len(self.verify_mail))
            self.assertEqual(self.verify_mail.calls[0], (token.pk,))

    def test_g_concurrent_resend_without_a_live_link_never_kills_a_link(self):
        """A customer whose last link expired double-clicks Resend: tokens may be created
        concurrently but every one stays valid and the number is bounded by the requests."""
        for number in self.rounds():
            user = self.make_user(f"race-g2-{number}@example.com", verified=False)
            expired = EmailVerificationToken.objects.create(user=user)
            EmailVerificationToken.objects.filter(pk=expired.pk).update(expires_at=timezone.now() - timedelta(hours=1))
            replies = self.race([lambda: _post(RESEND, {"email": user.email})] * THREADS)
            self.assertEqual([r.status_code for r in replies], [200] * THREADS)
            live = EmailVerificationToken.objects.filter(user=user, is_used=False, expires_at__gt=timezone.now())
            self.assertTrue(1 <= live.count() <= THREADS, live.count())
            self.assertFalse(EmailVerificationToken.objects.filter(user=user, is_used=True).exists())
            self.assertTrue(len(self.verify_mail) >= 1)

    def test_g_concurrent_resend_without_a_live_link_queues_at_most_two_mails(self):
        """Was a bug (fixed): the enqueue guard is keyed on (user, token) and
        ``_get_or_create_verification_token`` is not atomic, so N simultaneous resends for a
        customer without a live link create N tokens and send N mails."""
        for number in self.rounds(10):
            user = self.make_user(f"race-g3-{number}@example.com", verified=False)
            EmailVerificationToken.objects.filter(user=user).delete()
            replies = self.race([lambda: _post(RESEND, {"email": user.email})] * THREADS)
            self.assertEqual([r.status_code for r in replies], [200] * THREADS)
            self.assertLessEqual(len(self.verify_mail), 2, f"{len(self.verify_mail)} mails queued")


# ----------------------------------------------------------------------------------
# h: refresh rotation
# ----------------------------------------------------------------------------------


def _jti(raw):
    return pyjwt.decode(raw, options={"verify_signature": False})["jti"]


class RefreshRaceTests(PgRaceCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user("race-h@example.com")

    def fresh_session(self):
        """(refresh cookie, csrf cookie, csrf header token) of a just-logged-in browser."""
        client = APIClient(enforce_csrf_checks=True)
        login = client.post(LOGIN, {"email": "race-h@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200)
        csrf = client.get(CSRF)
        self.assertEqual(csrf.status_code, 200)
        return login.cookies["refresh_token"].value, csrf.cookies["csrftoken"].value, csrf.json()["csrfToken"]

    def refresh_job(self, refresh, csrf_cookie, csrf_token):
        return lambda: _post(
            REFRESH, {}, cookies={"refresh_token": refresh, "csrftoken": csrf_cookie}, HTTP_X_CSRFTOKEN=csrf_token
        )

    def test_h_concurrent_refresh_with_one_cookie_keeps_every_tab_alive(self):
        for number in self.rounds():
            for tabs in (2, 4, 6):
                with self.subTest(tabs=tabs):
                    cache.clear()
                    c1, csrf_cookie, csrf_token = self.fresh_session()
                    replies = self.race([self.refresh_job(c1, csrf_cookie, csrf_token)] * tabs)
                    # 401 is tolerated here (see the deterministic ``..._never_401`` test below):
                    # it is the grace marker arriving later than the loser's 30 ms wait.
                    self.assertTrue(all(r.status_code in (200, 401) for r in replies), [r.status_code for r in replies])
                    replies = [r for r in replies if r.status_code == 200]
                    self.assertGreaterEqual(len(replies), 1)
                    self.assertTrue(all(self.body(r)["access"] for r in replies))
                    rotated = [r for r in replies if "refresh_token" in r.cookies]
                    graced = [r for r in replies if "refresh_token" not in r.cookies]
                    self.assertGreaterEqual(len(rotated), 1)
                    self.assertTrue(all("refresh" not in self.body(r) for r in replies), "refresh token leaked into JSON")
                    for reply in rotated:  # the rotated cookie(s) keep working
                        again = _post(
                            REFRESH, {},
                            cookies={"refresh_token": reply.cookies["refresh_token"].value, "csrftoken": csrf_cookie},
                            HTTP_X_CSRFTOKEN=csrf_token,
                        )
                        self.assertEqual(again.status_code, 200)
                    # Grace over (marker gone): the original cookie is dead for good.
                    cache.delete(f"jwt_rotated:{_jti(c1)}")
                    dead = _post(REFRESH, {}, cookies={"refresh_token": c1, "csrftoken": csrf_cookie}, HTTP_X_CSRFTOKEN=csrf_token)
                    self.assertEqual((dead.status_code, dead.json()["code"]), (401, "token_not_valid"))
                    self.assertTrue(BlacklistedToken.objects.filter(token__jti=_jti(c1)).exists())
                    self.assertEqual(len(graced) + len(rotated), len(replies))

    def test_h_a_slow_winner_never_turns_the_second_tab_into_a_401(self):
        """Was a bug (fixed): the winner blacklists the old cookie inside
        ``super().validate()`` but stores the grace marker only afterwards (user lookup +
        ``_track_rotated_refresh`` + cache write). A second tab arriving in that gap waits a
        single 30 ms and then answers 401 - which the SPA treats as "session rejected" and
        signs the customer out. Deterministic here: the winner is held right after it blacklisted
        the cookie until the second tab has been answered. Fix: store the marker *before* blacklisting
        (``cache.add`` first, delete it if validation fails) and/or make the loser poll for
        ~1 s instead of one 30 ms sleep."""
        from account import views

        c1, csrf_cookie, csrf_token = self.fresh_session()
        real_track = views._track_rotated_refresh

        in_track, second_answered = threading.Event(), threading.Event()

        def slow_track(user, raw):
            in_track.set()  # cookie blacklisted, new one minted, grace marker not stored yet
            second_answered.wait(20)
            return real_track(user, raw)

        def late_second_tab():
            self.assertTrue(in_track.wait(20))
            try:
                return self.refresh_job(c1, csrf_cookie, csrf_token)()
            finally:
                second_answered.set()

        with patch.object(views, "_track_rotated_refresh", side_effect=slow_track):
            winner, second = self.race([self.refresh_job(c1, csrf_cookie, csrf_token), late_second_tab], allow_5xx=False)
        self.assertEqual(winner.status_code, 200)
        self.assertEqual(second.status_code, 200, second.content[:100])

    def test_h_concurrent_refresh_with_one_cookie_rotates_exactly_once(self):
        """Was a bug (fixed): simplejwt's ``check_blacklist`` and ``blacklist()`` are
        not atomic, so N simultaneous refreshes of ONE cookie all pass the check and each mints
        its own fully valid refresh token (a token family forks; only the browser's last
        Set-Cookie survives, the rest stay live for 7 days). The design (section 7) expects one
        rotated cookie and access-only answers for the rest. Fix: serialise per token, e.g.
        ``with transaction.atomic(): OutstandingToken.objects.select_for_update().get(jti=...)``
        around ``super().validate()`` so losers see the blacklist and take the grace path."""
        for number in self.rounds(3):
            cache.clear()
            OutstandingToken.objects.filter(user=self.user).delete()  # isolate this round's family
            c1, csrf_cookie, csrf_token = self.fresh_session()
            replies = self.race([self.refresh_job(c1, csrf_cookie, csrf_token)] * 4)
            rotated = [r for r in replies if "refresh_token" in r.cookies]
            self.assertEqual(len(rotated), 1, f"{len(rotated)} of 4 refreshes rotated")
            live = OutstandingToken.objects.filter(user=self.user, blacklistedtoken__isnull=True).count()
            self.assertEqual(live, 1, f"{live} live refresh tokens after one login + one refresh burst")

    def test_h_logout_racing_a_refresh_leaves_the_original_token_unusable(self):
        outcomes = set()
        for number in self.rounds(10):
            cache.clear()
            c1, csrf_cookie, csrf_token = self.fresh_session()
            logout_job = lambda: _post(LOGOUT, {}, cookies={"refresh_token": c1})
            replies = self.race([logout_job, self.refresh_job(c1, csrf_cookie, csrf_token)])
            out, refreshed = replies
            self.assertEqual(out.status_code, 200)
            self.assertEqual(int(out.cookies["refresh_token"]["max-age"]), 0)
            self.assertIn(refreshed.status_code, (200, 401))
            outcomes.add(refreshed.status_code)
            cache.delete(f"jwt_rotated:{_jti(c1)}")
            replay = _post(REFRESH, {}, cookies={"refresh_token": c1, "csrftoken": csrf_cookie}, HTTP_X_CSRFTOKEN=csrf_token)
            self.assertEqual((replay.status_code, replay.json()["code"]), (401, "token_not_valid"))
            self.assertTrue(BlacklistedToken.objects.filter(token__jti=_jti(c1)).exists())
        self.assertTrue(outcomes <= {200, 401})

    def test_h_parallel_refresh_and_logout_of_many_sessions_never_errors(self):
        for number in self.rounds(3):
            sessions = [self.fresh_session() for _ in range(4)]
            jobs = []
            for c1, csrf_cookie, csrf_token in sessions:
                jobs.append(self.refresh_job(c1, csrf_cookie, csrf_token))
                jobs.append(self.refresh_job(c1, csrf_cookie, csrf_token))
                jobs.append(lambda c1=c1: _post(LOGOUT, {}, cookies={"refresh_token": c1}))
            replies = self.race(jobs)
            for reply in replies:
                self.assertIn(reply.status_code, (200, 401))


def _live_refresh_tokens(user):
    return OutstandingToken.objects.filter(
        user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True
    )


class PasswordResetVsRefreshRaceTests(PgRaceCase):
    """Recovery (password reset) racing the session it is meant to end."""

    fresh_session = RefreshRaceTests.fresh_session
    refresh_job = RefreshRaceTests.refresh_job

    def setUp(self):
        super().setUp()
        self.user = self.make_user("race-h@example.com")

    def reset_job(self, user, password="BrandNewPass9"):
        token = PasswordResetToken.objects.create(user=user)
        return lambda: _post(RESET_CONFIRM, {"token": token.token, "new_password": password})

    def test_h_reset_racing_parallel_refreshes_never_errors_and_kills_the_old_cookie(self):
        for number in self.rounds():
            cache.clear()
            for token in list(_live_refresh_tokens(self.user)):
                BlacklistedToken.objects.get_or_create(token=token)
            c1, csrf_cookie, csrf_token = self.fresh_session()
            jobs = [self.refresh_job(c1, csrf_cookie, csrf_token)] * 3 + [self.reset_job(self.user, f"BrandNew{number}Pass9")]
            replies = self.race(jobs)
            self.assertEqual(replies[-1].status_code, 200, replies[-1].content[:120])
            for reply in replies[:-1]:
                self.assertIn(reply.status_code, (200, 401))
            cache.delete(f"jwt_rotated:{_jti(c1)}")
            dead = _post(REFRESH, {}, cookies={"refresh_token": c1, "csrftoken": csrf_cookie}, HTTP_X_CSRFTOKEN=csrf_token)
            self.assertEqual(dead.status_code, 401)
            self.user.refresh_from_db()
            self.assertTrue(self.user.check_password(f"BrandNew{number}Pass9"))
            self.user.set_password(PASSWORD)  # next round logs in again with the original one
            self.user.save(update_fields=["password"])

    def test_h_a_refresh_in_flight_when_the_password_is_reset_does_not_survive_it(self):
        """Was a bug (fixed): ``CookieTokenRefreshSerializer``
        blacklists the old cookie and mints the new one *before* ``_track_rotated_refresh``
        records it. A password reset that commits in between revokes nothing of the new
        token, so the session (a stolen one, say) outlives the recovery and its rotated
        cookie keeps working for 7 days."""
        from account import views

        c1, csrf_cookie, csrf_token = self.fresh_session()
        in_track, reset_done = threading.Event(), threading.Event()
        real_track = views._track_rotated_refresh

        def slow_track(user, raw):
            in_track.set()  # old cookie blacklisted, new one minted, nothing recorded yet
            reset_done.wait(20)
            return real_track(user, raw)

        reset = self.reset_job(self.user)

        def reset_after_refresh_started():
            self.assertTrue(in_track.wait(20))
            try:
                return reset()
            finally:
                reset_done.set()

        with patch.object(views, "_track_rotated_refresh", side_effect=slow_track):
            refreshed, recovered = self.race([self.refresh_job(c1, csrf_cookie, csrf_token), reset_after_refresh_started])
        self.assertEqual((refreshed.status_code, recovered.status_code), (200, 200))
        self.assertEqual(_live_refresh_tokens(self.user).count(), 0, "a session survived the password reset")
        rotated = refreshed.cookies["refresh_token"].value
        again = _post(REFRESH, {}, cookies={"refresh_token": rotated, "csrftoken": csrf_cookie}, HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(again.status_code, 401)


class HostileInputPostgresTests(PgRaceCase):
    """NUL bytes are legal Python strings but PostgreSQL refuses them in parameters (a 500
    unless the input is cleaned first). SQLite silently accepts them, so only this DB proves it."""

    def test_z_nul_characters_never_reach_the_database_on_any_auth_endpoint(self):
        nul = chr(0)
        user = self.make_user("nul@example.com")
        token = EmailVerificationToken.objects.create(user=self.make_user("nul2@example.com", verified=False))
        client = APIClient(enforce_csrf_checks=True)
        access = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json").json()["access"]
        auth = {"HTTP_AUTHORIZATION": f"Bearer {access}"}
        dirty = "x" + nul + "y"
        calls = [
            ("POST", REGISTER, {"email": "n" + nul + "@example.com", "password": PASSWORD, "first_name": "A", "surname": "B"}, {}),
            ("POST", REGISTER, {"email": "fresh@example.com", "password": "Secure" + nul + "Pass1", "first_name": "A" + nul, "surname": "B" + nul}, {}),
            ("POST", LOGIN, {"email": "nul" + nul + "@example.com", "password": PASSWORD}, {}),
            ("POST", LOGIN, {"email": "nul@example.com", "password": "Pass" + nul + "word1"}, {}),
            ("POST", "/api/auth/token/", {"email": "nul" + nul + "@example.com", "password": PASSWORD}, {}),
            ("POST", RESEND, {"email": "nul" + nul + "@example.com"}, {}),
            ("POST", "/api/auth/password-reset/", {"email": "nul@example.com" + nul}, {}),
            ("POST", RESET_CONFIRM, {"token": dirty, "new_password": PASSWORD}, {}),
            ("POST", RESET_CONFIRM, {"token": "t", "new_password": dirty}, {}),
            ("POST", VERIFY, {"token": dirty}, {}),
            ("POST", VERIFY, {"token": token.token + nul}, {}),
            ("GET", "/api/auth/check-verification/?token=a%00b", None, {}),
            ("GET", "/api/auth/password-reset/validate/?token=a%00b", None, {}),
            ("POST", "/api/auth/client-event/", {"op": "login", "stage": "network", "error": dirty}, {}),
            ("POST", LOGOUT, {"refresh": dirty}, {}),
            ("POST", REFRESH, {"refresh": dirty}, {}),
            ("PATCH", PROFILE_UPDATE, {"email": "new" + nul + "@example.com"}, auth),
            ("PATCH", PROFILE_UPDATE, {"first_name": "Ann" + nul, "surname": "Lee" + nul, "phone": "1" + nul, "notes": dirty}, auth),
            ("POST", "/api/auth/change-password/", {"old_password": "a" + nul, "new_password": "b" + nul}, auth),
        ]
        for method, path, body, extra in calls:
            with self.subTest(path=path, body=str(body)[:60]):
                extra = {"REMOTE_ADDR": "172.18.0.2", "HTTP_X_FORWARDED_FOR": "198.51.100.10, 198.51.100.10", **extra}
                if method == "GET":
                    reply = client.get(path, **extra)
                else:
                    reply = getattr(client, method.lower())(path, body, format="json", **extra)
                self.assertLess(reply.status_code, 500, reply.content[:200])
        self.assertFalse([e for e in User.objects.values_list("email", flat=True) if nul in e])
        self.assertEqual(User.objects.get(email="fresh@example.com").first_name, "A")


# ----------------------------------------------------------------------------------
# i: the case-insensitive unique index on the real database
# ----------------------------------------------------------------------------------


def _index_exists():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT indexdef FROM pg_indexes WHERE indexname = %s AND schemaname = current_schema()",
            [INDEX_NAME],
        )
        row = cursor.fetchone()
    return row[0] if row else None


def _drop_index():
    with connection.cursor() as cursor:
        cursor.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")


class CaseInsensitiveIndexTests(PgRaceCase):
    def setUp(self):
        super().setUp()
        _drop_index()
        self.addCleanup(_drop_index)

    def ensure(self, *args):
        out = StringIO()
        call_command("ensure_email_ci_index", *args, stdout=out)
        return out.getvalue()

    def test_i_index_is_created_once_and_is_idempotent(self):
        self.assertIsNone(_index_exists())
        dry = self.ensure("--dry-run")
        self.assertIn("CONCURRENTLY", dry)
        self.assertIsNone(_index_exists())  # a dry run creates nothing
        self.assertIn("Created", self.ensure())
        definition = _index_exists()
        self.assertIn("lower(", definition)
        self.assertIn("UNIQUE", definition)
        with connection.cursor() as cursor:
            cursor.execute("SELECT indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = %s", [INDEX_NAME])
            self.assertTrue(cursor.fetchone()[0])
        self.assertIn("already exists", self.ensure())
        self.assertIn("already exists", self.ensure("--dry-run"))

    def test_i_refuses_while_case_duplicates_exist(self):
        User.objects.bulk_create([User(email="a@example.com", first_name="A"), User(email="A@Example.com", first_name="B")])
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            self.ensure()
        self.assertIsNone(_index_exists())

    def test_i_database_rejects_a_case_variant_insert_that_bypasses_the_application(self):
        self.ensure()
        self.make_user("owner@example.com")
        with self.assertRaises(IntegrityError):
            User.objects.bulk_create([User(email="Owner@Example.com", first_name="Dup")])
        self.assertEqual(User.objects.count(), 1)

    def test_i_signup_races_still_resolve_cleanly_with_the_index_present(self):
        self.ensure()
        for number in self.rounds(3):
            email = f"race-i{number}@example.com"
            variants = [email, email.upper(), f" {email} ", email.title()] * 2
            replies = self.race([self.register_job(v) for v in variants])
            self.assertEqual([r.status_code for r in replies], [201] * len(variants))
            self.assertEqual(sum(1 for r in replies if r.json()["resumed"] is False), 1)
            self.assertEqual(User.objects.filter(email__iexact=email).count(), 1)

    def _login_and_update(self, user, new_email, client_ip):
        client = APIClient(enforce_csrf_checks=True)
        login = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
        access = login.json()["access"]
        return lambda: client.patch(
            PROFILE_UPDATE, {"email": new_email}, format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}", REMOTE_ADDR="172.18.0.2",
            HTTP_X_FORWARDED_FOR=f"{client_ip}, {client_ip}",
        )

    def test_i_two_customers_racing_for_one_new_address_end_with_exactly_one_owner(self):
        """Real threads. The loser may be answered 400 (checked) or lose at the database;
        what must hold is that the address never ends up on two accounts."""
        self.ensure()
        for number in self.rounds():
            first = self.make_user(f"race-i-first{number}@example.com")
            second = self.make_user(f"race-i-second{number}@example.com")
            target = f"Race-I-Target{number}@Example.com"
            jobs = [self._login_and_update(first, target, "198.51.100.31"), self._login_and_update(second, target, "198.51.100.32")]
            replies = self.race(jobs, allow_5xx=True)
            self.assertEqual(User.objects.filter(email__iexact=target).count(), 1, [r.status_code for r in replies])
            self.assertIn(200, [r.status_code for r in replies])

    def test_i_database_uniqueness_violation_on_profile_update_is_400_email_exists(self):
        """Was a bug (fixed): ``update_profile`` only catches ``ValidationError``
        around ``user.save()``. When another request wins the race between the application
        check and the UPDATE, the database raises ``IntegrityError`` which escapes to the
        generic handler: 500 ``server_error`` instead of 400 ``email_exists`` (and the raw
        driver message, which contains the address, is logged).

        Deterministic reproduction: the twin row appears exactly between the view's
        ``iexact`` check and the write (inside ``full_clean``), without going through
        any application validation."""
        self.ensure()
        me = self.make_user("race-i-me@example.com")
        client = APIClient(enforce_csrf_checks=True)
        access = client.post(LOGIN, {"email": me.email, "password": PASSWORD}, format="json").json()["access"]
        real_full_clean = User.full_clean

        def full_clean_then_lose_the_race(instance, *args, **kwargs):
            real_full_clean(instance, *args, **kwargs)
            if not User.objects.filter(email="taken@example.com").exists():
                User.objects.bulk_create([User(email="taken@example.com", first_name="Fast")])

        with patch.object(User, "full_clean", autospec=True, side_effect=full_clean_then_lose_the_race), self.assertNoLogs("account", "ERROR"):
            reply = client.patch(PROFILE_UPDATE, {"email": "Taken@Example.com"}, format="json", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual((reply.status_code, reply.json().get("code")), (400, "email_exists"), reply.content[:200])
