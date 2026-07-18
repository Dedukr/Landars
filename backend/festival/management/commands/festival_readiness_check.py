from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand

from festival.models import FestivalNumberSequence, FestivalPrinter, FestivalProduct
from festival.services.tickets import render_kitchen_ticket


class Command(BaseCommand):
    help = "Validate festival production readiness without exposing secrets."

    def handle(self, *args, **options):
        errors: list[str] = []
        warnings: list[str] = []

        enabled = bool(settings.FESTIVAL_ENABLED)
        mode = settings.FESTIVAL_PRINT_MODE
        self.stdout.write(f"FESTIVAL_ENABLED={enabled}")
        self.stdout.write(f"FESTIVAL_PRINT_MODE={mode}")

        business = getattr(settings, "BUSINESS_INFO", {}) or {}
        for key in ("name", "address", "city", "postal_code", "country"):
            if not business.get(key):
                errors.append(f"BUSINESS_INFO.{key} is missing.")

        if settings.FESTIVAL_VAT_REGISTERED:
            if not settings.FESTIVAL_VAT_NUMBER:
                errors.append("FESTIVAL_VAT_NUMBER required when VAT registered.")
        else:
            warnings.append("Festival VAT registration is disabled.")

        printer = FestivalPrinter.objects.filter(is_active=True).first()
        if mode == "cloudprnt":
            if not printer:
                errors.append("No active FestivalPrinter configured.")
            user = settings.FESTIVAL_CLOUDPRNT_USERNAME
            password = settings.FESTIVAL_CLOUDPRNT_PASSWORD
            if not user or not password or password in {"", "changeme", "password"}:
                errors.append("CloudPRNT credentials are missing or placeholder.")
            else:
                self.stdout.write("CloudPRNT credentials: configured")
        else:
            warnings.append("Print mode is disabled (local/API testing only).")

        if not FestivalProduct.objects.filter(is_active=True).exists():
            errors.append("No active festival products.")

        for doc_type in FestivalNumberSequence.DocumentType.values:
            FestivalNumberSequence.objects.get_or_create(
                document_type=doc_type,
                defaults={"last_number": 0},
            )
        self.stdout.write("Number sequences: accessible")

        broker = getattr(settings, "CELERY_BROKER_URL", "")
        if not broker:
            warnings.append("CELERY_BROKER_URL is empty.")

        # Ticket renderer smoke test
        class _DummyOrder:
            pk = 1
            order_number = 1
            created_at = None

            class items:
                @staticmethod
                def all():
                    class _Item:
                        quantity = 1
                        product_name = "Test Product O'Reilly — £"

                    return [_Item()]

        try:
            from django.utils import timezone

            _DummyOrder.created_at = timezone.now()
            text = render_kitchen_ticket(_DummyOrder())
            encoded = text.encode("utf-8")
            if len(encoded) > settings.FESTIVAL_TICKET_MAX_BYTES:
                errors.append("Sample ticket exceeds max payload bytes.")
            self.stdout.write(
                f"Ticket renderer OK ({len(encoded)} bytes, columns={settings.FESTIVAL_TICKET_COLUMNS})"
            )
        except Exception as exc:
            errors.append(f"Ticket renderer failed: {exc}")

        if printer:
            self.stdout.write(
                f"Printer: {printer.name} mac={printer.mac_address} "
                f"online={printer.is_online} last_status={printer.last_status_code!r}"
            )

        for warning in warnings:
            self.stdout.write(self.style.WARNING(f"WARNING: {warning}"))
        if errors:
            for error in errors:
                self.stderr.write(self.style.ERROR(f"ERROR: {error}"))
            raise SystemExit(1)

        self.stdout.write(self.style.SUCCESS("Festival readiness checks passed."))
