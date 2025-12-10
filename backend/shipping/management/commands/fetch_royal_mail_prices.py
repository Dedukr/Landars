"""
Management command to fetch and display Royal Mail shipping prices.
This is useful for testing and debugging Royal Mail price fetching.
"""

from django.core.management.base import BaseCommand
from shipping.sendcloud_client import SendcloudAPIError
from shipping.service import ShippingService


class Command(BaseCommand):
    help = "Fetch Royal Mail shipping prices for a test address"

    def add_arguments(self, parser):
        parser.add_argument(
            "--postal-code",
            type=str,
            default="SW1A 1AA",
            help="Destination postal code (default: SW1A 1AA)",
        )
        parser.add_argument(
            "--country",
            type=str,
            default="GB",
            help="Destination country code (default: GB)",
        )
        parser.add_argument(
            "--weight",
            type=float,
            default=1.0,
            help="Parcel weight in kg (default: 1.0)",
        )
        parser.add_argument(
            "--city",
            type=str,
            default="London",
            help="Destination city (default: London)",
        )

    def handle(self, *args, **options):
        postal_code = options["postal_code"]
        country = options["country"]
        weight = options["weight"]
        city = options["city"]

        self.stdout.write(
            self.style.SUCCESS(
                f"\n{'='*60}\n" f"Fetching Royal Mail Prices\n" f"{'='*60}\n"
            )
        )
        self.stdout.write(f"Destination: {city}, {postal_code}, {country}")
        self.stdout.write(f"Parcel Weight: {weight}kg\n")

        try:
            service = ShippingService()

            # Test address
            address = {
                "country": country,
                "postal_code": postal_code,
                "city": city,
                "address_line": "Test Address",
            }

            # Test items (for weight calculation)
            items = [{"quantity": weight}]

            self.stdout.write("Fetching shipping options from Sendcloud...\n")

            # Get shipping options
            options_list = service.get_shipping_options(address=address, items=items)

            # Filter for Royal Mail options
            royal_mail_options = [
                opt
                for opt in options_list
                if "royal_mail" in opt.get("carrier", "").lower()
            ]

            if royal_mail_options:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"\n✓ Found {len(royal_mail_options)} Royal Mail option(s):\n"
                    )
                )
                for i, option in enumerate(royal_mail_options, 1):
                    self.stdout.write(f"\n{i}. {option.get('name', 'Unknown Service')}")
                    self.stdout.write(f"   Carrier: {option.get('carrier', 'Unknown')}")
                    self.stdout.write(
                        f"   Price: £{option.get('price', '0.00')} {option.get('currency', 'GBP')}"
                    )
                    self.stdout.write(f"   Method ID: {option.get('id', 'N/A')}")
                    if option.get("min_delivery_days") or option.get(
                        "max_delivery_days"
                    ):
                        self.stdout.write(
                            f"   Delivery: {option.get('min_delivery_days', '?')}-{option.get('max_delivery_days', '?')} days"
                        )
                    if option.get("logo_url"):
                        self.stdout.write(f"   Logo: {option.get('logo_url')}")
            else:
                self.stdout.write(
                    self.style.WARNING(
                        "\n⚠ No Royal Mail options found with valid pricing.\n"
                    )
                )
                if options_list:
                    self.stdout.write(
                        f"Found {len(options_list)} other shipping option(s):"
                    )
                    for opt in options_list:
                        self.stdout.write(
                            f"  - {opt.get('carrier')} - {opt.get('name')} (£{opt.get('price')})"
                        )
                else:
                    self.stdout.write("No shipping options found at all.")

            self.stdout.write(f"\n{'='*60}\n")

        except SendcloudAPIError as e:
            self.stdout.write(self.style.ERROR(f"\n✗ Sendcloud API Error: {e}\n"))
            self.stdout.write(
                "Please check:\n"
                "  1. SENDCLOUD_PUBLIC_KEY and SENDCLOUD_SECRET_KEY are set\n"
                "  2. Your Sendcloud account has Royal Mail configured\n"
                "  3. Royal Mail pricing is set up in your Sendcloud panel\n"
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\n✗ Unexpected Error: {e}\n"))
            import traceback

            self.stdout.write(traceback.format_exc())
