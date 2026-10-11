"""Production objects are read-only in development; local origins live in DB links.

Never choose a file by checking whether a local key exists: production DB restores
must immediately restore production reads, even when local files have the same name.
"""
import logging
import mimetypes
import time
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode, urlsplit

import boto3
from django.conf import settings
from django.core import signing
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.db import models
from django.urls import reverse

LOCAL_PREFIX = "local://"
IMAGE_ROUTE_MARKER = "/api/development-files/images/"
DOCUMENT_SALT = "development-document"
UPLOAD_SALT = "development-image-upload"
logger = logging.getLogger(__name__)


def is_development():
    # DEBUG is also a safety belt if someone copies a production APP_ENV to local.
    return (
        getattr(settings, "APP_ENV", "development") != "production"
        or settings.DEBUG
        or urlsplit(settings.URL_BASE).hostname in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
    )


class ReadOnlyClient:
    """Fail closed, including future callers and presigned browser uploads."""
    def __init__(self, client):
        self._client = client

    def generate_presigned_url(self, operation, *args, **kwargs):
        method = kwargs.get("HttpMethod", args[2] if len(args) > 2 else None)
        if operation != "get_object" or method not in {None, "GET"}:
            raise PermissionError("Cloud storage is read-only in development.")
        return self._client.generate_presigned_url(operation, *args, **kwargs)

    def __getattr__(self, name):
        if name in {"get_object", "head_object", "list_objects_v2", "list_object_versions", "download_file", "download_fileobj"}:
            return getattr(self._client, name)
        raise PermissionError("Cloud storage is read-only in development.")


def protect_client(client):
    return ReadOnlyClient(client) if is_development() else client


def get_s3_client():
    return protect_client(boto3.client(
        "s3", aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=getattr(settings, "AWS_S3_REGION_NAME", None),
    ))


def local_path(reference):
    if not is_development():
        raise PermissionError("Local development files are unavailable in production.")
    if not reference.startswith(LOCAL_PREFIX):
        raise ValueError("Expected an explicit local file reference.")
    key = reference[len(LOCAL_PREFIX):]
    parts = PurePosixPath(key).parts
    if not parts or parts[0] not in {"documents", "images"} or ".." in parts or "\\" in key or "\x00" in key:
        raise ValueError("Invalid local file reference.")
    root = Path(settings.DEVELOPMENT_FILE_ROOT).resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError("File path escapes development storage.")
    return path


def new_local_reference(key, *, kind="documents"):
    parts = PurePosixPath(key).parts
    if not parts or key.startswith("/") or ".." in parts or "\\" in key or "\x00" in key:
        raise ValueError("Invalid storage key.")
    reference = f"{LOCAL_PREFIX}{kind}/{uuid.uuid4().hex}/{key}"
    if kind == "documents" and len(reference) > 255:
        raise ValueError("Local file reference exceeds document field length.")
    return reference


def save_local_bytes(data, reference):
    path = local_path(reference)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Immutable unique objects: do not overwrite a previously issued upload URL.
    with path.open("xb") as stream:
        stream.write(data)
    return reference


def store_bytes(data, key, *, content_type="application/octet-stream", max_retries=3):
    if not data:
        raise ValueError("No data to upload")
    if max_retries < 1:
        raise ValueError("max_retries must be positive")
    if is_development():
        return save_local_bytes(data, new_local_reference(key))
    client = get_s3_client()
    for attempt in range(max_retries):
        try:
            client.put_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=key, Body=data, ContentType=content_type)
            return key
        except Exception:
            if attempt + 1 == max_retries:
                raise
            time.sleep(2 ** attempt)


def store_file(path, key, *, max_retries=3):
    return store_bytes(Path(path).read_bytes(), key, content_type=mimetypes.guess_type(key)[0] or "application/octet-stream", max_retries=max_retries)


def public_local_base():
    base = settings.URL_BASE.rstrip("/")
    if urlsplit(base).scheme not in {"http", "https"}:
        raise ImproperlyConfigured("URL_BASE must be an HTTP(S) URL.")
    return base


def signed_local_url(reference, *, expires_in=300, salt=DOCUMENT_SALT, content_type=None):
    local_path(reference)  # validate before issuing a capability
    payload = {"ref": reference, "ttl": min(max(int(expires_in), 1), 3600)}
    if content_type:
        payload["content_type"] = content_type
    token = signing.dumps(payload, salt=salt, compress=True)
    route = "development-document" if salt == DOCUMENT_SALT else "development-image-upload"
    return public_local_base() + reverse(route) + "?" + urlencode({"token": token})


def decode_local_token(token, *, salt):
    payload = signing.loads(token, salt=salt, max_age=3600)
    # TimestampSigner enforces the specific signed lifetime too.
    signing.loads(token, salt=salt, max_age=payload["ttl"])
    local_path(payload["ref"])
    return payload


def file_url(reference, *, expires_in=300):
    if reference.startswith(LOCAL_PREFIX):
        if not reference.startswith(LOCAL_PREFIX + "documents/"):
            raise ValueError("Expected a document reference.")
        return signed_local_url(reference, expires_in=expires_in)
    return get_s3_client().generate_presigned_url("get_object", Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": reference}, ExpiresIn=expires_in)


def read_bytes(reference):
    if reference.startswith(LOCAL_PREFIX):
        return local_path(reference).read_bytes()
    body = get_s3_client().get_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=reference)["Body"]
    try:
        return body.read()
    finally:
        body.close()


def delete_file(reference):
    if reference.startswith(LOCAL_PREFIX):
        local_path(reference).unlink(missing_ok=True)
        return True
    if is_development():
        logger.warning(
            "Skipped delete of production object %s; cloud storage is read-only in development.",
            reference,
        )
        return False
    get_s3_client().delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=reference)
    return True


def local_image_url(reference):
    path = local_path(reference)
    key = path.relative_to(Path(settings.DEVELOPMENT_FILE_ROOT).resolve()).as_posix()
    if not key.startswith("images/"):
        raise ValueError("Expected an image reference.")
    return public_local_base() + reverse("development-image", kwargs={"key": key[7:]})


def image_reference_from_value(value):
    """Return local://images/... for a development image, ignoring which host was stored."""
    if not isinstance(value, str) or not value:
        return None
    if value.startswith(LOCAL_PREFIX + "images/"):
        reference = value
    else:
        path = urlsplit(value).path
        index = path.find(IMAGE_ROUTE_MARKER)
        if index == -1:
            return None
        reference = LOCAL_PREFIX + "images/" + path[index + len(IMAGE_ROUTE_MARKER):]
    try:
        local_path(reference)
    except (ValueError, PermissionError):
        return None
    return reference


def local_image_reference(url):
    return image_reference_from_value(url)


def canonical_image_reference(value):
    """Persist development images as local:// so a later URL_BASE change cannot orphan them."""
    if not value or not is_development():
        return value
    return image_reference_from_value(value) or value


def present_image_url(value):
    """Build the browser URL from the current URL_BASE. Production CDN links pass through."""
    if not value or not is_development():
        return value
    reference = image_reference_from_value(value)
    if not reference:
        return value
    return local_image_url(reference)


def validate_image_reference(value):
    from django.core.exceptions import ValidationError
    from django.core.validators import URLValidator

    if not value:
        return
    path = urlsplit(value).path if isinstance(value, str) else ""
    if isinstance(value, str) and (value.startswith(LOCAL_PREFIX) or IMAGE_ROUTE_MARKER in path):
        if image_reference_from_value(value):
            return
        raise ValidationError("Invalid development image reference.")
    URLValidator()(value)


class DevelopmentStorage(Storage):
    """The same isolation for Django FileField/ImageField and default_storage."""
    def _open(self, name, mode="rb"):
        if mode != "rb":
            raise ValueError("Use save() to create a new development file.")
        return ContentFile(read_bytes(name), name=PurePosixPath(name).name)

    def _save(self, name, content):
        return store_bytes(b"".join(content.chunks()), name, content_type=mimetypes.guess_type(name)[0] or "application/octet-stream")

    def is_name_available(self, name, max_length=None):
        # _save allocates a unique UUID, regardless of a production object's name.
        return max_length is None or len(name) <= max_length

    def get_available_name(self, name, max_length=None):
        # _save allocates a unique UUID. Do not HEAD the production object of the same name.
        name = str(name).replace("\\", "/")
        if not name or name.startswith("/") or ".." in PurePosixPath(name).parts:
            raise ValueError("Invalid storage key.")
        if max_length is not None:
            adjusted = max_length - len(LOCAL_PREFIX + "documents/") - 33
            if adjusted < 1:
                raise ValueError("File field max_length is too short for an explicit local origin.")
            if len(name) > adjusted:
                raise ValueError("File name exceeds the adjusted field length.")
        return name

    def exists(self, name):
        if name.startswith(LOCAL_PREFIX):
            return local_path(name).is_file()
        from botocore.exceptions import ClientError
        try:
            get_s3_client().head_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=name)
            return True
        except ClientError as exc:
            if exc.response["ResponseMetadata"]["HTTPStatusCode"] == 404:
                return False
            raise

    def size(self, name):
        if name.startswith(LOCAL_PREFIX):
            return local_path(name).stat().st_size
        return get_s3_client().head_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=name)["ContentLength"]

    def url(self, name):
        return file_url(name)

    def delete(self, name):
        delete_file(name)


class ImageReferenceField(models.CharField):
    """Store a CDN URL, or local://images/... in development, and present a browser URL."""

    default_validators = [validate_image_reference]

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("max_length", 500)
        super().__init__(*args, **kwargs)

    def to_python(self, value):
        value = super().to_python(value)
        return present_image_url(value)

    def from_db_value(self, value, expression, connection):
        return present_image_url(value)

    def get_prep_value(self, value):
        # CharField.get_prep_value() calls to_python(), which presents a browser URL.
        # Persist the canonical reference instead.
        value = canonical_image_reference(value)
        if value is None:
            return None
        return str(value)

    def pre_save(self, model_instance, add):
        value = getattr(model_instance, self.attname)
        stored = canonical_image_reference(value)
        presented = present_image_url(stored)
        if presented != value:
            setattr(model_instance, self.attname, presented)
        return stored

    def formfield(self, **kwargs):
        from django import forms

        kwargs.setdefault("form_class", forms.URLField)
        return super().formfield(**kwargs)
