from __future__ import annotations

import uuid
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from festival.models import (
    FestivalAddition,
    FestivalAdditionClass,
    FestivalCreditNote,
    FestivalInvoice,
    FestivalOrder,
    FestivalPrinter,
    FestivalPrintJob,
    FestivalProduct,
)
from festival.services.cancellations import (
    FestivalCancellationError,
    cancel_festival_order,
)
from festival.services.numbering import (
    allocate_credit_note_number,
    allocate_invoice_number,
    allocate_ticket_number,
)
from festival.services.orders import FestivalOrderError, place_festival_order

User = get_user_model()


def _staff_user(email="staff@example.com", *, with_perm=True, cancel=False):
    user = User.objects.create_user(
        email=email,
        password="pass12345",
        first_name="Staff",
        surname="User",
        is_staff=True,
        is_email_verified=True,
    )
    if with_perm:
        perm = Permission.objects.get(codename="place_festival_order")
        user.user_permissions.add(perm)
    if cancel:
        user.user_permissions.add(
            Permission.objects.get(codename="cancel_festival_order")
        )
    return user


@override_settings(
    FESTIVAL_ENABLED=True,
    FESTIVAL_PRINT_MODE="disabled",
    FESTIVAL_PRINTER_REQUIRED=False,
)
class FestivalOrderServiceTests(TestCase):
    def setUp(self):
        self.user = _staff_user()
        self.product = FestivalProduct.objects.create(
            name="Varenyky",
            price=Decimal("8.50"),
            vat_rate=Decimal("0"),
        )
        self.vat_product = FestivalProduct.objects.create(
            name="Kvas",
            price=Decimal("3.60"),
            vat_rate=Decimal("20"),
        )

    def test_product_vat_default_zero(self):
        p = FestivalProduct.objects.create(name="X", price=Decimal("1.00"))
        self.assertEqual(p.vat_rate, Decimal("0"))

    def test_place_order_paid_with_invoice_and_snapshots(self):
        result = place_festival_order(
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 2}],
        )
        order = result.order
        self.assertFalse(result.replayed)
        self.assertEqual(order.status, FestivalOrder.Status.PAID)
        self.assertIsNotNone(order.created_at)
        self.assertEqual(order.total_price, Decimal("17.00"))
        item = order.items.get()
        self.assertEqual(item.product_name, "Varenyky")
        self.assertEqual(item.unit_price, Decimal("8.50"))
        invoice = order.invoice
        self.assertTrue(invoice.invoice_number.startswith("FINV-"))
        self.assertEqual(invoice.status, FestivalInvoice.Status.PAID)
        self.assertNotIn("email", invoice.seller_snapshot or {})
        # No customer fields on invoice model / snapshots
        self.assertFalse(hasattr(invoice, "customer_snapshot"))

    def test_idempotent_replay(self):
        rid = uuid.uuid4()
        items = [{"product_id": self.product.id, "quantity": 1}]
        first = place_festival_order(
            user=self.user, client_request_id=rid, items=items
        )
        second = place_festival_order(
            user=self.user, client_request_id=rid, items=items
        )
        self.assertEqual(first.order.pk, second.order.pk)
        self.assertTrue(second.replayed)
        self.assertEqual(FestivalOrder.objects.count(), 1)

    def test_idempotency_conflict(self):
        rid = uuid.uuid4()
        place_festival_order(
            user=self.user,
            client_request_id=rid,
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        with self.assertRaises(FestivalOrderError) as ctx:
            place_festival_order(
                user=self.user,
                client_request_id=rid,
                items=[{"product_id": self.product.id, "quantity": 2}],
            )
        self.assertEqual(ctx.exception.status, 409)

    def test_inactive_product_rejected(self):
        self.product.is_active = False
        self.product.save()
        with self.assertRaises(FestivalOrderError):
            place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[{"product_id": self.product.id, "quantity": 1}],
            )

    def test_ignores_client_totals(self):
        result = place_festival_order(
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[
                {
                    "product_id": self.product.id,
                    "quantity": 1,
                    "price": "0.01",
                    "total": "999",
                }
            ],
        )
        self.assertEqual(result.order.total_price, Decimal("8.50"))

    def test_cancellation_issues_credit_note(self):
        owner = _staff_user("owner@example.com", cancel=True)
        with mock.patch(
            "festival.tasks.generate_festival_invoice_pdf_task.delay"
        ), mock.patch(
            "festival.services.documents.generate_credit_note_pdf",
            return_value="festival/credit_notes/test.pdf",
        ) as gen_pdf:
            result = place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[{"product_id": self.vat_product.id, "quantity": 1}],
            )
            order = cancel_festival_order(
                order=result.order, user=owner, reason="Test cancel"
            )
        order.refresh_from_db()
        invoice = order.invoice
        self.assertEqual(order.status, FestivalOrder.Status.CANCELLED)
        self.assertEqual(invoice.status, FestivalInvoice.Status.CREDITED)
        cn = invoice.credit_note
        self.assertTrue(cn.credit_note_number.startswith("FCN-"))
        self.assertEqual(cn.total_gross, invoice.total_gross)
        self.assertEqual(cn.original_invoice_number, invoice.invoice_number)
        gen_pdf.assert_called_once()
        self.assertEqual(gen_pdf.call_args.args[0].pk, cn.pk)
        with mock.patch(
            "festival.services.documents.generate_credit_note_pdf"
        ), self.assertRaises(FestivalCancellationError):
            cancel_festival_order(order=order, user=owner, reason="again")

    def test_quantity_9999_rejected(self):
        with self.assertRaises(FestivalOrderError) as ctx:
            place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[{"product_id": self.product.id, "quantity": 9999}],
            )
        self.assertIn("cannot exceed", str(ctx.exception).lower())
        self.assertEqual(FestivalOrder.objects.count(), 0)

    def test_quantity_99_accepted_without_order_total_cap(self):
        with mock.patch(
            "festival.tasks.generate_festival_invoice_pdf_task.delay"
        ):
            result = place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[{"product_id": self.product.id, "quantity": 99}],
            )
        self.assertEqual(result.order.items.get().quantity, 99)
        self.assertEqual(result.order.total_price, Decimal("841.50"))

    def test_ticket_sequence_wraps(self):
        from festival.models import FestivalNumberSequence

        seq, _ = FestivalNumberSequence.objects.get_or_create(
            document_type=FestivalNumberSequence.DocumentType.TICKET,
            defaults={"last_number": 99},
        )
        seq.last_number = 99
        seq.save()
        allocation = allocate_ticket_number()
        self.assertEqual(allocation.order_number, 1)

    def test_allocate_ticket_wraps_after_full_1_to_99_cycle(self):
        numbers = [allocate_ticket_number().order_number for _ in range(100)]
        self.assertEqual(numbers[:99], list(range(1, 100)))
        self.assertEqual(numbers[99], 1)

    def test_place_orders_ticket_sequence_wraps_after_99(self):
        with mock.patch(
            "festival.tasks.generate_festival_invoice_pdf_task.delay"
        ):
            numbers = []
            for _ in range(101):
                result = place_festival_order(
                    user=self.user,
                    client_request_id=uuid.uuid4(),
                    items=[{"product_id": self.product.id, "quantity": 1}],
                )
                numbers.append(result.order.order_number)

        self.assertEqual(FestivalOrder.objects.count(), 101)
        self.assertEqual(numbers[:99], list(range(1, 100)))
        self.assertEqual(numbers[99], 1)
        self.assertEqual(numbers[100], 2)
        # Display ticket numbers reuse; order PKs stay unique.
        self.assertEqual(
            FestivalOrder.objects.filter(order_number=1).count(), 2
        )

    def test_invoice_sequence_does_not_wrap_at_99(self):
        from festival.models import FestivalNumberSequence

        seq, _ = FestivalNumberSequence.objects.get_or_create(
            document_type=FestivalNumberSequence.DocumentType.FE_INVOICE,
            defaults={"last_number": 99},
        )
        seq.last_number = 99
        seq.save()
        number = allocate_invoice_number()
        self.assertEqual(number, "FINV-000100")

    def test_credit_note_sequence_does_not_wrap_at_99(self):
        from festival.models import FestivalNumberSequence

        seq, _ = FestivalNumberSequence.objects.get_or_create(
            document_type=FestivalNumberSequence.DocumentType.FE_CREDIT_NOTE,
            defaults={"last_number": 99},
        )
        seq.last_number = 99
        seq.save()
        number = allocate_credit_note_number()
        self.assertEqual(number, "FCN-000100")

    def test_ticket_sequence_last_number_cannot_exceed_99(self):
        from festival.models import FestivalNumberSequence

        seq = FestivalNumberSequence(
            document_type=FestivalNumberSequence.DocumentType.TICKET,
            last_number=100,
        )
        with self.assertRaises(Exception):
            seq.full_clean()

    def test_order_with_addition_includes_addition_price(self):
        addition_class = FestivalAdditionClass.objects.create(name="Soft drinks")
        cola = FestivalAddition.objects.create(
            name="Cola",
            addition_class=addition_class,
            price=Decimal("1.50"),
        )
        FestivalAddition.objects.create(
            name="Water",
            addition_class=addition_class,
            price=Decimal("0.00"),
        )
        self.product.addition_class = addition_class
        self.product.save(update_fields=["addition_class"])

        result = place_festival_order(
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[
                {
                    "product_id": self.product.id,
                    "addition_id": cola.id,
                    "quantity": 2,
                }
            ],
        )
        order = result.order
        self.assertEqual(order.total_price, Decimal("20.00"))
        item = order.items.get()
        self.assertEqual(item.addition_id, cola.id)
        self.assertEqual(item.addition_name, "Cola")
        self.assertEqual(item.addition_unit_price, Decimal("1.50"))
        self.assertEqual(item.unit_price, Decimal("10.00"))
        self.assertEqual(item.display_name, "Varenyky + Cola")

    def test_addition_required_when_product_has_class(self):
        addition_class = FestivalAdditionClass.objects.create(name="Drinks")
        FestivalAddition.objects.create(
            name="Cola",
            addition_class=addition_class,
            price=Decimal("1.00"),
        )
        self.product.addition_class = addition_class
        self.product.save(update_fields=["addition_class"])
        with self.assertRaises(FestivalOrderError) as ctx:
            place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[{"product_id": self.product.id, "quantity": 1}],
            )
        self.assertEqual(ctx.exception.code, "addition_required")

    def test_addition_must_match_product_class(self):
        soft = FestivalAdditionClass.objects.create(name="Soft")
        beer = FestivalAdditionClass.objects.create(name="Beer")
        cola = FestivalAddition.objects.create(
            name="Cola", addition_class=soft, price=Decimal("1.00")
        )
        FestivalAddition.objects.create(
            name="Lager", addition_class=beer, price=Decimal("2.00")
        )
        self.product.addition_class = beer
        self.product.save(update_fields=["addition_class"])
        with self.assertRaises(FestivalOrderError) as ctx:
            place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[
                    {
                        "product_id": self.product.id,
                        "addition_id": cola.id,
                        "quantity": 1,
                    }
                ],
            )
        self.assertEqual(ctx.exception.code, "invalid_addition")


@override_settings(
    FESTIVAL_ENABLED=True,
    FESTIVAL_PRINT_MODE="cloudprnt",
    FESTIVAL_PRINTER_REQUIRED=True,
    FESTIVAL_ALLOW_ORDERS_WHEN_PRINTER_OFFLINE=False,
    FESTIVAL_CLOUDPRNT_USERNAME="festival-printer",
    FESTIVAL_CLOUDPRNT_PASSWORD="test-secret-password",
)
class FestivalCloudPRNTOrderTests(TestCase):
    def setUp(self):
        self.user = _staff_user()
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

    def test_order_creates_kitchen_then_customer_jobs(self):
        result = place_festival_order(
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        jobs = list(
            FestivalPrintJob.objects.filter(order=result.order).order_by("sequence")
        )
        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[0].job_type, FestivalPrintJob.JobType.KITCHEN)
        self.assertEqual(jobs[1].job_type, FestivalPrintJob.JobType.CUSTOMER)
        self.assertEqual(jobs[0].batch_uuid, jobs[1].batch_uuid)
        self.assertIn("KITCHEN", jobs[0].payload_text)
        self.assertIn("CUSTOMER COPY", jobs[1].payload_text)
        self.assertIn("PAID", jobs[1].payload_text)
        self.assertNotIn("£", jobs[0].payload_text)

    def test_missing_printer_rejected_when_required(self):
        FestivalPrinter.objects.all().delete()
        with self.assertRaises(FestivalOrderError) as ctx:
            place_festival_order(
                user=self.user,
                client_request_id=uuid.uuid4(),
                items=[{"product_id": self.product.id, "quantity": 1}],
            )
        self.assertEqual(ctx.exception.code, "printer_missing")

    @override_settings(FESTIVAL_ALLOW_ORDERS_WHEN_PRINTER_OFFLINE=True)
    def test_order_without_printer_when_offline_allowed(self):
        FestivalPrinter.objects.all().delete()
        result = place_festival_order(
            user=self.user,
            client_request_id=uuid.uuid4(),
            items=[{"product_id": self.product.id, "quantity": 1}],
        )
        self.assertEqual(result.order.status, FestivalOrder.Status.PAID)
        self.assertEqual(
            FestivalPrintJob.objects.filter(order=result.order).count(), 0
        )


@override_settings(FESTIVAL_ENABLED=True, FESTIVAL_PRINT_MODE="disabled")
class ConcurrentTicketAllocationTests(TransactionTestCase):
    def test_allocate_unique_under_contention(self):
        if connection.vendor != "postgresql":
            self.skipTest("Requires PostgreSQL locking behaviour")

        from concurrent.futures import ThreadPoolExecutor

        def worker(_):
            return allocate_ticket_number().order_number

        with ThreadPoolExecutor(max_workers=5) as pool:
            numbers = list(pool.map(worker, range(10)))
        self.assertEqual(len(numbers), len(set(numbers)))
