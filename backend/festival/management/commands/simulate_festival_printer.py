from __future__ import annotations

import base64
import time
from pathlib import Path
from urllib.parse import quote, urlencode

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Simulate a Star CloudPRNT printer against the festival endpoint."

    def add_arguments(self, parser):
        parser.add_argument("--base-url", default="http://localhost:8000")
        parser.add_argument("--mac", default="001C62000000")
        parser.add_argument("--output-dir", default="/tmp/festival-tickets")
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--watch", action="store_true")
        parser.add_argument("--username", default=None)
        parser.add_argument("--password", default=None)
        parser.add_argument(
            "--poll-seconds",
            type=float,
            default=float(getattr(settings, "FESTIVAL_CLOUDPRNT_POLL_SECONDS", 5)),
        )
        parser.add_argument(
            "--max-cycles",
            type=int,
            default=50,
            help="Safety cap for --once draining.",
        )
        # Fault-injection switches for tests/manual QA
        parser.add_argument("--repeat-get", type=int, default=1)
        parser.add_argument("--repeat-delete", type=int, default=1)
        parser.add_argument("--lose-first-delete", action="store_true")
        parser.add_argument("--report-paper-empty", action="store_true")
        parser.add_argument("--unknown-token", action="store_true")
        parser.add_argument("--invalid-mac", action="store_true")
        parser.add_argument("--unsupported-media", action="store_true")
        parser.add_argument("--terminal-error-code", default="")

    def handle(self, *args, **options):
        username = options["username"] or settings.FESTIVAL_CLOUDPRNT_USERNAME
        password = options["password"]
        if password is None:
            password = settings.FESTIVAL_CLOUDPRNT_PASSWORD
        if not username or not password:
            raise CommandError("CloudPRNT username/password must be configured.")

        base = options["base_url"].rstrip("/")
        endpoint = f"{base}{settings.FESTIVAL_CLOUDPRNT_ENDPOINT}"
        mac = "FFFFFFFFFFFF" if options["invalid_mac"] else options["mac"]
        output_dir = Path(options["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)

        auth = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
            "User-Agent": "CloudPRNT/3.0 TSP100IV/1.0 (simulator)",
            "X-Star-Mac": self._format_mac(mac),
        }

        watch = options["watch"] or not options["once"]
        if options["once"]:
            watch = False

        job_token = None
        printing = False
        cycles = 0
        idle_streak = 0
        lose_delete_once = options["lose_first_delete"]

        while True:
            cycles += 1
            status_code = "410 Out of paper" if options["report_paper_empty"] else "200 OK"
            body = {
                "status": "23 6 0 0 0 0 0 0 0 ",
                "printerMAC": self._format_mac(mac),
                "statusCode": quote(status_code),
                "printingInProgress": printing,
                "clientAction": None,
            }
            if job_token:
                body["jobToken"] = job_token

            try:
                resp = requests.post(endpoint, json=body, headers=headers, timeout=30)
            except requests.RequestException as exc:
                self.stderr.write(f"POST failed: {exc}")
                if not watch:
                    raise CommandError(str(exc))
                time.sleep(options["poll_seconds"])
                continue

            if resp.status_code == 401:
                raise CommandError("CloudPRNT authentication failed (401).")
            if resp.status_code != 200:
                self.stderr.write(f"POST status {resp.status_code}: {resp.text[:200]}")
                if not watch:
                    break
                time.sleep(options["poll_seconds"])
                continue

            data = resp.json()
            if not data.get("jobReady"):
                job_token = None
                printing = False
                idle_streak += 1
                if options["once"] and idle_streak >= 2:
                    self.stdout.write(self.style.SUCCESS("Queue empty."))
                    return
                if not watch and cycles >= options["max_cycles"]:
                    return
                time.sleep(options["poll_seconds"] if watch else 0.05)
                continue

            idle_streak = 0
            job_token = data.get("jobToken")
            media_types = data.get("mediaTypes") or ["text/plain"]
            media = (
                "application/vnd.star.unknown"
                if options["unsupported_media"]
                else media_types[0]
            )
            token_for_get = "00000000-0000-0000-0000-000000000000" if options["unknown_token"] else job_token

            query = urlencode({"mac": mac, "type": media, "token": token_for_get})
            get_url = f"{endpoint}?{query}"
            payload = None
            for _ in range(max(1, options["repeat_get"])):
                get_resp = requests.get(get_url, headers=headers, timeout=30)
                if get_resp.status_code != 200:
                    self.stderr.write(f"GET failed: {get_resp.status_code}")
                    break
                ctype = get_resp.headers.get("Content-Type", "")
                if "text/plain" not in ctype:
                    raise CommandError(f"Unexpected Content-Type: {ctype}")
                payload = get_resp.content
                if payload.startswith(b"\xef\xbb\xbf"):
                    raise CommandError("Payload unexpectedly includes UTF-8 BOM.")
                payload.decode("utf-8")
                self._validate_width(payload.decode("utf-8"))

            if payload is None:
                if not watch:
                    return
                time.sleep(options["poll_seconds"])
                continue

            path = self._write_ticket(output_dir, token_for_get, payload)
            self.stdout.write(f"Saved ticket preview: {path}")

            printing = True
            delete_code = options["terminal_error_code"] or "200 OK"
            del_query = urlencode(
                {
                    "mac": mac,
                    "token": token_for_get,
                    "code": delete_code,
                }
            )
            delete_url = f"{endpoint}?{del_query}"
            for attempt in range(max(1, options["repeat_delete"])):
                if lose_delete_once and attempt == 0:
                    lose_delete_once = False
                    self.stdout.write("Simulating lost DELETE response.")
                    continue
                del_resp = requests.delete(delete_url, headers=headers, timeout=30)
                if del_resp.status_code not in (200, 404, 409):
                    self.stderr.write(f"DELETE status {del_resp.status_code}")
            printing = False
            job_token = None
            options["report_paper_empty"] = False

            if options["once"] and cycles >= options["max_cycles"]:
                return
            if watch:
                time.sleep(options["poll_seconds"])

    def _format_mac(self, mac: str) -> str:
        cleaned = "".join(ch for ch in mac if ch.isalnum())
        if len(cleaned) != 12:
            return mac
        parts = [cleaned[i : i + 2] for i in range(0, 12, 2)]
        return ":".join(parts)

    def _write_ticket(self, output_dir: Path, token: str, payload: bytes) -> Path:
        safe = str(token).replace("/", "_")
        path = output_dir / f"{safe}.txt"
        n = 1
        while path.exists():
            path = output_dir / f"{safe}-{n}.txt"
            n += 1
        path.write_bytes(payload)
        return path

    def _validate_width(self, text: str) -> None:
        width = int(getattr(settings, "FESTIVAL_TICKET_COLUMNS", 48))
        for line in text.splitlines():
            if len(line) > width:
                raise CommandError(
                    f"Ticket line exceeds {width} columns: {line!r}"
                )
