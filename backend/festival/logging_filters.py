"""Logging filters for festival CloudPRNT noise control."""

from __future__ import annotations

import logging


class SuppressCloudPRNTAuthChallenge(logging.Filter):
    """
    Drop Django's ``Unauthorized`` WARNING for the CloudPRNT endpoint when the
    printer probes without credentials (normal HTTP Basic challenge).

    Still allows through:
    - 401s that include an Authorization header (wrong password, bad encoding)
    - any other path or status code
    """

    CLOUDPRNT_PATH_MARKER = "/api/festival/cloudprnt"

    def filter(self, record: logging.LogRecord) -> bool:
        if getattr(record, "status_code", None) != 401:
            return True

        request = getattr(record, "request", None)
        if request is None:
            return True

        path = getattr(request, "path", "") or ""
        if self.CLOUDPRNT_PATH_MARKER not in path:
            return True

        auth = ""
        meta = getattr(request, "META", None)
        if isinstance(meta, dict):
            auth = meta.get("HTTP_AUTHORIZATION") or ""

        # No Authorization header → Star's expected challenge probe.
        if not auth.strip():
            return False

        return True
