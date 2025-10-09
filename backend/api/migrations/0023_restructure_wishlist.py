# Generated manually to restructure wishlist models

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("account", "0001_initial"),
        ("api", "0022_cart_cartitem"),
    ]

    operations = [
        # First, remove the old wishlist model
        migrations.DeleteModel(
            name="Wishlist",
        ),
        # Create the new Wishlist model (similar to Cart)
        migrations.CreateModel(
            name="Wishlist",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="wishlist",
                        to="account.customuser",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Wishlists",
            },
        ),
        # Create the new WishlistItem model (similar to CartItem)
        migrations.CreateModel(
            name="WishlistItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("added_date", models.DateTimeField(auto_now_add=True)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="api.product"
                    ),
                ),
                (
                    "wishlist",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="api.wishlist",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Wishlist Items",
                "ordering": ["-added_date"],
            },
        ),
        # Add unique constraint to prevent duplicate products in wishlist
        migrations.AlterUniqueTogether(
            name="wishlistitem",
            unique_together={("wishlist", "product")},
        ),
    ]
