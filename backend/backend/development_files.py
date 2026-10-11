"""Local files only. Documents use expiring links minted by authorized callers."""
import io

from django.conf import settings
from django.core import signing
from django.http import FileResponse, HttpResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from PIL import Image

from .file_storage import (
    DOCUMENT_SALT, UPLOAD_SALT, LOCAL_PREFIX, decode_local_token,
    is_development, local_path, save_local_bytes,
)


def _enabled():
    if not is_development():
        raise Http404


def _response(reference):
    try:
        path = local_path(reference)
        response = FileResponse(path.open("rb"), filename=path.name)
    except (FileNotFoundError, ValueError, PermissionError):
        raise Http404
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_http_methods(["GET"])
def document(request):
    _enabled()
    try:
        payload = decode_local_token(request.GET.get("token", ""), salt=DOCUMENT_SALT)
        if not payload["ref"].startswith(LOCAL_PREFIX + "documents/"):
            raise ValueError
    except (signing.BadSignature, KeyError, ValueError, PermissionError):
        return HttpResponse(status=403)
    return _response(payload["ref"])


@require_http_methods(["GET"])
def image(request, key):
    _enabled()
    return _response(LOCAL_PREFIX + "images/" + key)


@csrf_exempt  # Expiring, single-use PUT capability minted by the authenticated upload API.
@require_http_methods(["PUT"])
def upload_image(request):
    _enabled()
    try:
        payload = decode_local_token(request.GET.get("token", ""), salt=UPLOAD_SALT)
        reference = payload["ref"]
        if not reference.startswith(LOCAL_PREFIX + "images/") or request.content_type != payload["content_type"]:
            raise ValueError
        size = int(request.META.get("CONTENT_LENGTH", 0))
        if not 0 < size <= settings.MAX_IMAGE_SIZE:
            return HttpResponse(status=413)
        data = request.body
        if len(data) > settings.MAX_IMAGE_SIZE:
            return HttpResponse(status=413)
        picture = Image.open(io.BytesIO(data))
        actual_type = Image.MIME.get(picture.format)
        picture.verify()
        if actual_type not in settings.ALLOWED_IMAGE_TYPES or actual_type != payload["content_type"].replace("image/jpg", "image/jpeg"):
            raise ValueError
        save_local_bytes(data, reference)
    except FileExistsError:
        return HttpResponse(status=409)
    except (signing.BadSignature, KeyError, ValueError, OSError, PermissionError):
        return HttpResponse(status=403)
    return HttpResponse(status=200)
