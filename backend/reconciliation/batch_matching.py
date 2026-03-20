"""
Background matching for statement batches (avoids HTTP timeouts on large uploads).

Cloudflare and many proxies cap responses (~100s). Upload parses the PDF and
creates BankTransaction rows in the request, then schedules this work after commit.
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

from django.db import close_old_connections, transaction as db_transaction

logger = logging.getLogger(__name__)


def apply_matching_for_batch(batch_id: int, user_id: Optional[int]) -> None:
    """
    Run TransactionMatcher for every transaction in the batch (same logic as upload view).
    Intended to run outside the request thread; uses its own DB connection.
    """
    close_old_connections()
    try:
        from account.models import CustomUser

        from .matcher import TransactionMatcher
        from .models import BankTransaction, ReconciliationMatch

        user = CustomUser.objects.get(pk=user_id) if user_id else None

        txns = BankTransaction.objects.filter(batch_id=batch_id).order_by("id")
        for txn in txns:
            if txn.match_status == BankTransaction.MatchStatus.MATCHED:
                continue
            matcher = TransactionMatcher(txn)
            suggestions = matcher.match_transaction()

            ReconciliationMatch.objects.filter(transaction=txn).delete()
            for suggestion in suggestions:
                ReconciliationMatch.objects.create(
                    transaction=txn,
                    suggested_order=suggestion["order"],
                    confidence_score=suggestion["confidence_score"],
                    matching_reason=suggestion["matching_reason"],
                )

            auto_matched_order = matcher.auto_match_if_high_confidence()
            if auto_matched_order:
                conf = suggestions[0]["confidence_score"] if suggestions else None
                txn.mark_as_matched(
                    auto_matched_order,
                    user,
                    "Auto-matched (high confidence)",
                    confidence_score=conf,
                )
            else:
                if suggestions:
                    txn.match_status = BankTransaction.MatchStatus.SUGGESTED
                    txn.confidence_score = suggestions[0]["confidence_score"]
                    txn.matching_reason = suggestions[0]["matching_reason"]
                else:
                    txn.match_status = BankTransaction.MatchStatus.UNMATCHED
                txn.save()

        logger.info("Statement batch %s: matching finished", batch_id)
    except Exception:
        logger.exception("Statement batch %s: matching failed", batch_id)
    finally:
        close_old_connections()


def schedule_matching_for_batch(batch_id: int, user_id: Optional[int]) -> None:
    """Run apply_matching_for_batch in a daemon thread after transaction commit."""

    def _run() -> None:
        apply_matching_for_batch(batch_id, user_id)

    db_transaction.on_commit(
        lambda: threading.Thread(target=_run, daemon=True, name=f"match-batch-{batch_id}").start()
    )
