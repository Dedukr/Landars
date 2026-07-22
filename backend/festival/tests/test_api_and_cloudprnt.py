from __future__ import annotations

import base64
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from festival.models import (
    FestivalOrder,
    FestivalPrinter,
    FestivalPrintJob,
    FestivalProduct,
)
from festival.services.cloudprnt import create_reprint_batch, handle_poll
from festival.services.orders import place_festival_order

User = get_user_model()


def basic_auth(user, password):
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def place_order(test_case, **kwargs):
    """place_festival_order + run on_commit print enqueue (TestCase-safe)."""
    with test_case.captureOnCommitCallbacks(execute=True):
        return place_festival_order(**kwargs)


def make_staff(*, email="staff@example.com", festival=True):
    user = User.objects.create_user(
        email=email,
        password="pass12345",
        first_name="A",
        surname="B",
        is_staff=True,
        is_email_verified=True,
    )
    if festival:
        user.user_permissions.add(
            Permission.objects.get(codename="place_festival_order")
        )
    return user


@override_settings(
    FESTIVAL_ENABLED=True,
    FESTIVAL_PRINT_MODE="disabled",
    FESTIVAL_PRINTER_REQUIRED=False,
)
class FestivalAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product = FestivalProduct.objects.create(
            name="Varenyky", price=Decimal("8.50"), vat_rate=0
        )
        self.staff = make_staff()

    def test_anonymous_rejected(self):
        resp = self.client.get("/api/festival/products/")
        self.assertEqual(resp.status_code, 401)

    def test_non_staff_rejected(self):
        user = User.objects.create_user(
            email="cust@example.com",
            password="pass12345",
            first_name="C",
            surname="D",
            is_email_verified=True,
        )
        self.client.force_authenticate(user=user)
        resp = self.client.get("/api/festival/products/")
        self.assertEqual(resp.status_code, 403)

    def test_staff_without_perm_rejected(self):
        user = make_staff(email="noperm@example.com", festival=False)
        self.client.force_authenticate(user=user)
        resp = self.client.get("/api/festival/products/")
        self.assertEqual(resp.status_code, 403)

    def test_staff_with_perm_lists_products(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get("/api/festival/products/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["image"], "")

    def test_place_order(self):
        self.client.force_authenticate(user=self.staff)
        rid = str(uuid.uuid4())
        resp = self.client.post(
            "/api/festival/orders/",
            {"client_request_id": rid, "items": [{"product_id": self.product.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["total_price"], "17.00")
        self.assertFalse(resp.data["replayed"])

        resp2 = self.client.post(
            "/api/festival/orders/",
            {"client_request_id": rid, "items": [{"product_id": self.product.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertTrue(resp2.data["replayed"])

    def test_no_cancellation_endpoint(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.post("/api/festival/orders/1/cancel/", {}, format="json")
        self.assertEqual(resp.status_code, 404)

    @override_settings(FESTIVAL_ENABLED=False)
    def test_feature_disabled(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get("/api/festival/products/")
        self.assertEqual(resp.status_code, 503)


@override_settings(
    FESTIVAL_ENABLED=True,
    FESTIVAL_PRINT_MODE="cloudprnt",
    FESTIVAL_PRINTER_REQUIRED=True,
    FESTIVAL_ALLOW_ORDERS_WHEN_PRINTER_OFFLINE=False,
    FESTIVAL_CLOUDPRNT_USERNAME="festival-printer",
    FESTIVAL_CLOUDPRNT_PASSWORD="test-secret-password",
    FESTIVAL_PRINTER_STALE_SECONDS=60,
)
class CloudPRNTProtocolTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_staff()
        self.product = FestivalProduct.objects.create(
            name="Varenyky", price=Decimal("8.50"), vat_rate=0
        )
        self.printer = FestivalPrinter.objects.create(
            name="Main",
            mac_address="001C62000000",
            is_active=True,
            last_seen_at=timezone.now(),
            last_status_code="200",
            last_status_text="OK",
        )
        self.auth = basic_auth("festival-printer", "test-secret-password")
        self.url = "/api/festival/cloudprnt/"

    def _post_poll(self, **overrides):
        body = {
            "status": "23 6 0 0 0 0 0 0 0 ",
            "printerMAC": "00:1C:62:00:00:00",
            "statusCode": "200%20OK",
            "printingInProgress": False,
            "clientAction": None,
        }
        body.update(overrides)
        return self.client.post(
            self.url,
            body,
            format="json",
            HTTP_AUTHORIZATION=self.auth,
        )

    def test_missing_auth(self):
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("WWW-Authenticate", resp)

    def test_invalid_auth(self):
        resp = self.client.post(
            self.url,
            {},
            format="json",
            HTTP_AUTHORIZATION=basic_auth("festival-printer", "wrong"),
        )
        self.assertEqual(resp.status_code, 401)

    def test_empty_queue(self):
        resp = self._post_poll()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["jobReady"], False)

    def test_full_lifecycle_kitchen_then_customer(self):
        place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        # First job kitchen
        resp = self._post_poll()
        self.assertTrue(resp.data["jobReady"])
        token = resp.data["jobToken"]
        self.assertEqual(resp.data["mediaTypes"], ["text/plain"])
        self.assertEqual(resp.data["deleteMethod"], "DELETE")

        get = self.client.get(
            self.url,
            {"mac": "001C62000000", "type": "text/plain", "token": token},
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertEqual(get.status_code, 200)
        self.assertIn("text/plain", get["Content-Type"])
        body1 = get.content
        self.assertIn(b"KITCHEN", body1)

        # Repeated GET same bytes
        get2 = self.client.get(
            self.url,
            {"mac": "001C62000000", "type": "text/plain", "token": token},
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertEqual(get2.content, body1)

        delete = self.client.delete(
            f"{self.url}?mac=001C62000000&token={token}&code=200%20OK",
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertEqual(delete.status_code, 200)
        job = FestivalPrintJob.objects.get(job_token=token)
        self.assertEqual(job.status, FestivalPrintJob.Status.PRINTED)

        # Idempotent DELETE
        delete2 = self.client.delete(
            f"{self.url}?mac=001C62000000&token={token}&code=200%20OK",
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertEqual(delete2.status_code, 200)

        # Second job customer
        resp = self._post_poll()
        self.assertTrue(resp.data["jobReady"])
        token2 = resp.data["jobToken"]
        get = self.client.get(
            self.url,
            {"mac": "001C62000000", "type": "text/plain", "token": token2},
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertIn(b"CUSTOMER COPY", get.content)
        self.client.delete(
            f"{self.url}?mac=001C62000000&token={token2}&code=200%20OK",
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertEqual(
            FestivalPrintJob.objects.filter(
                status=FestivalPrintJob.Status.PRINTED
            ).count(),
            2,
        )

    def test_no_interleaving_between_orders(self):
        place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        # Drain queue recording job types/order
        sequence = []
        for _ in range(4):
            resp = self._post_poll()
            self.assertTrue(resp.data["jobReady"])
            token = resp.data["jobToken"]
            job = FestivalPrintJob.objects.get(job_token=token)
            sequence.append((job.order_id, job.job_type, job.sequence))
            self.client.get(
                self.url,
                {"mac": "001C62000000", "type": "text/plain", "token": token},
                HTTP_AUTHORIZATION=self.auth,
            )
            self.client.delete(
                f"{self.url}?mac=001C62000000&token={token}&code=200%20OK",
                HTTP_AUTHORIZATION=self.auth,
            )
        # First order kitchen+customer before second order starts
        self.assertEqual(sequence[0][2], 1)
        self.assertEqual(sequence[1][2], 2)
        self.assertEqual(sequence[0][0], sequence[1][0])
        self.assertNotEqual(sequence[1][0], sequence[2][0])
        self.assertEqual(sequence[2][2], 1)
        self.assertEqual(sequence[3][2], 2)
        self.assertLess(sequence[0][0], sequence[2][0])

    def test_lost_post_response_reoffers_same_token(self):
        place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        first = self._post_poll()
        token = first.data["jobToken"]
        # Printer never got response / never set jobToken; re-poll
        second = self._post_poll()
        self.assertTrue(second.data["jobReady"])
        self.assertEqual(second.data["jobToken"], token)
        self.assertEqual(
            FestivalPrintJob.objects.filter(
                status=FestivalPrintJob.Status.CLAIMED
            ).count(),
            1,
        )

    def test_server_setting_get_http_only(self):
        resp = self.client.get(self.url, HTTP_AUTHORIZATION=self.auth)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get("protocol"), "HTTP")

    def test_unknown_mac(self):
        resp = self._post_poll(printerMAC="00:11:22:33:44:55")
        self.assertEqual(resp.status_code, 403)

    def test_terminal_media_error_sync_retries_kitchen_before_customer(self):
        place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        resp = self._post_poll()
        token = resp.data["jobToken"]
        self.client.get(
            self.url,
            {"mac": "001C62000000", "type": "text/plain", "token": token},
            HTTP_AUTHORIZATION=self.auth,
        )
        with mock.patch("festival.tasks.send_festival_alert_task"):
            with self.captureOnCommitCallbacks(execute=True):
                self.client.delete(
                    f"{self.url}?mac=001C62000000&token={token}"
                    f"&code=510%20Incompatible%20media%20type",
                    HTTP_AUTHORIZATION=self.auth,
                )
        job = FestivalPrintJob.objects.get(job_token=token)
        self.assertEqual(job.status, FestivalPrintJob.Status.CANCELLED)
        replacement = FestivalPrintJob.objects.get(retry_of=job)
        self.assertEqual(replacement.status, FestivalPrintJob.Status.READY)
        self.assertEqual(replacement.job_type, FestivalPrintJob.JobType.KITCHEN)
        customer = FestivalPrintJob.objects.get(
            order=job.order, job_type=FestivalPrintJob.JobType.CUSTOMER
        )
        self.assertEqual(customer.status, FestivalPrintJob.Status.READY)
        self.assertEqual(customer.batch_uuid, replacement.batch_uuid)
        # Next claim must be kitchen retry, not customer.
        nxt = self._post_poll()
        self.assertTrue(nxt.data["jobReady"])
        self.assertEqual(nxt.data["jobToken"], str(replacement.job_token))

    def test_reprint_contains_copy(self):
        result = place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        jobs = create_reprint_batch(result.order, is_copy=True)
        self.assertTrue(all(j.is_reprint for j in jobs))
        self.assertIn("COPY", jobs[0].payload_text)

    def test_orders_rejected_when_printer_stale(self):
        self.printer.last_seen_at = timezone.now() - timedelta(minutes=10)
        self.printer.save(update_fields=["last_seen_at"])
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            "/api/festival/orders/",
            {
                "client_request_id": str(uuid.uuid4()),
                "items": [{"product_id": self.product.id, "quantity": 1}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 503)


@override_settings(
    FESTIVAL_ENABLED=True,
    FESTIVAL_PRINT_MODE="cloudprnt",
    FESTIVAL_PRINTER_REQUIRED=True,
    FESTIVAL_ALLOW_ORDERS_WHEN_PRINTER_OFFLINE=False,
    FESTIVAL_CLOUDPRNT_USERNAME="festival-printer",
    FESTIVAL_CLOUDPRNT_PASSWORD="test-secret-password",
    FESTIVAL_PRINTER_STALE_SECONDS=60,
)
class PrintRecoveryTests(TestCase):
    def setUp(self):
        self.user = make_staff()
        self.product = FestivalProduct.objects.create(
            name="Varenyky", price=Decimal("8.50"), vat_rate=0
        )
        self.printer = FestivalPrinter.objects.create(
            name="Main",
            mac_address="001C62000000",
            is_active=True,
            last_seen_at=timezone.now(),
            last_status_code="200",
            last_status_text="OK",
        )

    def _poll(self):
        return handle_poll(
            {
                "printerMAC": "00:1C:62:00:00:00",
                "statusCode": "200%20OK",
                "printingInProgress": False,
            }
        )

    def _place_order(self):
        return place_order(
            self,
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        ).order

    def _fail_claimed_job(self):
        """Claim the next job and mark it FAILED like a 51x DELETE would."""
        result = self._poll()
        job = FestivalPrintJob.objects.get(job_token=result["jobToken"])
        job.status = FestivalPrintJob.Status.FAILED
        job.last_error = "510 Incompatible media type"
        job.save(update_fields=["status", "last_error", "updated_at"])
        self.printer.refresh_from_db()
        self.printer.current_job_token = None
        self.printer.save(update_fields=["current_job_token"])
        return job

    def test_auto_retry_unblocks_batch(self):
        from festival.tasks import auto_retry_failed_festival_print_jobs

        order = self._place_order()
        failed = self._fail_claimed_job()

        # Batch is blocked while the job is FAILED.
        self.assertFalse(self._poll()["jobReady"])

        with mock.patch("festival.services.alerts.send_festival_alert"):
            auto_retry_failed_festival_print_jobs()

        failed.refresh_from_db()
        self.assertEqual(failed.status, FestivalPrintJob.Status.CANCELLED)
        replacement = FestivalPrintJob.objects.get(retry_of=failed)
        self.assertEqual(replacement.status, FestivalPrintJob.Status.READY)
        self.assertEqual(replacement.payload_text, failed.payload_text)

        # Queue is unblocked again; both remaining jobs can be printed.
        remaining = FestivalPrintJob.objects.filter(
            order=order, status=FestivalPrintJob.Status.READY
        ).count()
        self.assertEqual(remaining, 2)
        self.assertTrue(self._poll()["jobReady"])

    def test_auto_retry_gives_up_after_max_attempts(self):
        from festival.tasks import MAX_AUTO_RETRIES, auto_retry_failed_festival_print_jobs

        self._place_order()
        job = self._fail_claimed_job()
        with mock.patch("festival.services.alerts.send_festival_alert") as alert:
            for _ in range(MAX_AUTO_RETRIES):
                auto_retry_failed_festival_print_jobs()
                job = FestivalPrintJob.objects.get(retry_of=job)
                job.status = FestivalPrintJob.Status.FAILED
                job.save(update_fields=["status", "updated_at"])
            self.assertFalse(alert.called)
            auto_retry_failed_festival_print_jobs()
            self.assertTrue(alert.called)
        job.refresh_from_db()
        self.assertEqual(job.status, FestivalPrintJob.Status.FAILED)
        self.assertFalse(
            FestivalPrintJob.objects.filter(retry_of=job).exists()
        )

    def test_stale_claim_requeued(self):
        from festival.tasks import recover_stale_festival_print_claims

        self._place_order()
        result = self._poll()
        job = FestivalPrintJob.objects.get(job_token=result["jobToken"])
        FestivalPrintJob.objects.filter(pk=job.pk).update(
            claimed_at=timezone.now() - timedelta(minutes=11)
        )

        with mock.patch("festival.services.alerts.send_festival_alert") as alert:
            recover_stale_festival_print_claims()
            self.assertTrue(alert.called)

        job.refresh_from_db()
        self.assertEqual(job.status, FestivalPrintJob.Status.READY)
        self.assertIsNone(job.claimed_at)
        self.printer.refresh_from_db()
        self.assertIsNone(self.printer.current_job_token)
        # Next poll re-offers the recovered job.
        self.assertTrue(self._poll()["jobReady"])

    def test_fresh_claim_not_requeued(self):
        from festival.tasks import recover_stale_festival_print_claims

        self._place_order()
        result = self._poll()
        with mock.patch("festival.services.alerts.send_festival_alert") as alert:
            recover_stale_festival_print_claims()
            self.assertFalse(alert.called)
        job = FestivalPrintJob.objects.get(job_token=result["jobToken"])
        self.assertEqual(job.status, FestivalPrintJob.Status.CLAIMED)

    def test_printer_offline_alert_when_jobs_pending(self):
        from festival.tasks import check_festival_printer_health

        self._place_order()
        self.printer.last_seen_at = timezone.now() - timedelta(minutes=10)
        self.printer.save(update_fields=["last_seen_at"])
        with mock.patch("festival.services.alerts.send_festival_alert") as alert:
            check_festival_printer_health()
            self.assertTrue(alert.called)

    def test_printer_online_no_alert(self):
        from festival.tasks import check_festival_printer_health

        self._place_order()
        with mock.patch("festival.services.alerts.send_festival_alert") as alert:
            check_festival_printer_health()
            self.assertFalse(alert.called)

    def test_failed_job_alert_contains_ticket_details(self):
        from festival.services.cloudprnt import failed_job_alert_text

        order = self._place_order()
        job = self._fail_claimed_job()
        text = failed_job_alert_text(job)
        self.assertIn(f"#{order.order_number}", text)
        self.assertIn("Varenyky", text)
        self.assertIn("£8.50", text)
        self.assertIn("510 Incompatible media type", text)

    def test_terminal_failure_sends_alert_with_details(self):
        from festival.services.cloudprnt import handle_job_delete

        self._place_order()
        token = self._poll()["jobToken"]
        with mock.patch("festival.tasks.send_festival_alert_task") as task:
            with self.captureOnCommitCallbacks(execute=True):
                handle_job_delete(
                    mac="001C62000000",
                    token=token,
                    code="510 Incompatible media type",
                )
            task.delay.assert_called_once()
            text = task.delay.call_args[0][0]
        self.assertIn("Ticket print FAILED", text)
        self.assertIn("Varenyky", text)

    def test_lost_delete_requeues_not_inferred_printed(self):
        self._place_order()
        token = self._poll()["jobToken"]
        from festival.services.cloudprnt import handle_job_get

        handle_job_get(mac="001C62000000", media_type="text/plain", token=token)
        job = FestivalPrintJob.objects.get(job_token=token)
        self.assertEqual(job.status, FestivalPrintJob.Status.CLAIMED)
        self.assertIsNotNone(job.fetched_at)

        # Idle poll without jobToken after fetch → requeue (not PRINTED), then re-offer.
        result = self._poll()
        job.refresh_from_db()
        self.assertNotEqual(job.status, FestivalPrintJob.Status.PRINTED)
        self.assertEqual(job.completion_source, "")
        self.assertGreaterEqual(job.stale_requeue_count, 1)
        self.assertTrue(result["jobReady"])
        self.assertEqual(result["jobToken"], str(job.job_token))
        self.assertEqual(job.status, FestivalPrintJob.Status.CLAIMED)

    def test_get_fetches_do_not_exhaust_stale_requeue_budget(self):
        from festival.services.cloudprnt import handle_job_get
        from festival.tasks import MAX_STALE_CLAIM_REQUEUES, recover_stale_festival_print_claims

        self._place_order()
        token = self._poll()["jobToken"]
        for _ in range(MAX_STALE_CLAIM_REQUEUES + 2):
            handle_job_get(mac="001C62000000", media_type="text/plain", token=token)
        job = FestivalPrintJob.objects.get(job_token=token)
        self.assertGreaterEqual(job.attempt_count, MAX_STALE_CLAIM_REQUEUES + 2)
        self.assertEqual(job.stale_requeue_count, 0)
        FestivalPrintJob.objects.filter(pk=job.pk).update(
            claimed_at=timezone.now() - timedelta(minutes=11),
            fetched_at=timezone.now() - timedelta(minutes=11),
        )
        with mock.patch("festival.services.alerts.send_festival_alert"):
            recover_stale_festival_print_claims()
        job.refresh_from_db()
        self.assertEqual(job.status, FestivalPrintJob.Status.READY)
        self.assertEqual(job.stale_requeue_count, 1)

    def test_transient_delete_keeps_claimed(self):
        from festival.services.cloudprnt import handle_job_delete

        self._place_order()
        token = self._poll()["jobToken"]
        handle_job_delete(
            mac="001C62000000",
            token=token,
            code="410 Paper empty",
        )
        job = FestivalPrintJob.objects.get(job_token=token)
        self.assertEqual(job.status, FestivalPrintJob.Status.CLAIMED)
        self.assertTrue("410" in job.last_result_code or "Paper" in job.last_error)

    def test_busy_status_does_not_claim(self):
        self._place_order()
        result = handle_poll(
            {
                "printerMAC": "00:1C:62:00:00:00",
                "statusCode": "220%20Printer%20busy",
                "printingInProgress": False,
            }
        )
        self.assertFalse(result["jobReady"])
        self.assertEqual(
            FestivalPrintJob.objects.filter(
                status=FestivalPrintJob.Status.CLAIMED
            ).count(),
            0,
        )

    def test_cancel_while_claimed_clears_token_and_is_idempotent(self):
        from festival.services.cancellations import cancel_festival_order
        from festival.services.cloudprnt import handle_job_delete, handle_job_get

        owner = make_staff(email="owner@example.com")
        owner.user_permissions.add(
            Permission.objects.get(codename="cancel_festival_order")
        )
        order = self._place_order()
        # Re-assign creator so cancel perm path is clear; use superuser-style via perm.
        token = self._poll()["jobToken"]
        self.printer.refresh_from_db()
        self.assertEqual(self.printer.current_job_token, uuid.UUID(str(token)))

        cancel_festival_order(order=order, user=owner, reason="test cancel")
        self.printer.refresh_from_db()
        self.assertIsNone(self.printer.current_job_token)

        cancelled = FestivalPrintJob.objects.get(job_token=token)
        self.assertEqual(cancelled.status, FestivalPrintJob.Status.CANCELLED)

        # Printer finishing the protocol must not 409.
        payload = handle_job_get(
            mac="001C62000000", media_type="text/plain", token=token
        )
        self.assertEqual(payload, b"")
        handle_job_delete(mac="001C62000000", token=token, code="200 OK")

        self.assertTrue(
            FestivalPrintJob.objects.filter(
                order=order,
                job_type=FestivalPrintJob.JobType.KITCHEN_CANCELLATION,
                status=FestivalPrintJob.Status.READY,
            ).exists()
        )

    def test_auto_retry_keeps_kitchen_before_customer(self):
        from festival.tasks import auto_retry_failed_festival_print_jobs

        order = self._place_order()
        failed = self._fail_claimed_job()
        with mock.patch("festival.services.alerts.send_festival_alert"):
            auto_retry_failed_festival_print_jobs()
        replacement = FestivalPrintJob.objects.get(retry_of=failed)
        customer = FestivalPrintJob.objects.get(
            order=order, job_type=FestivalPrintJob.JobType.CUSTOMER
        )
        self.assertEqual(customer.batch_uuid, replacement.batch_uuid)
        nxt = self._poll()
        self.assertEqual(nxt["jobToken"], str(replacement.job_token))
        self.assertEqual(replacement.job_type, FestivalPrintJob.JobType.KITCHEN)

    def test_unfetched_stale_requeues_after_three_minutes(self):
        from festival.tasks import recover_stale_festival_print_claims

        self._place_order()
        result = self._poll()
        job = FestivalPrintJob.objects.get(job_token=result["jobToken"])
        FestivalPrintJob.objects.filter(pk=job.pk).update(
            claimed_at=timezone.now() - timedelta(minutes=4),
            fetched_at=None,
        )
        with mock.patch("festival.services.alerts.send_festival_alert"):
            recover_stale_festival_print_claims()
        job.refresh_from_db()
        self.assertEqual(job.status, FestivalPrintJob.Status.READY)
        self.assertEqual(job.stale_requeue_count, 1)
