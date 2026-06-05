from decimal import Decimal
from unittest.mock import MagicMock, patch

from account.models import Profile
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Cart, CartItem, Order, OrderItem, Product
from notifications.models import NotificationLog
from notifications.services.order_alerts import send_new_order_admin_alert
from notifications.services.telegram_formatting import (
    format_money,
    format_order_for_telegram,
    format_order_items_for_telegram,
)
from notifications.tasks import send_new_order_telegram_alert_task

User = get_user_model()


def _telegram_settings(**overrides):
    base = {
        "TELEGRAM_BOT_TOKEN": "test-token",
        "TELEGRAM_ADMIN_CHAT_ID": "12345",
        "TELEGRAM_ORDER_ALERTS_ENABLED": True,
        "TELEGRAM_ORDER_ALERTS_TIMEOUT_SECONDS": 5,
        "SITE_URL": "https://example.com",
        "CELERY_TASK_ALWAYS_EAGER": True,
        "CELERY_TASK_EAGER_PROPAGATES": True,
    }
    base.update(overrides)
    return base


class TelegramFormattingTests(TestCase):
    def test_format_money_handles_missing_values(self):
        self.assertEqual(format_money(None), "")
        self.assertEqual(format_money(""), "")
        self.assertEqual(format_money(Decimal("10.5")), "£10.50")

    def test_format_order_items_truncates_long_lists(self):
        order = Order.objects.create(source=Order.Source.FRONTEND)
        for idx in range(7):
            OrderItem.objects.create(
                order=order,
                item_name=f"Product {idx}",
                item_price=Decimal("1.00"),
                quantity=1,
            )
        text = format_order_items_for_telegram(order, max_items=5)
        self.assertIn("Product 0", text)
        self.assertIn("+ 2 more items", text)

    def test_format_order_for_telegram_omits_missing_contact_fields(self):
        user = User.objects.create_user(
            name="Anna Smith", email="anna@example.com", password="pass"
        )
        order = Order.objects.create(customer=user, source=Order.Source.FRONTEND)
        OrderItem.objects.create(
            order=order,
            item_name="Pie",
            item_price=Decimal("5.50"),
            quantity=2,
        )
        message = format_order_for_telegram(order)
        self.assertIn("Anna Smith", message)
        self.assertIn("anna@example.com", message)
        self.assertNotIn("None", message)
        self.assertNotIn("Phone:", message)

    def test_format_order_for_telegram_phone_is_whatsapp_link(self):
        user = User.objects.create_user(
            name="Anna Smith", email="anna@example.com", password="pass"
        )
        Profile.objects.create(user=user, phone="+441234567890")
        order = Order.objects.create(customer=user, source=Order.Source.FRONTEND)
        message = format_order_for_telegram(order)
        self.assertIn(
            '<a href="https://wa.me/441234567890">+441234567890</a>',
            message,
        )
        self.assertNotIn("WhatsApp", message)
        self.assertIn("<b>Phone:</b>", message)

    def test_format_order_for_telegram_includes_delivery_price(self):
        user = User.objects.create_user(
            name="Anna Smith", email="anna@example.com", password="pass"
        )
        order = Order.objects.create(
            customer=user,
            source=Order.Source.FRONTEND,
            delivery_fee=Decimal("10.00"),
        )
        message = format_order_for_telegram(order)
        self.assertIn("<b>Delivery:</b> £10.00", message)

    def test_format_order_for_telegram_shows_free_delivery(self):
        user = User.objects.create_user(
            name="Anna Smith", email="anna@example.com", password="pass"
        )
        order = Order.objects.create(
            customer=user,
            source=Order.Source.FRONTEND,
            delivery_fee=Decimal("0"),
        )
        message = format_order_for_telegram(order)
        self.assertIn("<b>Delivery:</b> Free", message)


@override_settings(**_telegram_settings())
class SendNewOrderAdminAlertTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            name="Customer One",
            email="customer@example.com",
            password="pass",
        )
        Profile.objects.create(user=self.user, phone="+441234567890")
        self.order = Order.objects.create(
            customer=self.user,
            source=Order.Source.FRONTEND,
            status="pending",
        )
        OrderItem.objects.create(
            order=self.order,
            item_name="Test item",
            item_price=Decimal("10.00"),
            quantity=1,
        )

    @patch("notifications.services.telegram.requests.post")
    def test_sends_alert_for_frontend_order(self, mock_post):
        mock_post.return_value = MagicMock(
            ok=True,
            status_code=200,
            json=lambda: {"ok": True, "result": {"message_id": 99}},
        )
        mock_post.return_value.raise_for_status = MagicMock()

        result = send_new_order_admin_alert(self.order.id)

        self.assertTrue(result)
        mock_post.assert_called_once()
        log = NotificationLog.objects.get(order=self.order)
        self.assertEqual(log.status, NotificationLog.Status.SENT)
        self.assertEqual(log.provider_message_id, "99")

    @patch("notifications.services.telegram.requests.post")
    def test_skips_admin_source_orders(self, mock_post):
        self.order.source = Order.Source.ADMIN
        self.order.save(update_fields=["source"])

        result = send_new_order_admin_alert(self.order.id)

        self.assertFalse(result)
        mock_post.assert_not_called()
        self.assertFalse(NotificationLog.objects.filter(order=self.order).exists())

    @patch("notifications.services.telegram.requests.post")
    def test_duplicate_call_does_not_send_twice(self, mock_post):
        mock_post.return_value = MagicMock(
            ok=True,
            status_code=200,
            json=lambda: {"ok": True, "result": {"message_id": 1}},
        )
        mock_post.return_value.raise_for_status = MagicMock()

        self.assertTrue(send_new_order_admin_alert(self.order.id))
        self.assertFalse(send_new_order_admin_alert(self.order.id))
        mock_post.assert_called_once()

    @patch("notifications.services.telegram.requests.post")
    def test_telegram_failure_does_not_raise(self, mock_post):
        mock_post.side_effect = Exception("network down")

        result = send_new_order_admin_alert(self.order.id)

        self.assertFalse(result)
        log = NotificationLog.objects.get(order=self.order)
        self.assertEqual(log.status, NotificationLog.Status.FAILED)


@override_settings(**_telegram_settings())
class OrderCreationTelegramIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            name="Shopper",
            email="shopper@example.com",
            password="pass",
        )
        Profile.objects.create(user=self.user, phone="+449999999999")
        self.product = Product.objects.create(
            name="Sourdough",
            base_price=Decimal("4.50"),
        )
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(
            cart=self.cart, product=self.product, quantity=Decimal("2")
        )
        self.client.force_authenticate(user=self.user)

    def test_order_creation_requires_phone(self):
        Profile.objects.filter(user=self.user).update(phone="")
        response = self.client.post("/api/orders/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data["error"].lower())

    @patch("notifications.services.telegram.requests.post")
    def test_frontend_order_creation_schedules_telegram_alert(self, mock_post):
        mock_post.return_value = MagicMock(
            ok=True,
            status_code=200,
            json=lambda: {"ok": True, "result": {"message_id": 42}},
        )
        mock_post.return_value.raise_for_status = MagicMock()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                "/api/orders/",
                {"notes": "Leave at door"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(pk=response.data["id"])
        self.assertEqual(order.source, Order.Source.FRONTEND)
        log = NotificationLog.objects.get(order=order)
        self.assertEqual(log.status, NotificationLog.Status.SENT)
        mock_post.assert_called_once()

    @patch("notifications.tasks.send_new_order_telegram_alert_task.delay")
    def test_admin_created_order_does_not_schedule_alert(self, mock_delay):
        Order.objects.create(customer=self.user, source=Order.Source.ADMIN)
        mock_delay.assert_not_called()

    @patch("notifications.tasks.send_new_order_telegram_alert_task.delay")
    def test_order_update_does_not_schedule_alert(self, mock_delay):
        order = Order.objects.create(
            customer=self.user,
            source=Order.Source.FRONTEND,
        )
        mock_delay.reset_mock()
        order.status = "paid"
        order.save(update_fields=["status"])
        mock_delay.assert_not_called()

    @override_settings(**_telegram_settings(TELEGRAM_ORDER_ALERTS_ENABLED=False))
    @patch("notifications.tasks.send_new_order_telegram_alert_task.delay")
    def test_missing_telegram_settings_do_not_break_order_creation(self, mock_delay):
        def run_task(order_id):
            send_new_order_telegram_alert_task(order_id)

        mock_delay.side_effect = run_task

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/orders/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Order.objects.filter(pk=response.data["id"]).exists())

    @patch("notifications.services.telegram.requests.post")
    def test_telegram_api_failure_does_not_break_order_creation(self, mock_post):
        mock_post.return_value = MagicMock(
            ok=True,
            status_code=200,
            json=lambda: {"ok": False, "description": "Bad Request"},
        )
        mock_post.return_value.raise_for_status = MagicMock()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/orders/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        log = NotificationLog.objects.get(order_id=response.data["id"])
        self.assertEqual(log.status, NotificationLog.Status.FAILED)

    @patch("notifications.tasks.send_new_order_telegram_alert_task.delay")
    def test_notification_scheduled_on_commit(self, mock_delay):
        seen_during_request = []

        def capture(order_id):
            seen_during_request.append(Order.objects.filter(pk=order_id).exists())

        mock_delay.side_effect = capture

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/orders/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(seen_during_request), 1)
        self.assertTrue(seen_during_request[0])

    @patch("notifications.services.telegram.requests.post")
    def test_task_handles_missing_order(self, mock_post):
        result = send_new_order_telegram_alert_task(999999)
        self.assertFalse(result)
        mock_post.assert_not_called()
