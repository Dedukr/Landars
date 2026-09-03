from __future__ import annotations

from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase

from festival.management.commands.seed_landar_menu import (
    INCLUDED_MEAL_OFFER,
    LANDAR_MENU_CATALOG,
    upsert_landar_menu,
)
from festival.models import (
    FestivalCategory,
    FestivalFilling,
    FestivalMenuSettings,
    FestivalProduct,
)


class SeedLandarMenuCommandTests(TestCase):
    def test_seed_is_idempotent(self):
        call_command("seed_landar_menu")
        first_product_count = FestivalProduct.objects.count()
        first_filling_count = FestivalFilling.objects.count()

        call_command("seed_landar_menu")

        self.assertEqual(FestivalCategory.objects.count(), len(LANDAR_MENU_CATALOG))
        self.assertEqual(FestivalProduct.objects.count(), first_product_count)
        self.assertEqual(FestivalFilling.objects.count(), first_filling_count)

    def test_creates_expected_catalog(self):
        call_command("seed_landar_menu")

        expected_product_count = sum(
            len(category["products"]) for category in LANDAR_MENU_CATALOG
        )
        expected_filling_count = sum(
            len(product.get("fillings", []))
            for category in LANDAR_MENU_CATALOG
            for product in category["products"]
        )

        self.assertEqual(FestivalCategory.objects.count(), 3)
        self.assertEqual(FestivalProduct.objects.count(), expected_product_count)
        self.assertEqual(FestivalFilling.objects.count(), expected_filling_count)

        category_names = set(
            FestivalCategory.objects.values_list("name", flat=True)
        )
        self.assertEqual(category_names, {"Main Dishes", "Grill", "Salads"})

    def test_pelmeni_product_and_fillings(self):
        call_command("seed_landar_menu")

        pelmeni = FestivalProduct.objects.get(name="Pelmeni with Meat")
        self.assertEqual(pelmeni.category.name, "Main Dishes")
        self.assertEqual(pelmeni.price, Decimal("9.00"))
        self.assertEqual(pelmeni.portion, "250g")
        self.assertEqual(pelmeni.allergens, "Wheat (gluten), egg, milk")

        filling_names = set(
            pelmeni.fillings.filter(is_active=True).values_list("name", flat=True)
        )
        self.assertEqual(filling_names, {"Boiled", "Fried"})

        boiled = pelmeni.fillings.get(name="Boiled")
        self.assertIn("butter and sour cream", boiled.description.lower())
        self.assertEqual(boiled.allergens, "Wheat (gluten), egg, milk")

    def test_menu_settings_banner(self):
        call_command("seed_landar_menu")

        settings = FestivalMenuSettings.load()
        self.assertEqual(settings.included_meal_offer, INCLUDED_MEAL_OFFER)

    def test_salad_pricing(self):
        call_command("seed_landar_menu")

        sauerkraut = FestivalProduct.objects.get(name="Sauerkraut")
        self.assertEqual(sauerkraut.price, Decimal("6.00"))
        self.assertEqual(sauerkraut.category.name, "Salads")

        olivier = FestivalProduct.objects.get(name="Olivier Salad")
        self.assertEqual(olivier.price, Decimal("9.00"))
        self.assertIn("chicken fillet", olivier.ingredients.lower())

    def test_copies_images_from_existing_similar_products(self):
        legacy_category = FestivalCategory.objects.create(name="Meals")
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Boiled Pelmeni",
            price=Decimal("8.00"),
            image_url="https://example.com/boiled-pelmeni.jpg",
        )
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Deep Fried Pelmeni",
            price=Decimal("8.00"),
            image_url="https://example.com/fried-pelmeni.jpg",
        )
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Potato Varenyky",
            price=Decimal("8.00"),
            image_url="https://example.com/potato-varenyky.jpg",
        )
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Chebureki",
            price=Decimal("8.00"),
            image_url="https://example.com/chebureki.jpg",
        )
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Filled Crepes",
            price=Decimal("8.00"),
            image_url="https://example.com/crepes.jpg",
        )
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Syrnyky",
            price=Decimal("8.00"),
            image_url="https://example.com/legacy-syrnyky.jpg",
        )
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Shashlik(grilled meat skewer) with sauerkraut",
            price=Decimal("8.00"),
            image_url="https://example.com/shashlik.jpg",
        )

        stats = upsert_landar_menu()

        pelmeni = FestivalProduct.objects.get(
            name="Pelmeni with Meat", category__name="Main Dishes"
        )
        self.assertEqual(pelmeni.image_url, "https://example.com/boiled-pelmeni.jpg")
        self.assertEqual(
            pelmeni.fillings.get(name="Boiled").image_url,
            "https://example.com/boiled-pelmeni.jpg",
        )
        self.assertEqual(
            pelmeni.fillings.get(name="Fried").image_url,
            "https://example.com/fried-pelmeni.jpg",
        )

        varenyky = FestivalProduct.objects.get(
            name="Varenyky", category__name="Main Dishes"
        )
        self.assertEqual(varenyky.image_url, "https://example.com/potato-varenyky.jpg")
        for filling_name in ("Potato & Butter", "Potato in Creamy Mushroom Sauce"):
            self.assertEqual(
                varenyky.fillings.get(name=filling_name).image_url,
                "https://example.com/potato-varenyky.jpg",
            )

        chebureki = FestivalProduct.objects.get(
            name="Chebureki with Meat", category__name="Main Dishes"
        )
        self.assertEqual(chebureki.image_url, "https://example.com/chebureki.jpg")

        crepes = FestivalProduct.objects.get(name="Crepes", category__name="Main Dishes")
        self.assertEqual(crepes.image_url, "https://example.com/crepes.jpg")

        syrnyky = FestivalProduct.objects.get(name="Syrnyky", category__name="Main Dishes")
        self.assertEqual(syrnyky.image_url, "https://example.com/legacy-syrnyky.jpg")

        shashlik = FestivalProduct.objects.get(
            name="Shashlik (Skewer)", category__name="Grill"
        )
        self.assertEqual(shashlik.image_url, "https://example.com/shashlik.jpg")

        self.assertGreaterEqual(stats["product_images_copied"], 6)
        self.assertGreaterEqual(stats["filling_images_copied"], 4)

    def test_image_copy_is_idempotent_and_does_not_overwrite(self):
        legacy_category = FestivalCategory.objects.create(name="Meals")
        FestivalProduct.objects.create(
            category=legacy_category,
            name="Potato Varenyky",
            price=Decimal("8.00"),
            image_url="https://example.com/potato-varenyky.jpg",
        )

        upsert_landar_menu()
        varenyky = FestivalProduct.objects.get(
            name="Varenyky", category__name="Main Dishes"
        )
        varenyky.image_url = "https://example.com/custom.jpg"
        varenyky.save(update_fields=["image_url"])

        stats = upsert_landar_menu()

        varenyky.refresh_from_db()
        self.assertEqual(varenyky.image_url, "https://example.com/custom.jpg")
        self.assertEqual(stats["product_images_copied"], 0)
