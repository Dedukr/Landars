from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from festival.models import (
    FestivalCategory,
    FestivalFilling,
    FestivalMenuSettings,
    FestivalProduct,
)

NONE_DECLARED = "None of the 14 major allergens"

LANDAR_MENU_CATALOG: list[dict[str, Any]] = [
    {
        "name": "Main Dishes",
        "products": [
            {
                "name": "Pelmeni with Meat",
                "price": Decimal("9.00"),
                "portion": "250g",
                "description": "Traditional dumplings filled with pork and beef.",
                "toppings": "Butter and sour cream",
                "allergens": "Wheat (gluten), egg, milk",
                "fillings": [
                    {
                        "name": "Boiled",
                        "description": "Boiled dumplings served with butter and sour cream.",
                        "allergens": "Wheat (gluten), egg, milk",
                    },
                    {
                        "name": "Fried",
                        "description": "Crispy fried dumplings served with sour cream.",
                        "allergens": "Wheat (gluten), egg, milk",
                    },
                ],
            },
            {
                "name": "Varenyky",
                "price": Decimal("9.00"),
                "portion": "250g",
                "description": "Traditional Ukrainian dumplings.",
                "fillings": [
                    {
                        "name": "Potato & Butter",
                        "description": "Filled with potato and served with butter and sour cream.",
                        "allergens": "Wheat (gluten), egg, milk",
                    },
                    {
                        "name": "Potato in Creamy Mushroom Sauce",
                        "description": "Potato-filled dumplings served in a creamy mushroom sauce.",
                        "allergens": "Wheat (gluten), egg, milk",
                    },
                ],
            },
            {
                "name": "Chebureki with Meat",
                "price": Decimal("9.00"),
                "portion": "2 pcs",
                "description": "Crispy fried pastries filled with pork and beef.",
                "allergens": "Wheat (gluten), egg",
            },
            {
                "name": "Crepes",
                "price": Decimal("9.00"),
                "portion": "3 pcs",
                "description": "Traditional crepes served with sour cream.",
                "fillings": [
                    {
                        "name": "Meat",
                        "description": "Crepes filled with meat, served with sour cream.",
                        "allergens": "Wheat (gluten), egg, milk, butter",
                    },
                    {
                        "name": "Apple & Cinnamon",
                        "description": "Crepes with apple and cinnamon filling, served with sour cream.",
                        "allergens": "Wheat (gluten), egg, milk, butter",
                    },
                ],
            },
            {
                "name": "Syrnyky",
                "price": Decimal("9.00"),
                "portion": "4 pcs",
                "description": "Traditional Ukrainian cottage cheese pancakes, served with sour cream.",
                "allergens": "Milk, egg, wheat (gluten), butter",
            },
        ],
    },
    {
        "name": "Grill",
        "products": [
            {
                "name": "Shashlik (Skewer)",
                "price": Decimal("9.00"),
                "portion": "250g",
                "description": "Grilled marinated meat served with French fries and sauerkraut.",
                "toppings": "French fries and sauerkraut",
                "fillings": [
                    {
                        "name": "Chicken",
                        "description": "Grilled marinated chicken served with French fries and sauerkraut.",
                        "allergens": "Mustard",
                    },
                    {
                        "name": "Pork",
                        "description": "Grilled marinated pork served with French fries and sauerkraut.",
                        "allergens": NONE_DECLARED,
                    },
                ],
            },
            {
                "name": "Grilled Pork & Beef Sausage",
                "price": Decimal("9.00"),
                "portion": "1 pc",
                "description": "Grilled pork and beef sausage served with French fries and sauerkraut.",
                "toppings": "French fries and sauerkraut",
                "allergens": NONE_DECLARED,
            },
        ],
    },
    {
        "name": "Salads",
        "products": [
            {
                "name": "Olivier Salad",
                "price": Decimal("9.00"),
                "portion": "250g",
                "ingredients": "Boiled chicken fillet, eggs, potatoes, pickled cucumbers, green peas, spring onions, mayonnaise.",
                "allergens": "Egg, mustard",
            },
            {
                "name": "Crab Stick Salad",
                "price": Decimal("9.00"),
                "portion": "250g",
                "ingredients": "Boiled eggs, potatoes, fresh cucumber, sweetcorn, crab sticks, spring onions.",
                "allergens": "Egg, fish, wheat (gluten)",
            },
            {
                "name": "Vinaigrette Salad",
                "price": Decimal("9.00"),
                "portion": "250g",
                "ingredients": "Boiled potatoes, carrots, beetroot, pickled cucumbers, sauerkraut, beans, spring onions, olive oil.",
                "allergens": NONE_DECLARED,
            },
            {
                "name": "Sauerkraut",
                "price": Decimal("6.00"),
                "portion": "250g",
                "ingredients": "White cabbage, carrots, salt and spices.",
                "allergens": NONE_DECLARED,
            },
            {
                "name": "Marinated Carrot Salad",
                "price": Decimal("6.00"),
                "portion": "250g",
                "ingredients": "Carrots, garlic, apple cider vinegar, sunflower oil, nutmeg, salt, sugar and spices.",
                "allergens": NONE_DECLARED,
            },
        ],
    },
]

INCLUDED_MEAL_OFFER = "All main dishes & grill — £9"

LANDAR_CATEGORY_NAMES = {category["name"] for category in LANDAR_MENU_CATALOG}

# New Landar product name -> existing product name with image to copy from.
PRODUCT_IMAGE_SOURCES: dict[str, str] = {
    "Pelmeni with Meat": "Boiled Pelmeni",
    "Varenyky": "Potato Varenyky",
    "Chebureki with Meat": "Chebureki",
    "Crepes": "Filled Crepes",
    "Syrnyky": "Syrnyky",
    "Shashlik (Skewer)": "Shashlik(grilled meat skewer) with sauerkraut",
}

# (new product name, new filling name) -> existing product name with image to copy from.
FILLING_IMAGE_SOURCES: dict[tuple[str, str], str] = {
    ("Pelmeni with Meat", "Boiled"): "Boiled Pelmeni",
    ("Pelmeni with Meat", "Fried"): "Deep Fried Pelmeni",
    ("Varenyky", "Potato & Butter"): "Potato Varenyky",
    ("Varenyky", "Potato in Creamy Mushroom Sauce"): "Potato Varenyky",
}


def _lookup_source_product_image(source_name: str) -> str:
    """Return image_url from an existing non-Landar product by name."""
    candidates = (
        FestivalProduct.objects.filter(name=source_name)
        .exclude(image_url="")
        .select_related("category")
    )
    for product in candidates:
        if product.category_id and product.category.name not in LANDAR_CATEGORY_NAMES:
            return product.image_url
    first = candidates.first()
    return first.image_url if first else ""


def _inherit_product_images(stats: dict[str, int]) -> None:
    for target_name, source_name in PRODUCT_IMAGE_SOURCES.items():
        image_url = _lookup_source_product_image(source_name)
        if not image_url:
            continue
        updated = FestivalProduct.objects.filter(
            name=target_name,
            category__name__in=LANDAR_CATEGORY_NAMES,
            image_url="",
        ).update(image_url=image_url)
        stats["product_images_copied"] += updated


def _inherit_filling_images(stats: dict[str, int]) -> None:
    for (target_product_name, target_filling_name), source_name in (
        FILLING_IMAGE_SOURCES.items()
    ):
        image_url = _lookup_source_product_image(source_name)
        if not image_url:
            continue
        updated = FestivalFilling.objects.filter(
            product__name=target_product_name,
            product__category__name__in=LANDAR_CATEGORY_NAMES,
            name=target_filling_name,
            image_url="",
        ).update(image_url=image_url)
        stats["filling_images_copied"] += updated


def upsert_landar_menu() -> dict[str, int]:
    """Upsert Landar festival menu categories, products, and fillings."""
    stats = {
        "categories_created": 0,
        "categories_existing": 0,
        "products_created": 0,
        "products_updated": 0,
        "fillings_created": 0,
        "fillings_updated": 0,
        "product_images_copied": 0,
        "filling_images_copied": 0,
    }

    for category_data in LANDAR_MENU_CATALOG:
        category, created = FestivalCategory.objects.get_or_create(
            name=category_data["name"],
            defaults={"is_active": True},
        )
        if created:
            stats["categories_created"] += 1
        else:
            stats["categories_existing"] += 1

        for product_data in category_data["products"]:
            fillings = product_data.get("fillings", [])
            product_defaults = {
                "category": category,
                "price": product_data["price"],
                "portion": product_data.get("portion", ""),
                "description": product_data.get("description", ""),
                "ingredients": product_data.get("ingredients", ""),
                "toppings": product_data.get("toppings", ""),
                "allergens": product_data.get("allergens", ""),
                "vat_rate": Decimal("0"),
                "is_active": True,
            }
            product, created = FestivalProduct.objects.update_or_create(
                name=product_data["name"],
                category=category,
                defaults=product_defaults,
            )
            if created:
                stats["products_created"] += 1
            else:
                stats["products_updated"] += 1

            for filling_data in fillings:
                filling, filling_created = FestivalFilling.objects.update_or_create(
                    product=product,
                    name=filling_data["name"],
                    defaults={
                        "description": filling_data.get("description", ""),
                        "allergens": filling_data.get("allergens", ""),
                        "is_active": True,
                    },
                )
                if filling_created:
                    stats["fillings_created"] += 1
                else:
                    stats["fillings_updated"] += 1

    FestivalMenuSettings.objects.update_or_create(
        pk=1,
        defaults={"included_meal_offer": INCLUDED_MEAL_OFFER},
    )

    _inherit_product_images(stats)
    _inherit_filling_images(stats)

    return stats


class Command(BaseCommand):
    help = "Upsert Landar's festival menu categories, products, and fillings."

    def handle(self, *args, **options):
        with transaction.atomic():
            stats = upsert_landar_menu()

        self.stdout.write(
            self.style.SUCCESS(
                "Landar festival menu upserted: "
                f"{stats['categories_created']} categories created, "
                f"{stats['categories_existing']} existing; "
                f"{stats['products_created']} products created, "
                f"{stats['products_updated']} updated; "
                f"{stats['fillings_created']} fillings created, "
                f"{stats['fillings_updated']} updated; "
                f"{stats['product_images_copied']} product images copied, "
                f"{stats['filling_images_copied']} filling images copied."
            )
        )
        self.stdout.write(f"Menu banner: {INCLUDED_MEAL_OFFER}")
