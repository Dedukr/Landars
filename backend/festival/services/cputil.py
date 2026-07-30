"""Star CPUtil wrapper: Star Document Markup → printer media types."""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import threading
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

MARKUP_MEDIA_TYPE = "text/vnd.star.markup"
STARPRNT_MEDIA_TYPE = "application/vnd.star.starprnt"
PLAIN_MEDIA_TYPE = "text/plain"

ALLOWED_OUTPUT_TYPES = frozenset(
    {
        STARPRNT_MEDIA_TYPE,
        MARKUP_MEDIA_TYPE,
        PLAIN_MEDIA_TYPE,
    }
)

# Prefer StarPRNT (TSP100IV), then markup passthrough, then plain fallback.
DEFAULT_MARKUP_MEDIA_TYPES = [
    STARPRNT_MEDIA_TYPE,
    MARKUP_MEDIA_TYPE,
    PLAIN_MEDIA_TYPE,
]

_lock = threading.Lock()
_available_cache: bool | None = None
_forced_plain = False


class CPUtilError(Exception):
    """CPUtil conversion or availability failure."""


def cputil_path() -> str:
    return (
        getattr(settings, "FESTIVAL_CPUTIL_PATH", None) or "/opt/star/cputil/cputil"
    ).strip()


def cputil_timeout_seconds() -> float:
    return float(getattr(settings, "FESTIVAL_CPUTIL_TIMEOUT_SECONDS", 5) or 5)


def reset_cputil_cache() -> None:
    """Clear availability cache (tests / after packaging the binary)."""
    global _available_cache, _forced_plain
    with _lock:
        _available_cache = None
        _forced_plain = False


def _smoke_convert() -> None:
    """Run a tiny markup → starprnt convert; raise on failure."""
    path = cputil_path()
    if not path or not os.path.isfile(path) or not os.access(path, os.X_OK):
        raise CPUtilError(f"cputil not executable at {path!r}")
    sample = "[align: center]TEST[plain]\n[cut]\n"
    convert_markup(sample, STARPRNT_MEDIA_TYPE, _skip_available_check=True)


def cputil_available() -> bool:
    """True when cputil exists and can convert markup to StarPRNT."""
    global _available_cache
    with _lock:
        if _available_cache is not None:
            return _available_cache
    try:
        _smoke_convert()
        ok = True
    except Exception as exc:
        logger.error("Festival CPUtil unavailable — markup printing disabled: %s", exc)
        ok = False
    with _lock:
        _available_cache = ok
        return ok


def force_plain_format() -> None:
    """Process-local override used when markup mode cannot run CPUtil."""
    global _forced_plain
    with _lock:
        _forced_plain = True


def is_plain_forced() -> bool:
    with _lock:
        return _forced_plain


def configured_job_format() -> str:
    value = (
        getattr(settings, "FESTIVAL_CLOUDPRNT_JOB_FORMAT", None) or "markup"
    ).strip().lower()
    if value not in ("markup", "plain"):
        return "markup"
    return value


def active_job_format() -> str:
    """
    Effective CloudPRNT job format for new jobs.

    ``markup`` requires a working cputil; otherwise force ``plain`` for this
    process so orders still print.
    """
    if is_plain_forced():
        return "plain"
    if configured_job_format() == "plain":
        return "plain"
    if cputil_available():
        return "markup"
    force_plain_format()
    logger.error(
        "FESTIVAL_CLOUDPRNT_JOB_FORMAT=markup but CPUtil is unavailable; "
        "forcing plain for this process."
    )
    return "plain"


def job_source_media_type() -> str:
    if active_job_format() == "markup":
        return MARKUP_MEDIA_TYPE
    return PLAIN_MEDIA_TYPE


def advertised_media_types(source_media_type: str) -> list[str]:
    if source_media_type == MARKUP_MEDIA_TYPE:
        return list(DEFAULT_MARKUP_MEDIA_TYPES)
    return [PLAIN_MEDIA_TYPE]


def markup_output_media_types() -> list[str]:
    """Types we can serve for a stored markup job."""
    return list(DEFAULT_MARKUP_MEDIA_TYPES)


def convert_markup(
    markup: str,
    output_type: str,
    *,
    _skip_available_check: bool = False,
) -> bytes:
    """
    Convert UTF-8 Star Document Markup to the printer-requested media type.

    Deterministic for the same markup + output_type (required for GET equality).
    """
    if output_type not in ALLOWED_OUTPUT_TYPES:
        raise CPUtilError(f"Unsupported output media type: {output_type}")

    if output_type == MARKUP_MEDIA_TYPE:
        return markup.encode("utf-8")

    if output_type == PLAIN_MEDIA_TYPE:
        # CPUtil cannot emit text/plain from markup; strip tags + CP437.
        from festival.services.tickets import encode_print_payload, strip_markup_tags

        return encode_print_payload(strip_markup_tags(markup))

    if not _skip_available_check and not cputil_available():
        raise CPUtilError("cputil is not available")

    path = cputil_path()
    timeout = cputil_timeout_seconds()
    # argv list only — never interpolate untrusted markup into a shell string.
    with tempfile.TemporaryDirectory(prefix="festival-cputil-") as tmp:
        stm_path = Path(tmp) / "job.stm"
        out_path = Path(tmp) / "job.bin"
        stm_path.write_text(markup, encoding="utf-8")
        cmd = [
            path,
            "thermal3",
            "utf8",
            "decode",
            output_type,
            str(stm_path),
            str(out_path),
        ]
        try:
            completed = subprocess.run(
                cmd,
                check=False,
                capture_output=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise CPUtilError(f"cputil timed out after {timeout}s") from exc
        except OSError as exc:
            raise CPUtilError(f"cputil failed to start: {exc}") from exc

        if completed.returncode != 0:
            stderr = (completed.stderr or b"").decode("utf-8", errors="replace")[:500]
            raise CPUtilError(
                f"cputil exited {completed.returncode}: {stderr or 'no stderr'}"
            )
        if not out_path.is_file():
            raise CPUtilError("cputil produced no output file")
        data = out_path.read_bytes()
        if not data:
            raise CPUtilError("cputil produced empty output")
        return data
