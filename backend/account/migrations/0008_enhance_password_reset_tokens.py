# Generated manually to enhance password reset tokens

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("account", "0007_customuser_is_email_verified_emailverificationtoken"),
    ]

    operations = [
        # Add new fields to PasswordResetToken
        migrations.AddField(
            model_name="passwordresettoken",
            name="ip_address",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="passwordresettoken",
            name="user_agent",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="passwordresettoken",
            name="used_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        # Add database indexes for better performance using Django ORM
        migrations.AddIndex(
            model_name="passwordresettoken",
            index=models.Index(
                fields=["user", "is_used", "expires_at"],
                name="account_passwordresettoken_user_is_used_expires_at_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="passwordresettoken",
            index=models.Index(
                fields=["token", "is_used"],
                name="account_passwordresettoken_token_is_used_idx",
            ),
        ),
    ]
