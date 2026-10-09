"""
Invoice online payment (Pay by Bank via Stripe Checkout) tests.
"""

from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.template.loader import render_to_string
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from api.models import Order, OrderItem, Product
from billing.models import CreditNote, Invoice
from billing.services.invoice_payment import (
    InvoicePaymentError,
    InvoicePaymentService,
    PAY_BY_BANK_PAYMENT_METHOD,
)
from billing.services.stripe_payment import StripePayByBankUnavailable, StripePaymentService
import stripe

User = get_user_model()


def _issue_invoice(order, *, total: Decimal | None = None) -> Invoice:
    invoice = Invoice(order=order)
    invoice.issue_from_order()
    if total is not None:
        invoice.total_amount = total
        invoice.vat_amount = Decimal("0")
    invoice.allocate_invoice_number_if_needed()
    invoice.ensure_payment_public_token()
    invoice.save()
    invoice.build_line_items_from_order()
    invoice.refresh_from_db()
    return invoice


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_test_secret",
)
class InvoicePaymentTokenAndRenderTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="pay-invoice@example.com",
            password="SecurePass123!",
            first_name="Pay",
            surname="Invoice",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Test Sausage",
            base_price=Decimal("10.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("2.00"),
        )

    def test_issued_invoice_gets_secure_unique_token(self):
        a = _issue_invoice(self.order)
        b = _issue_invoice(self.order)
        self.assertTrue(a.payment_public_token)
        self.assertTrue(b.payment_public_token)
        self.assertNotEqual(a.payment_public_token, b.payment_public_token)
        self.assertGreaterEqual(len(a.payment_public_token), 32)
        # Token must not be a trivial encoding of the internal id.
        self.assertNotEqual(a.payment_public_token, str(a.pk))
        self.assertFalse(a.payment_public_token.isdigit())

    def test_payment_url_uses_landarsfood_path_not_stripe_checkout(self):
        invoice = _issue_invoice(self.order)
        url = invoice.public_payment_url
        self.assertTrue(url.startswith("https://landarsfood.test/pay/invoice/"))
        self.assertIn(invoice.payment_public_token, url)
        self.assertNotIn("checkout.stripe.com", url)

    def test_invoice_html_renders_pay_online_after_bank_details(self):
        invoice = _issue_invoice(self.order)
        html = render_to_string(
            "invoice.html",
            {"invoice": invoice, "business": {}},
        )
        bank_pos = html.find("Bank Details")
        pay_pos = html.find("Pay online")
        self.assertGreater(bank_pos, 0)
        self.assertGreater(pay_pos, bank_pos)
        self.assertIn("pay securely from your bank account", html.lower())
        self.assertIn(invoice.public_payment_url, html)
        self.assertNotIn("checkout.stripe.com", html)
        self.assertNotIn("Pay by card", html)


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_test_secret",
)
class InvoicePaymentPageTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="pay-page@example.com",
            password="SecurePass123!",
            first_name="Page",
            surname="Test",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Kielbasa",
            base_price=Decimal("12.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("1.00"),
        )
        self.invoice = _issue_invoice(self.order, total=Decimal("12.00"))

    def _url(self, token=None):
        return reverse(
            "pay_invoice", kwargs={"token": token or self.invoice.payment_public_token}
        )

    @patch(
        "billing.services.invoice_payment.StripePaymentService.create_pay_by_bank_checkout_session"
    )
    @patch(
        "billing.services.invoice_payment.StripePaymentService.retrieve_checkout_session"
    )
    def test_unpaid_redirects_to_stripe_checkout(self, mock_retrieve, mock_create):
        mock_retrieve.return_value = None
        session = MagicMock()
        session.id = "cs_test_abc"
        session.url = "https://checkout.stripe.com/c/pay/cs_test_abc"
        session.payment_status = "unpaid"
        session.payment_intent = "pi_test_abc"
        mock_create.return_value = session

        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], session.url)

        kwargs = mock_create.call_args.kwargs
        self.assertEqual(kwargs["amount_pence"], 1200)
        self.assertEqual(kwargs["currency"], "gbp")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.stripe_checkout_session_id, "cs_test_abc")

    @patch(
        "billing.services.invoice_payment.StripePaymentService.create_pay_by_bank_checkout_session"
    )
    def test_paid_shows_payment_received_without_stripe_create(self, mock_create):
        self.invoice.amount_paid = self.invoice.total_amount
        self.invoice.status = Invoice.Status.PAID
        self.invoice.paid_at = timezone.now()
        self.invoice.save(
            update_fields=["amount_paid", "status", "paid_at"]
        )

        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Payment received")
        self.assertContains(response, self.invoice.display_invoice_number)
        mock_create.assert_not_called()

    @patch(
        "billing.services.invoice_payment.StripePaymentService.create_pay_by_bank_checkout_session"
    )
    def test_void_does_not_create_checkout(self, mock_create):
        self.invoice.status = Invoice.Status.VOID
        self.invoice.voided_at = timezone.now()
        self.invoice.save(update_fields=["status", "voided_at"])

        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 410)
        self.assertContains(response, "no longer payable", status_code=410)
        mock_create.assert_not_called()

    def test_invalid_token_is_safe_404(self):
        response = self.client.get(self._url(token="not-a-real-token-xxxxxxxxxxxx"))
        self.assertEqual(response.status_code, 404)

    def _paid_session(self):
        session = MagicMock()
        session.payment_status = "paid"
        session.status = "complete"
        session.to_dict.return_value = {
            "id": "cs_paid_return",
            "amount_total": 1200,
            "currency": "gbp",
            "payment_status": "paid",
            "status": "complete",
            "payment_intent": "pi_paid_return",
            "metadata": {
                "invoice_id": str(self.invoice.pk),
                "purpose": "invoice_pay_by_bank",
            },
        }
        return session

    @patch(
        "billing.services.invoice_payment.StripePaymentService.retrieve_checkout_session"
    )
    def test_return_from_checkout_marks_invoice_paid_without_webhook(
        self, mock_retrieve
    ):
        self.invoice.stripe_checkout_session_id = "cs_paid_return"
        self.invoice.stripe_payment_status = "unpaid"
        self.invoice.save(
            update_fields=["stripe_checkout_session_id", "stripe_payment_status"]
        )
        mock_retrieve.return_value = self._paid_session()

        response = self.client.get(self._url() + "?payment=complete")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Payment received")
        self.assertNotContains(response, "being confirmed")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.amount_paid, Decimal("12.00"))
        self.assertEqual(self.invoice.stripe_payment_intent_id, "pi_paid_return")

    @patch(
        "billing.services.invoice_payment.StripePaymentService.retrieve_checkout_session"
    )
    def test_return_url_stays_confirming_when_stripe_is_unpaid(self, mock_retrieve):
        self.invoice.stripe_checkout_session_id = "cs_still_open"
        self.invoice.save(update_fields=["stripe_checkout_session_id"])
        session = MagicMock()
        session.payment_status = "unpaid"
        session.status = "open"
        mock_retrieve.return_value = session

        response = self.client.get(self._url() + "?payment=complete")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "being confirmed")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.ISSUED)
        self.assertEqual(self.invoice.amount_paid, Decimal("0"))

    @patch(
        "billing.services.invoice_payment.StripePaymentService.retrieve_checkout_session"
    )
    def test_status_poll_marks_invoice_paid_when_stripe_is_paid(self, mock_retrieve):
        self.invoice.stripe_checkout_session_id = "cs_paid_return"
        self.invoice.save(update_fields=["stripe_checkout_session_id"])
        mock_retrieve.return_value = self._paid_session()

        response = self.client.get(
            reverse(
                "pay_invoice_status",
                kwargs={"token": self.invoice.payment_public_token},
            )
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "paid")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_test_secret",
)
class InvoiceStripeCheckoutCreationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="checkout-create@example.com",
            password="SecurePass123!",
            first_name="Create",
            surname="Test",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Pelmeni",
            base_price=Decimal("8.50"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("2.00"),
        )
        self.invoice = _issue_invoice(self.order, total=Decimal("17.00"))

    @patch("stripe.checkout.Session.create")
    def test_create_uses_amount_currency_pay_by_bank_metadata(self, mock_create):
        session = MagicMock()
        session.id = "cs_test_meta"
        session.url = "https://checkout.stripe.com/c/pay/cs_test_meta"
        session.payment_status = "unpaid"
        session.payment_intent = None
        mock_create.return_value = session

        url = InvoicePaymentService().get_or_create_checkout_redirect_url(self.invoice)
        self.assertEqual(url, session.url)

        kwargs = mock_create.call_args.kwargs
        self.assertEqual(kwargs["mode"], "payment")
        self.assertEqual(kwargs["payment_method_types"], ["pay_by_bank"])
        self.assertEqual(kwargs["line_items"][0]["price_data"]["unit_amount"], 1700)
        self.assertEqual(kwargs["line_items"][0]["price_data"]["currency"], "gbp")
        self.assertEqual(kwargs["metadata"]["invoice_id"], str(self.invoice.pk))
        self.assertEqual(
            kwargs["metadata"]["invoice_number"], str(self.invoice.invoice_number)
        )
        self.assertEqual(
            kwargs["idempotency_key"],
            f"invoice-payment-{self.invoice.pk}-{self.invoice.payment_version}",
        )

    @patch("stripe.checkout.Session.create")
    def test_reuses_existing_open_session(self, mock_create):
        self.invoice.stripe_checkout_session_id = "cs_existing"
        self.invoice.save(update_fields=["stripe_checkout_session_id"])

        existing = MagicMock()
        existing.id = "cs_existing"
        existing.status = "open"
        existing.payment_status = "unpaid"
        existing.amount_total = 1700
        existing.currency = "gbp"
        existing.url = "https://checkout.stripe.com/c/pay/cs_existing"

        with patch(
            "stripe.checkout.Session.retrieve", return_value=existing
        ) as mock_retrieve:
            url = InvoicePaymentService().get_or_create_checkout_redirect_url(
                self.invoice
            )
            self.assertEqual(url, existing.url)
            mock_create.assert_not_called()
            mock_retrieve.assert_called()

    @patch("stripe.checkout.Session.create")
    def test_pay_by_bank_unavailable_raises_clearly(self, mock_create):
        mock_create.side_effect = stripe.InvalidRequestError(
            message="Invalid payment_method_types[0]: pay_by_bank",
            param="payment_method_types",
        )
        with self.assertRaises(StripePayByBankUnavailable):
            StripePaymentService().create_pay_by_bank_checkout_session(
                amount_pence=1700,
                currency="gbp",
                description="LandarsFood Invoice LF-000001",
                success_url="https://landarsfood.test/ok",
                cancel_url="https://landarsfood.test/cancel",
                metadata={"invoice_id": "1"},
                idempotency_key="invoice-payment-1-1",
            )


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_test_secret",
)
class InvoiceStripeWebhookTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="webhook@example.com",
            password="SecurePass123!",
            first_name="Web",
            surname="Hook",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Varenyky",
            base_price=Decimal("9.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("1.00"),
        )
        self.invoice = _issue_invoice(self.order, total=Decimal("9.00"))

    def _session_payload(self, *, amount=900, currency="gbp", payment_status="paid"):
        return {
            "id": "cs_test_webhook",
            "object": "checkout.session",
            "amount_total": amount,
            "currency": currency,
            "payment_status": payment_status,
            "status": "complete",
            "payment_intent": "pi_test_webhook",
            "metadata": {
                "invoice_id": str(self.invoice.pk),
                "invoice_number": str(self.invoice.invoice_number),
                "purpose": "invoice_pay_by_bank",
            },
        }

    def _post_event(self, event_type, session_obj):
        event = {
            "id": "evt_test",
            "type": event_type,
            "data": {"object": session_obj},
        }
        with patch("stripe.Webhook.construct_event", return_value=event):
            return self.client.post(
                reverse("stripe_webhook"),
                data=json.dumps(event),
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=fake",
            )

    def test_successful_payment_marks_invoice_paid(self):
        response = self._post_event(
            "checkout.session.async_payment_succeeded", self._session_payload()
        )
        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.amount_paid, Decimal("9.00"))
        self.assertIsNotNone(self.invoice.paid_at)
        self.assertEqual(self.invoice.stripe_payment_intent_id, "pi_test_webhook")

    def test_amount_mismatch_rejected(self):
        response = self._post_event(
            "checkout.session.completed",
            self._session_payload(amount=500),
        )
        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.ISSUED)
        self.assertEqual(self.invoice.amount_paid, Decimal("0"))

    def test_currency_mismatch_rejected(self):
        response = self._post_event(
            "checkout.session.completed",
            self._session_payload(currency="usd"),
        )
        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.ISSUED)

    def test_duplicate_webhook_is_harmless(self):
        payload = self._session_payload()
        self.assertEqual(
            self._post_event("checkout.session.async_payment_succeeded", payload).status_code,
            200,
        )
        self.assertEqual(
            self._post_event("checkout.session.async_payment_succeeded", payload).status_code,
            200,
        )
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.amount_paid, Decimal("9.00"))

    def test_invalid_webhook_signature_rejected(self):
        with patch(
            "stripe.Webhook.construct_event",
            side_effect=stripe.SignatureVerificationError("bad sig", "sig_header"),
        ):
            response = self.client.post(
                reverse("stripe_webhook"),
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=bad",
            )
        self.assertEqual(response.status_code, 400)


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_test_secret",
)
class InvoiceManualBankTransferTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="bank-transfer@example.com",
            password="SecurePass123!",
            first_name="Bank",
            surname="Transfer",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Borscht",
            base_price=Decimal("7.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("1.00"),
        )
        self.invoice = _issue_invoice(self.order, total=Decimal("7.00"))
        self.invoice.stripe_checkout_session_id = "cs_open_bank"
        self.invoice.stripe_payment_status = "unpaid"
        self.invoice.save(
            update_fields=["stripe_checkout_session_id", "stripe_payment_status"]
        )

    @patch("stripe.checkout.Session.expire")
    @patch("stripe.checkout.Session.retrieve")
    def test_manual_paid_expires_open_session_and_pay_link_shows_received(
        self, mock_retrieve, mock_expire
    ):
        open_session = MagicMock()
        open_session.status = "open"
        mock_retrieve.return_value = open_session

        self.invoice.amount_paid = self.invoice.total_amount
        self.invoice.status = Invoice.Status.PAID
        self.invoice.paid_at = timezone.now()
        self.invoice.save(update_fields=["amount_paid", "status", "paid_at"])

        mock_expire.assert_called_once_with("cs_open_bank")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.stripe_checkout_session_id, "")

        response = self.client.get(
            reverse(
                "pay_invoice",
                kwargs={"token": self.invoice.payment_public_token},
            )
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Payment received")


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
)
class InvoicePaymentConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="concurrent@example.com",
            password="SecurePass123!",
            first_name="Con",
            surname="Current",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Holubtsi",
            base_price=Decimal("11.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("1.00"),
        )
        self.invoice = _issue_invoice(self.order, total=Decimal("11.00"))

    @patch("stripe.checkout.Session.create")
    def test_concurrent_requests_do_not_create_multiple_sessions(self, mock_create):
        create_calls = {"n": 0}

        def _create(**kwargs):
            create_calls["n"] += 1
            session = MagicMock()
            session.id = f"cs_conc_{create_calls['n']}"
            session.url = f"https://checkout.stripe.com/c/pay/{session.id}"
            session.payment_status = "unpaid"
            session.payment_intent = None
            return session

        mock_create.side_effect = _create

        # Sequential under select_for_update still reuses after first create.
        service = InvoicePaymentService()
        url1 = service.get_or_create_checkout_redirect_url(self.invoice)
        self.invoice.refresh_from_db()

        existing = MagicMock()
        existing.id = self.invoice.stripe_checkout_session_id
        existing.status = "open"
        existing.payment_status = "unpaid"
        existing.amount_total = 1100
        existing.currency = "gbp"
        existing.url = url1

        with patch("stripe.checkout.Session.retrieve", return_value=existing):
            url2 = service.get_or_create_checkout_redirect_url(self.invoice)

        self.assertEqual(url1, url2)
        self.assertEqual(mock_create.call_count, 1)
        self.assertEqual(
            mock_create.call_args.kwargs["idempotency_key"],
            f"invoice-payment-{self.invoice.pk}-{self.invoice.payment_version}",
        )


@override_settings(
    FRONTEND_URL="https://landarsfood.test",
    URL_BASE="https://landarsfood.test",
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_test_secret",
)
class PublishedInvoiceBlankTokenVoidTests(TestCase):
    """Legacy published invoices may lack payment_public_token; voiding must still work."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="blank-token-void@example.com",
            password="SecurePass123!",
            first_name="Blank",
            surname="Token",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Blank Token Pie",
            base_price=Decimal("20.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="issued",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=Decimal("1.00"),
        )
        self.invoice = _issue_invoice(self.order, total=Decimal("20.00"))
        # Mimic pre-token published invoices: PDF set, payment token blank.
        Invoice.objects.filter(pk=self.invoice.pk).update(
            invoice_link=f"invoices/invoice_{self.invoice.invoice_number}.pdf",
            payment_public_token=None,
        )
        self.invoice.refresh_from_db()
        self.assertTrue(self.invoice.invoice_link)
        self.assertFalse(self.invoice.payment_public_token)

    @patch.object(
        CreditNote,
        "generate_and_upload_pdf",
        return_value="credit_notes/credit_note_test.pdf",
    )
    def test_credit_note_assigns_token_and_voids_in_same_save(self, _mock_pdf):
        request = MagicMock()
        request.build_absolute_uri.return_value = "https://landarsfood.test/"

        note = CreditNote.create_and_publish_from_invoice(
            invoice=self.invoice,
            reason="Order changed",
            request=request,
        )

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.VOID)
        self.assertIsNotNone(self.invoice.voided_at)
        self.assertIn(
            f"Cancelled by Credit Note #{note.credit_note_number}",
            self.invoice.void_reason,
        )
        self.assertTrue(self.invoice.payment_public_token)
        self.assertGreaterEqual(len(self.invoice.payment_public_token), 32)

        response = self.client.get(
            reverse(
                "pay_invoice",
                kwargs={"token": self.invoice.payment_public_token},
            )
        )
        self.assertEqual(response.status_code, 410)
        self.assertContains(response, "no longer payable", status_code=410)

        # Existing token must stay frozen; accounting totals stay immutable.
        self.invoice.payment_public_token = "rotated-token-must-be-rejected"
        with self.assertRaises(ValidationError):
            self.invoice.save(update_fields=["payment_public_token"])

        self.invoice.refresh_from_db()
        self.invoice.total_amount = Decimal("99.00")
        with self.assertRaises(ValidationError):
            self.invoice.save(update_fields=["total_amount"])

    def test_mark_published_blank_token_invoice_paid_assigns_token(self):
        """Admin 'mark paid' updates the invoice; blank-token published rows must not raise."""
        self.invoice.amount_paid = self.invoice.total_amount
        self.invoice.status = Invoice.Status.PAID
        self.invoice.paid_at = timezone.now()
        self.invoice.save(update_fields=["amount_paid", "status", "paid_at"])

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.amount_paid, self.invoice.total_amount)
        self.assertTrue(self.invoice.payment_public_token)
