from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from festival.models import (
    FestivalAddition,
    FestivalAdditionClass,
    FestivalCategory,
    FestivalFilling,
    FestivalMenuSettings,
    FestivalProduct,
)

User = get_user_model()


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


@override_settings(FESTIVAL_ENABLED=True, FESTIVAL_PRINT_MODE="disabled")
class FestivalPublicMenuAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.meals = FestivalCategory.objects.create(name="Meals")
        self.drinks = FestivalCategory.objects.create(name="Drinks")

        self.public_product = FestivalProduct.objects.create(
            name="Varenyky",
            category=self.meals,
            price=Decimal("8.50"),
            vat_rate=0,
            portion="6 pieces",
            description="Handmade dumplings",
            ingredients="Flour, potato, onion",
            allergens="Gluten",
            is_active=True,
        )
        FestivalFilling.objects.create(
            product=self.public_product,
            name="Potato",
            description="Potato and onion filling",
            allergens="Gluten",
            is_active=True,
        )
        FestivalFilling.objects.create(
            product=self.public_product,
            name="Cheese",
            allergens="Gluten, milk",
            is_active=True,
        )
        FestivalFilling.objects.create(
            product=self.public_product, name="Retired", is_active=False
        )

        self.hidden_product = FestivalProduct.objects.create(
            name="Staff only",
            category=self.meals,
            price=Decimal("5.00"),
            is_active=False,
        )
        self.inactive_product = FestivalProduct.objects.create(
            name="Unavailable",
            category=self.meals,
            price=Decimal("4.00"),
            is_active=False,
        )

        self.shashlik = FestivalProduct.objects.create(
            name="Shashlik",
            category=self.meals,
            price=Decimal("9.00"),
            is_active=True,
        )
        FestivalFilling.objects.create(
            product=self.shashlik, name="Chicken", is_active=True
        )
        FestivalFilling.objects.create(
            product=self.shashlik, name="Pork", is_active=True
        )

        addition_class = FestivalAdditionClass.objects.create(name="Soft drinks")
        FestivalAddition.objects.create(
            name="Cola",
            addition_class=addition_class,
            price=Decimal("1.50"),
            is_active=True,
        )
        FestivalAddition.objects.create(
            name="Retired drink",
            addition_class=addition_class,
            price=Decimal("2.00"),
            is_active=False,
        )
        self.drink = FestivalProduct.objects.create(
            name="Kvas",
            category=self.drinks,
            addition_class=addition_class,
            price=Decimal("3.00"),
            is_active=True,
        )

        FestivalMenuSettings.objects.update_or_create(
            pk=1,
            defaults={"included_meal_offer": "Main + side + drink for £15"},
        )

    def test_anonymous_get_returns_200(self):
        resp = self.client.get("/api/festival/menu/")
        self.assertEqual(resp.status_code, 200)

    def test_excludes_inactive_products(self):
        resp = self.client.get("/api/festival/menu/")
        names = [
            product["name"]
            for category in resp.data["categories"]
            for product in category["products"]
        ]
        self.assertIn("Varenyky", names)
        self.assertIn("Shashlik", names)
        self.assertIn("Kvas", names)
        self.assertNotIn("Staff only", names)
        self.assertNotIn("Unavailable", names)

    def test_response_contains_only_public_fields(self):
        resp = self.client.get("/api/festival/menu/")
        self.assertEqual(resp.data["included_meal_offer"], "Main + side + drink for £15")

        meals = next(c for c in resp.data["categories"] if c["name"] == "Meals")
        varenyky = next(p for p in meals["products"] if p["name"] == "Varenyky")

        self.assertEqual(
            set(varenyky.keys()),
            {
                "name",
                "category",
                "image",
                "price",
                "portion",
                "description",
                "fillings",
                "addition_class",
                "additions",
                "ingredients",
                "toppings",
                "allergens",
            },
        )
        self.assertNotIn("id", varenyky)
        self.assertNotIn("vat_rate", varenyky)
        self.assertEqual(varenyky["portion"], "6 pieces")
        self.assertEqual(varenyky["description"], "Handmade dumplings")
        self.assertEqual(
            [f["name"] for f in varenyky["fillings"]], ["Cheese", "Potato"]
        )
        self.assertEqual(
            set(varenyky["fillings"][0].keys()),
            {"name", "image", "description", "allergens"},
        )
        self.assertEqual(varenyky["fillings"][0]["image"], "")
        self.assertEqual(varenyky["fillings"][0]["description"], "Potato and onion filling")
        self.assertEqual(varenyky["fillings"][0]["allergens"], "Gluten")
        cheese = next(f for f in varenyky["fillings"] if f["name"] == "Cheese")
        self.assertEqual(cheese["description"], "Handmade dumplings")
        self.assertEqual(cheese["allergens"], "Gluten, milk")

        shashlik = next(p for p in meals["products"] if p["name"] == "Shashlik")
        self.assertEqual(
            sorted(f["name"] for f in shashlik["fillings"]), ["Chicken", "Pork"]
        )

        drinks = next(c for c in resp.data["categories"] if c["name"] == "Drinks")
        kvas = drinks["products"][0]
        self.assertEqual(kvas["addition_class"], "Soft drinks")
        self.assertEqual([a["name"] for a in kvas["additions"]], ["Cola"])
        self.assertEqual(set(kvas["additions"][0].keys()), {"name", "price"})

    def test_non_get_methods_return_405(self):
        for method in ("post", "put", "patch", "delete"):
            resp = getattr(self.client, method)("/api/festival/menu/", {}, format="json")
            self.assertEqual(resp.status_code, 405, msg=method)

    def test_staff_endpoints_remain_protected(self):
        resp_products = self.client.get("/api/festival/products/")
        resp_status = self.client.get("/api/festival/status/")
        resp_orders = self.client.post(
            "/api/festival/orders/",
            {"client_request_id": "00000000-0000-0000-0000-000000000001", "items": []},
            format="json",
        )
        self.assertEqual(resp_products.status_code, 401)
        self.assertEqual(resp_status.status_code, 401)
        self.assertEqual(resp_orders.status_code, 401)

        staff = make_staff()
        self.client.force_authenticate(user=staff)
        self.assertEqual(self.client.get("/api/festival/products/").status_code, 200)
        self.assertEqual(self.client.get("/api/festival/status/").status_code, 200)

    def test_active_products_appear_on_public_menu(self):
        product = FestivalProduct.objects.create(
            name="Syrnyky",
            category=self.meals,
            price=Decimal("9.99"),
            is_active=True,
        )
        resp = self.client.get("/api/festival/menu/")
        names = [
            item["name"]
            for category in resp.data["categories"]
            for item in category["products"]
        ]
        self.assertIn("Syrnyky", names)

    def test_filling_image_falls_back_to_product_image(self):
        self.public_product.image_url = "https://example.com/varenyky.jpg"
        self.public_product.save(update_fields=["image_url"])
        potato = FestivalFilling.objects.get(product=self.public_product, name="Potato")
        potato.image_url = "https://example.com/potato.jpg"
        potato.save(update_fields=["image_url"])

        resp = self.client.get("/api/festival/menu/")
        meals = next(c for c in resp.data["categories"] if c["name"] == "Meals")
        varenyky = next(p for p in meals["products"] if p["name"] == "Varenyky")
        images = {f["name"]: f["image"] for f in varenyky["fillings"]}
        self.assertEqual(images["Potato"], "https://example.com/potato.jpg")
        self.assertEqual(images["Cheese"], "https://example.com/varenyky.jpg")

    def test_festival_categories_are_used_for_grouping(self):
        resp = self.client.get("/api/festival/menu/")
        self.assertEqual(
            [c["name"] for c in resp.data["categories"]],
            ["Meals", "Drinks"],
        )

    def test_public_menu_available_when_festival_disabled(self):
        with override_settings(FESTIVAL_ENABLED=False):
            resp = self.client.get("/api/festival/menu/")
        self.assertEqual(resp.status_code, 200)
