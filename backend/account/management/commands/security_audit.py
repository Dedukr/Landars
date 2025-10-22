"""
Management command to audit password reset security.
This helps identify potential security issues and suspicious activity.
"""

from datetime import timedelta

from account.models import CustomUser, PasswordResetToken
from django.core.management.base import BaseCommand
from django.db.models import Count, Q
from django.utils import timezone


class Command(BaseCommand):
    help = "Audit password reset security and identify suspicious activity"

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=24,
            help="Number of hours to look back for analysis (default: 24)",
        )

    def handle(self, *args, **options):
        hours = options["hours"]
        cutoff_time = timezone.now() - timedelta(hours=hours)

        self.stdout.write(
            self.style.SUCCESS(f"Password Reset Security Audit (Last {hours} hours)")
        )
        self.stdout.write("=" * 50)

        # 1. Total password reset requests
        total_requests = PasswordResetToken.objects.filter(
            created_at__gte=cutoff_time
        ).count()

        self.stdout.write(f"Total password reset requests: {total_requests}")

        # 2. Successful resets
        successful_resets = PasswordResetToken.objects.filter(
            created_at__gte=cutoff_time, is_used=True, used_at__isnull=False
        ).count()

        self.stdout.write(f"Successful password resets: {successful_resets}")

        # 3. Expired tokens
        expired_tokens = PasswordResetToken.objects.filter(
            created_at__gte=cutoff_time, expires_at__lt=timezone.now(), is_used=False
        ).count()

        self.stdout.write(f"Expired unused tokens: {expired_tokens}")

        # 4. Users with multiple reset requests
        multiple_requests = (
            PasswordResetToken.objects.filter(created_at__gte=cutoff_time)
            .values("user__email")
            .annotate(request_count=Count("id"))
            .filter(request_count__gt=3)
            .order_by("-request_count")
        )

        if multiple_requests:
            self.stdout.write(
                self.style.WARNING("\nUsers with multiple reset requests (>3):")
            )
            for item in multiple_requests:
                self.stdout.write(
                    f'  - {item["user__email"]}: {item["request_count"]} requests'
                )

        # 5. Suspicious IP addresses (multiple requests from same IP)
        suspicious_ips = (
            PasswordResetToken.objects.filter(
                created_at__gte=cutoff_time, ip_address__isnull=False
            )
            .values("ip_address")
            .annotate(request_count=Count("id"))
            .filter(request_count__gt=5)
            .order_by("-request_count")
        )

        if suspicious_ips:
            self.stdout.write(
                self.style.WARNING("\nSuspicious IP addresses (>5 requests):")
            )
            for item in suspicious_ips:
                self.stdout.write(
                    f'  - {item["ip_address"]}: {item["request_count"]} requests'
                )

        # 6. Recent security events
        recent_events = (
            PasswordResetToken.objects.filter(created_at__gte=cutoff_time)
            .select_related("user")
            .order_by("-created_at")[:10]
        )

        if recent_events:
            self.stdout.write("\nRecent password reset events:")
            for token in recent_events:
                status = (
                    "USED"
                    if token.is_used
                    else "EXPIRED" if token.expires_at < timezone.now() else "ACTIVE"
                )
                self.stdout.write(
                    f'  - {token.user.email} ({status}) - {token.created_at.strftime("%Y-%m-%d %H:%M")}'
                )

        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("Audit completed.")
