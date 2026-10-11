"""No cloud access: exercise isolation, actual callers, downloads and DB refresh."""
import io
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import urlsplit

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image

from backend import file_storage as storage
from api import r2_storage


@override_settings(APP_ENV="development", DEBUG=True, URL_BASE="https://localhost", ALLOWED_HOSTS=["testserver", "localhost"])
class DevelopmentStorageTests(SimpleTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        override = override_settings(DEVELOPMENT_FILE_ROOT=self.folder.name)
        override.enable()
        self.addCleanup(override.disable)
        cloud = patch("boto3.client", side_effect=AssertionError("Unexpected cloud connection"))
        cloud.start()
        self.addCleanup(cloud.stop)

    def test_local_replacement_never_shadows_restored_production_key(self):
        key = "invoices/invoice_3200.pdf"
        ref = storage.store_bytes(b"local invoice", key)
        again = storage.store_bytes(b"second local invoice", key)
        self.assertNotEqual(ref, again)
        self.assertEqual(storage.read_bytes(ref), b"local invoice")
        self.assertEqual(storage.read_bytes(again), b"second local invoice")
        cloud = Mock()
        cloud.generate_presigned_url.return_value = "https://production/invoice"
        with patch.object(storage, "get_s3_client", return_value=cloud):
            self.assertEqual(storage.file_url(key), "https://production/invoice")
            cloud.generate_presigned_url.assert_called_once_with("get_object", Params={"Bucket": storage.settings.AWS_STORAGE_BUCKET_NAME, "Key": key}, ExpiresIn=300)

    def test_normal_restart_preserves_local_bytes_and_reference(self):
        ref = storage.store_bytes(b"persist", "invoices/invoice_1.pdf")
        # A new settings context/process uses the same persistent root and DB ref.
        with override_settings(DEVELOPMENT_FILE_ROOT=self.folder.name):
            self.assertEqual(storage.read_bytes(ref), b"persist")

    def test_production_deletes_are_noops_local_deletes_work(self):
        with self.assertLogs("backend.file_storage", level="WARNING") as logs:
            self.assertFalse(storage.delete_file("shipment_labels/production.pdf"))
            self.assertFalse(r2_storage.delete_image_from_r2("products/production.jpg"))
        self.assertEqual(len(logs.records), 2)
        self.assertIn("shipment_labels/production.pdf", logs.output[0])
        self.assertIn("products/production.jpg", logs.output[1])
        ref = storage.store_bytes(b"label", "shipment_labels/local.pdf")
        self.assertTrue(storage.delete_file(ref))
        self.assertFalse(storage.local_path(ref).exists())

    def test_documents_open_in_browser_with_signed_link(self):
        ref = storage.store_bytes(b"%PDF-test", "invoices/invoice_1.pdf")
        url = storage.file_url(ref)
        parsed = urlsplit(url)
        response = self.client.get(parsed.path + "?" + parsed.query)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-test")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(self.client.get(parsed.path).status_code, 403)
        self.assertEqual(self.client.get(parsed.path + "?" + parsed.query + "broken").status_code, 403)
        with patch("django.core.signing.time.time", return_value=time.time() + 3601):
            self.assertEqual(self.client.get(parsed.path + "?" + parsed.query).status_code, 403)

    def test_shorter_signature_lifetime_is_respected(self):
        ref = storage.store_bytes(b"PDF", "invoices/a.pdf")
        parsed = urlsplit(storage.file_url(ref, expires_in=10))
        with patch("django.core.signing.time.time", return_value=time.time() + 12):
            self.assertEqual(self.client.get(parsed.path + "?" + parsed.query).status_code, 403)

    def test_path_traversal_and_symlinks_are_rejected(self):
        for ref in ("local://documents/../../secret", "local://images/../documents/private.pdf", "local:///etc/passwd", "local://documents/x\\y"):
            with self.assertRaises(ValueError):
                storage.local_path(ref)
        with tempfile.TemporaryDirectory() as outside:
            Path(self.folder.name, "documents").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                storage.store_bytes(b"unsafe", "invoices/a.pdf")

    def test_image_put_capability_and_public_image_url(self):
        out = io.BytesIO()
        Image.new("RGB", (2, 2)).save(out, format="PNG")
        data = out.getvalue()
        upload = r2_storage.generate_presigned_upload_url("products/1/a.png", "image/png")
        self.assertTrue(upload["object_key"].startswith("local://images/"))
        parsed = urlsplit(upload["presigned_url"])
        path = parsed.path + "?" + parsed.query
        self.assertEqual(self.client.put(path, data, content_type="image/png").status_code, 200)
        image = self.client.get(urlsplit(upload["public_url"]).path)
        self.assertEqual(b"".join(image.streaming_content), data)
        self.assertEqual(self.client.put(path, data, content_type="image/png").status_code, 409)
        self.assertEqual(r2_storage.object_key_from_public_url(upload["public_url"]), upload["object_key"])
        old_host = upload["public_url"].replace("https://localhost", "http://10.1.2.3:8000", 1)
        self.assertEqual(r2_storage.object_key_from_public_url(old_host), upload["object_key"])
        self.assertTrue(r2_storage.delete_image_from_r2(upload["object_key"]))

    def test_image_put_rejects_missing_token_wrong_type_and_nonimage(self):
        self.assertEqual(self.client.put("/api/development-files/upload-image/", b"test", content_type="image/png").status_code, 403)
        upload = r2_storage.generate_presigned_upload_url("a.png", "image/png")
        parsed = urlsplit(upload["presigned_url"])
        path = parsed.path + "?" + parsed.query
        self.assertEqual(self.client.put(path, b"bad", content_type="image/jpeg").status_code, 403)
        self.assertEqual(self.client.put(path, b"bad", content_type="image/png").status_code, 403)

    def test_product_image_validation_accepts_development_urls(self):
        from api.validators import validate_image_url
        from django.core.exceptions import ValidationError

        out = io.BytesIO()
        Image.new("RGB", (2, 2)).save(out, format="PNG")
        upload = r2_storage.generate_presigned_upload_url("products/1/a.png", "image/png")
        self.client.put(
            urlsplit(upload["presigned_url"]).path + "?" + urlsplit(upload["presigned_url"]).query,
            out.getvalue(),
            content_type="image/png",
        )
        self.assertEqual(validate_image_url(upload["public_url"]), upload["public_url"])
        self.assertEqual(validate_image_url(upload["object_key"]), upload["object_key"])
        with override_settings(R2_PUBLIC_URL="https://cdn.example"):
            self.assertEqual(validate_image_url("https://cdn.example/products/a.png"), "https://cdn.example/products/a.png")
            with self.assertRaises(ValidationError):
                validate_image_url("https://evil.example/products/a.png")

    def test_compressed_upload_keeps_existing_frontend_response_contract(self):
        out = io.BytesIO()
        Image.new("RGB", (2, 2)).save(out, format="PNG")
        result = r2_storage.upload_compressed_image_to_r2(out.getvalue(), "a.png")
        self.assertTrue(result["public_url"].startswith("https://localhost/api/development-files/images/"))
        self.assertTrue(storage.local_path(result["object_key"]).is_file())

    def test_django_default_storage_uses_the_same_explicit_origins(self):
        from django.core.files.base import ContentFile
        files = storage.DevelopmentStorage()
        ref = files.save("invoices/invoice_3200.pdf", ContentFile(b"%PDF-django"), max_length=100)
        self.assertTrue(ref.startswith("local://documents/"))
        self.assertLessEqual(len(ref), 100)
        self.assertEqual(files.open(ref).read(), b"%PDF-django")
        self.assertEqual(files.size(ref), 11)
        self.assertTrue(files.exists(ref))
        self.assertIn("/api/development-files/document/?token=", files.url(ref))
        files.delete("invoices/production.pdf")
        files.delete(ref)
        self.assertFalse(files.exists(ref))

    def test_invoice_and_credit_note_generation_save_returned_local_reference(self):
        from billing.models import Invoice, CreditNote
        request = Mock()
        request.build_absolute_uri.return_value = "https://localhost/"
        def render_pdf(*args, **kwargs):
            Path(kwargs["target"]).write_bytes(b"%PDF-local")
        html = Mock()
        html.return_value.write_pdf.side_effect = render_pdf
        renderer_modules = {
            "weasyprint": SimpleNamespace(HTML=html),
            "weasyprint.text.fonts": SimpleNamespace(FontConfiguration=Mock()),
        }
        with patch("django.template.loader.render_to_string", return_value="<html>test</html>"), patch.dict(sys.modules, renderer_modules):
            for model, field, number in ((Invoice, "invoice_link", "invoice_number"), (CreditNote, "credit_note_link", "credit_note_number")):
                document = model(**{number: 3200})
                with patch.object(document, "save"):
                    ref = document.generate_and_upload_pdf(request)
                self.assertEqual(getattr(document, field), ref)
                self.assertTrue(ref.startswith("local://documents/"))
                self.assertEqual(storage.read_bytes(ref), b"%PDF-local")

    def test_festival_caller_saves_local_origin(self):
        from festival.services import documents
        invoice = SimpleNamespace(pk=1, invoice_number="FINV-1", pdf_key="", order=Mock(), seller_snapshot={})
        with patch.object(documents, "_render_pdf", return_value=b"%PDF-festival"), patch.object(documents.FestivalInvoice.objects, "filter") as query:
            query.return_value.update.return_value = 1
            ref = documents.generate_invoice_pdf(invoice)
        self.assertTrue(ref.startswith("local://documents/"))
        self.assertEqual(query.return_value.update.call_args.kwargs["pdf_key"], ref)

    def test_shipping_label_caller_saves_local_origin(self):
        from shipping import tasks
        shipment = Mock(order_id=3267, sendcloud_parcel_id=123)
        with patch.object(tasks, "_sync_customer_shipping_fields"):
            tasks._apply_shipment_label_storage(shipment, pdf_bytes=b"%PDF-label", dl_err="", parcel_dict_for_sync={}, label_url_for_sync="")
        self.assertTrue(shipment.label_s3_key.startswith("local://documents/"))
        self.assertEqual(storage.read_bytes(shipment.label_s3_key), b"%PDF-label")


class ReadOnlyGuardTests(SimpleTestCase):
    @override_settings(APP_ENV="development", DEBUG=False)
    def test_readonly_clients_block_mutations_and_presigned_mutations(self):
        raw = Mock()
        client = storage.protect_client(raw)
        client.get_object(Bucket="production", Key="x")
        client.generate_presigned_url("get_object", Params={})
        for operation in ("put_object", "delete_object", "upload_file", "upload_fileobj", "copy_object", "create_multipart_upload"):
            with self.assertRaises(PermissionError):
                getattr(client, operation)
        for operation in ("put_object", "delete_object"):
            with self.assertRaises(PermissionError):
                client.generate_presigned_url(operation)
        with self.assertRaises(PermissionError):
            client.generate_presigned_url("get_object", HttpMethod="PUT")
        with self.assertRaises(PermissionError):
            client.generate_presigned_url("get_object", {}, 300, "DELETE")
        raw.put_object.assert_not_called()
        raw.delete_object.assert_not_called()

    @override_settings(APP_ENV="production", DEBUG=True)
    def test_debug_is_a_second_guard_against_production_env_copy(self):
        self.assertIsInstance(storage.protect_client(Mock()), storage.ReadOnlyClient)

    @override_settings(APP_ENV="production", DEBUG=False, URL_BASE="http://localhost:8000")
    def test_loopback_url_keeps_cloud_readonly_even_with_production_flags(self):
        self.assertIsInstance(storage.protect_client(Mock()), storage.ReadOnlyClient)

    @override_settings(APP_ENV="production", DEBUG=False, URL_BASE="https://landarsfood.com")
    def test_production_still_uploads_reads_deletes_through_s3(self):
        raw = Mock()
        with patch.object(storage, "get_s3_client", return_value=raw):
            self.assertEqual(storage.store_bytes(b"production", "invoices/invoice_1.pdf"), "invoices/invoice_1.pdf")
            raw.put_object.assert_called_once()
            storage.file_url("invoices/invoice_1.pdf")
            raw.generate_presigned_url.assert_called_once()
            self.assertTrue(storage.delete_file("shipment_labels/a.pdf"))
            raw.delete_object.assert_called_once()
        self.assertIs(storage.protect_client(raw), raw)
        with self.assertRaises(PermissionError):
            storage.file_url("local://documents/a.pdf")
        self.assertEqual(self.client.get("/api/development-files/document/").status_code, 404)

    def test_latest_invoice_does_not_fall_back_to_an_older_legacy_pdf(self):
        from api.serializers import OrderSerializer
        from billing.models import Invoice
        order = Mock(invoice_link="invoices/old.pdf")
        current = Mock(invoice_link="")
        order.invoices.latest.return_value = current
        serializer = OrderSerializer()
        with patch.object(storage, "get_s3_client", side_effect=AssertionError("Wrong legacy fallback")):
            self.assertIsNone(serializer.get_invoice_link(order))
            current.invoice_link = "local://documents/missing.pdf"
            current.get_presigned_invoice_url.side_effect = ValueError("Unavailable")
            self.assertIsNone(serializer.get_invoice_link(order))
        order.invoices.latest.side_effect = Invoice.DoesNotExist
        with patch.object(storage, "file_url", return_value="legacy-download"):
            self.assertEqual(serializer.get_invoice_link(order), "legacy-download")


@override_settings(APP_ENV="development", DEBUG=True, URL_BASE="https://localhost")
class RefreshCleanupTests(TestCase):
    def test_database_refresh_removes_local_reference_and_prunes_unreferenced_files(self):
        from api.models import ProductCategory
        with tempfile.TemporaryDirectory() as folder, override_settings(DEVELOPMENT_FILE_ROOT=folder):
            ref = storage.save_local_bytes(b"image", storage.new_local_reference("products/a.png", kind="images"))
            path = storage.local_path(ref)
            os.utime(path, (time.time() - 7200,) * 2)
            row = ProductCategory.objects.create(name="test", image_url=storage.local_image_url(ref))
            call_command("prune_development_files", stdout=io.StringIO())
            self.assertTrue(path.exists())
            # Restoring production DB replaces this value with the original CDN URL.
            row.image_url = "https://cdn.landarsfood.com/products/original.png"
            row.save()
            with patch("boto3.client", side_effect=AssertionError("Cloud cleanup forbidden")):
                call_command("prune_development_files", stdout=io.StringIO())
            self.assertFalse(path.exists())

    def test_stored_image_reference_survives_url_base_change(self):
        from api.models import ProductCategory
        from django.db import connection

        with tempfile.TemporaryDirectory() as folder, override_settings(
            DEVELOPMENT_FILE_ROOT=folder, URL_BASE="https://localhost",
        ):
            ref = storage.save_local_bytes(b"image", storage.new_local_reference("products/a.png", kind="images"))
            path = storage.local_path(ref)
            row = ProductCategory.objects.create(name="hosted", image_url=storage.local_image_url(ref))
            self.assertTrue(row.image_url.startswith("https://localhost/api/development-files/images/"))
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT image_url FROM {ProductCategory._meta.db_table} WHERE id = %s",
                    [row.pk],
                )
                self.assertEqual(cursor.fetchone()[0], ref)
            with override_settings(URL_BASE="http://127.0.0.1:8000"):
                row.refresh_from_db()
                self.assertTrue(row.image_url.startswith("http://127.0.0.1:8000/api/development-files/images/"))
                call_command("prune_development_files", "--after-database-refresh", stdout=io.StringIO())
                self.assertTrue(path.exists())

    @override_settings(APP_ENV="production", DEBUG=False, URL_BASE="https://landarsfood.com")
    def test_production_cleanup_command_is_rejected(self):
        with self.assertRaises(CommandError):
            call_command("prune_development_files")


class BackupGuardTests(SimpleTestCase):
    def test_refresh_hook_runs_only_after_successful_active_development_refresh(self):
        root = Path(storage.settings.BASE_DIR).parent
        source = (root / "management/pg_backup.sh").read_text()
        main_function = source[source.index("main() {"):source.rindex('main "$@"')]
        stubs = '''
init_config() { :; }
validate_config() { return 0; }
log_command_separator() { :; }
print_command_start() { :; }
print_command_end() { :; }
log_info() { :; }
log_error() { :; }
restore_postgresql_backup() { return "${RESTORE_FAIL:-0}"; }
restore_pitr_backup() { return "${RESTORE_FAIL:-0}"; }
promote_database() { return "${RESTORE_FAIL:-0}"; }
docker() {
    echo "$*" >> "$TRACE_FILE"
    if [ "$*" = "compose ps --status running --services" ]; then
        printf 'backend\\ncelery\\n'
    fi
    return 0
}
'''
        shell = f'source "{root}/management/storage_environment.sh"\n' + stubs + main_function + '\nmain "$@"'
        with tempfile.TemporaryDirectory() as folder:
            trace = Path(folder) / "trace"
            for args, mode, failed, expect_prune in (
                (["restore", "dump", "--promote"], "development", False, True),
                (["restore", "dump", "--force"], "development", False, True),
                (["promote"], "development", False, True),
                (["restore", "dump"], "development", False, False),
                (["promote", "--help"], "development", False, False),
                (["pitr-restore", "--help"], "development", False, False),
                (["restore", "dump", "--promote"], "development", True, False),
                (["restore", "dump", "--promote"], "production", False, False),
            ):
                trace.unlink(missing_ok=True)
                result = subprocess.run(["bash", "-c", shell, "storage-test", *args], env={"PATH": "/usr/bin:/bin", "TRACE_FILE": str(trace), "APP_ENV": mode, "DEBUG": "False", "URL_BASE": "https://landarsfood.com", "RESTORE_FAIL": "1" if failed else "0"}, capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, int(failed), result.stderr)
                calls = trace.read_text() if trace.exists() else ""
                self.assertEqual("prune_development_files --after-database-refresh" in calls, expect_prune, args)
                self.assertEqual("purge -f -Q celery,email" in calls, expect_prune, args)
                if expect_prune:
                    prune_at = calls.index("prune_development_files --after-database-refresh")
                    self.assertLess(calls.index("migrate --noinput"), prune_at, args)
                    self.assertLess(prune_at, calls.index("compose up -d"), args)
                if mode == "production" or "--help" in args or args == ["restore", "dump"]:
                    self.assertEqual(calls, "")

    def test_backup_upload_and_retention_functions_never_call_aws_locally(self):
        root = Path(storage.settings.BASE_DIR).parent
        script = (root / "management/pg_backup.sh").read_text()
        definitions = []
        for name in ("upload_to_s3", "cleanup_s3_backups"):
            start = script.index(name + "() {")
            end = script.index("\n}\n", start) + 3
            definitions.append(script[start:end])
        shell = '\n'.join([
            f'source "{root}/management/storage_environment.sh"',
            'log_info() { :; }; aws() { echo "Unexpected AWS call"; exit 97; }',
            *definitions,
            'upload_to_s3 /not/a/file postgresql; cleanup_s3_backups',
        ])
        result = subprocess.run(["bash", "-c", shell], env={"APP_ENV": "development", "DEBUG": "False", "PATH": "/usr/bin:/bin"}, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("Unexpected", result.stdout)

    def test_wal_guard_local_archive_and_production_cloud_behavior(self):
        root = Path(storage.settings.BASE_DIR).parent
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            source = directory / "segment"
            source.write_bytes(b"wal segment")
            marker = directory / "cloud-called"
            fake = directory / "wal-g"
            fake.write_text('#!/bin/sh\necho called > "$WALG_TEST_MARKER"\n')
            fake.chmod(0o755)
            archive = directory / "archive"
            archive.mkdir()
            stale = archive / "stale-segment"
            stale.write_bytes(b"old")
            os.utime(stale, (time.time() - 20 * 86400,) * 2)
            base = {"PATH": folder + ":/usr/bin:/bin", "WALG_TEST_MARKER": str(marker), "DEVELOPMENT_WAL_ARCHIVE_DIR": str(archive), "AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "AWS_STORAGE_BUCKET_NAME": "test-bucket", "WAL_RETENTION_DAYS": "14"}
            cases = (
                ({"APP_ENV": "development", "DEBUG": "False"}, False),
                ({"APP_ENV": "production", "DEBUG": "True"}, True),
                ({}, True),
                ({"APP_ENV": "production", "DEBUG": "False", "URL_BASE": "https://localhost"}, True),
            )
            for environment, expect_warning in cases:
                result = subprocess.run(["bash", str(root / "postgresql/wal-g-archive.sh"), str(source), "000000010000000000000001"], env={**base, **environment}, capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertFalse(marker.exists())
                self.assertEqual((archive / "000000010000000000000001").read_bytes(), source.read_bytes())
                self.assertEqual("WARNING: cloud storage write blocked" in result.stderr, expect_warning, environment)
            self.assertFalse(stale.exists())
            restored = directory / "restored-segment"
            result = subprocess.run(["bash", str(root / "postgresql/wal-g-restore.sh"), "000000010000000000000001", str(restored)], env={**base, "APP_ENV": "development", "DEBUG": "True"}, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(restored.read_bytes(), source.read_bytes())
            self.assertFalse(marker.exists())
            result = subprocess.run(["bash", str(root / "postgresql/wal-g-archive.sh"), str(source), "000000010000000000000001"], env={**base, "APP_ENV": "production", "DEBUG": "False", "URL_BASE": "https://landarsfood.com"}, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(marker.exists())
