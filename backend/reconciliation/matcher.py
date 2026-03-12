"""
Matching logic to match bank transactions to orders.
Uses amount (via Invoice.total_amount when available, else Order.total_price),
date proximity, and name similarity.
"""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Dict, List, Optional

from api.models import Order
from django.db.models import Q
from django.utils import timezone
from reconciliation.models import BankTransaction, ReconciliationMatch


class TransactionMatcher:
    """Matches bank transactions to orders."""

    # Date window (days): look for matches within ±N days of transaction date
    DATE_WINDOW_DAYS = 60

    # Jan/Feb transactions are matched to orders in Jan/Feb of this year
    JANUARY_FEBRUARY_MATCH_YEAR = 2026

    # Amount tolerance: order total may differ from transaction amount by up to this (pounds)
    AMOUNT_TOLERANCE_POUNDS = Decimal("1")

    # Common company / noise tokens to ignore in payer names
    NAME_STOPWORDS = {
        "ltd",
        "limited",
        "plc",
        "inc",
        "co",
        "company",
        "uk",
        "gb",
        "llp",
        "holdings",
        "trading",
        "ta",
        "t/a",
        "the",
        # Bank/remittance phrases that often appear after the actual payer name
        "automated",
        "credit",
        "refund",
        "payment",
        "transfer",
        "direct",
        "debit",
        "standing",
        "order",
        "faster",
        "fps",
        "mobile",
        "online",
        "branch",
        "chq",
        "cheque",
        "pos",
    }

    # Trailing phrases to strip from payer name for name-only matching (longest first)
    PAYER_NAME_STRIP_SUFFIXES = (
        "automated credit",
        "faster payment",
        "standing order",
        "direct debit",
        "credit",
        "refund",
        "payment",
        "transfer",
        "fps",
    )

    def __init__(self, transaction: BankTransaction):
        self.transaction = transaction

    def _transaction_date_for_matching(self):
        """
        Return the transaction date to use for candidate window and scoring.
        January and February are normalized to JANUARY_FEBRUARY_MATCH_YEAR so
        they match orders in Jan/Feb 2026 regardless of parsed year.
        """
        tx = self.transaction.statement_date_parsed
        if not tx:
            return None
        if isinstance(tx, datetime):
            tx = tx.date()
        if tx.month in (1, 2):
            return date(self.JANUARY_FEBRUARY_MATCH_YEAR, tx.month, tx.day)
        return tx

    def _normalize_name(self, name: str) -> str:
        """Normalize for comparison: lowercase, collapse spaces, remove extra punctuation."""
        if not name:
            return ""
        s = name.lower().strip()
        s = re.sub(r"[.,;:'\"]", " ", s)
        s = re.sub(r"\s+", " ", s)
        return s.strip()

    def _payer_name_for_name_matching(self) -> str:
        """
        Payer name with common bank/remittance suffixes stripped, for use in
        name-only candidate finding and similarity. E.g. "VOLODYMYR HUDKO Automated Credit"
        -> "VOLODYMYR HUDKO" so we match by person name only.
        """
        raw = (self.transaction.payer_name or "").strip()
        if not raw:
            return ""
        lower = raw.lower()
        for suffix in self.PAYER_NAME_STRIP_SUFFIXES:
            if lower.endswith(suffix):
                # Remove the suffix and any trailing spaces
                raw = raw[: -len(suffix)].strip()
                lower = raw.lower()
                break
        return raw

    def _name_tokens(self, name: str) -> List[str]:
        """Tokenize name into words (drop single-char except initial-like)."""
        norm = self._normalize_name(name)
        if not norm:
            return []
        tokens = [
            w
            for w in norm.split()
            if (len(w) > 1 or (len(w) == 1 and w.isalpha()))
            and w not in self.NAME_STOPWORDS
        ]
        return tokens

    def calculate_name_similarity(self, name1: str, name2: str) -> float:
        """
        Advanced name similarity (0-1) using best practices:
        - Normalization (case, spaces, punctuation)
        - Exact and token-order-insensitive match
        - Surname (last token) weighted heavily
        - Sequence ratio for typos and spelling (difflib)
        - Partial match (one name contained in the other)
        - Combined so the best-matching candidate gets the highest score.
        """
        if not name1 or not name2:
            return 0.0

        n1 = self._normalize_name(name1)
        n2 = self._normalize_name(name2)
        if not n1 or not n2:
            return 0.0

        # Exact match (after normalization)
        if n1 == n2:
            return 1.0

        tokens1 = self._name_tokens(name1)
        tokens2 = self._name_tokens(name2)
        if not tokens1 or not tokens2:
            # Fallback: raw sequence ratio
            return SequenceMatcher(None, n1, n2).ratio()

        set1 = set(tokens1)
        set2 = set(tokens2)

        # Same set of tokens (handles "VOLODYMYR HUDKO" vs "Volodymyr Hudko" and "HUDKO VOLODYMYR")
        if set1 == set2:
            return 1.0

        # All tokens of the shorter name appear in the longer and surname matches
        short_tokens, long_tokens = (
            (tokens1, tokens2) if len(tokens1) <= len(tokens2) else (tokens2, tokens1)
        )
        short_set, long_set = set(short_tokens), set(long_tokens)
        if short_set <= long_set:
            surname_short = short_tokens[-1] if short_tokens else ""
            surname_long = long_tokens[-1] if long_tokens else ""
            if surname_short == surname_long and len(surname_short) > 1:
                return 0.92  # strong match (e.g. "Volodymyr Hudko" in "Volodymyr Hudko Jr")

        # Surname (last token) match – strong signal
        surname1 = tokens1[-1] if tokens1 else ""
        surname2 = tokens2[-1] if tokens2 else ""
        surname_exact = surname1 == surname2 and len(surname1) > 1
        surname_ratio = (
            SequenceMatcher(None, surname1, surname2).ratio()
            if surname1 and surname2
            else 0.0
        )

        # Token set: Jaccard and "token set ratio" style (best subset match)
        common = set1 & set2
        union = set1 | set2
        jaccard = len(common) / len(union) if union else 0.0

        # Sorted token string ratio (handles "John Smith" vs "Smith John")
        sort1 = " ".join(sorted(tokens1))
        sort2 = " ".join(sorted(tokens2))
        token_sort_ratio = SequenceMatcher(None, sort1, sort2).ratio()

        # Full string sequence ratio (typos, abbreviations)
        sequence_ratio = SequenceMatcher(None, n1, n2).ratio()

        # Precompute whether there is at least one strong match between longer tokens
        # (used to validate that an initial like "Y" is really part of the same name,
        # not just matching any occurrence of that letter).
        has_strong_long_token_match = False
        for t1 in tokens1:
            for t2 in tokens2:
                if len(t1) >= 3 and len(t2) >= 3:
                    if SequenceMatcher(None, t1, t2).ratio() >= 0.65:
                        has_strong_long_token_match = True
                        break
            if has_strong_long_token_match:
                break

        # Partial: one name contained in the other (e.g. "J Smith" vs "John Smith")
        partial = 0.0
        if n1 in n2 or n2 in n1:
            partial = 0.9
        else:
            for t1 in tokens1:
                for t2 in tokens2:
                    # For very short tokens (initials like "Y"), only treat as a
                    # partial match when:
                    # - the first letter matches the first letter of the other token, AND
                    # - there is also at least one strong match between longer tokens.
                    # This prevents a single "y" from matching names that only
                    # share that letter but have unrelated surnames.
                    if len(t1) <= 2 or len(t2) <= 2:
                        if t1[0] == t2[0] and has_strong_long_token_match:
                            partial = max(partial, 0.7)
                    else:
                        if t1 in t2 or t2 in t1:
                            partial = max(partial, 0.85)

        # Token-level fuzzy matching: for each token, find best fuzzy match in the other name
        token_pair_scores: List[float] = []
        for t1 in tokens1:
            best = 0.0
            for t2 in tokens2:
                ratio = SequenceMatcher(None, t1, t2).ratio()
                if ratio > best:
                    best = ratio
            if best:
                token_pair_scores.append(best)
        token_pair_score = (
            sum(token_pair_scores) / len(token_pair_scores)
            if token_pair_scores
            else 0.0
        )

        # Combine: take best signals so one clear match scores highest
        scores = [
            float(surname_exact) * 0.92
            + (0.08 * jaccard),  # surname exact + some word overlap
            surname_ratio * 0.85 if surname_ratio > 0.6 else 0.0,
            jaccard * 0.95,
            token_sort_ratio * 0.95,
            sequence_ratio * 0.9,
            partial,
            token_pair_score * 0.9,
        ]
        return min(1.0, max(scores) if scores else 0.0)

    def calculate_date_score(
        self, order_date: datetime, transaction_date: Optional[datetime]
    ) -> float:
        """
        Calculate date proximity score (0-1).
        Same day = 1.0, within DATE_WINDOW_DAYS = decreasing score, outside = 0.
        Only called for candidates already filtered to the date window.
        """
        if not transaction_date or not order_date:
            return 0.5  # Neutral score if dates missing

        # Convert order_date to date if it's datetime
        if isinstance(order_date, datetime):
            order_date = order_date.date()
        if isinstance(transaction_date, datetime):
            transaction_date = transaction_date.date()

        days_diff = abs((order_date - transaction_date).days)
        window = self.DATE_WINDOW_DAYS

        if days_diff == 0:
            return 1.0
        elif days_diff <= window:
            # Within window: linear decrease from 1.0 to 0.3
            return 1.0 - (days_diff / float(window)) * 0.7
        else:
            return 0.0

    def calculate_amount_score(
        self, order_amount: Decimal, transaction_amount: Decimal
    ) -> float:
        """
        Calculate amount match score (0-1).
        Within ±AMOUNT_TOLERANCE_POUNDS = 1.0.
        """
        try:
            a = Decimal(str(order_amount)).quantize(Decimal("0.01"))
            b = Decimal(str(transaction_amount)).quantize(Decimal("0.01"))
            if abs(a - b) <= self.AMOUNT_TOLERANCE_POUNDS:
                return 1.0
        except (TypeError, ValueError):
            pass
        return 0.0

    def calculate_confidence_score(
        self, order: Order, amount_score: float, date_score: float, name_score: float
    ) -> int:
        """
        Overall confidence (0-100).

        Amount is still a gate (we don't consider non-matching amounts here),
        but once it passes, the score is driven primarily by name and date:

        - Amount: fixed 20% (gate / sanity check).
        - Of the remaining 80%, name gets a larger share when name_score is
          high (dynamic allocation) so the best name match stands out.
        - Bonus: +10% when both date and name are strong (>= 0.7).
        """
        if amount_score == 0:
            return 0  # No match if amount doesn't match

        # Dynamic allocation: name gets 25–65% of the 80% slice by similarity
        # (so high name similarity pushes one candidate clearly above others)
        name_share = 0.25 + 0.40 * name_score  # 0.25 when name=0, 0.65 when name=1
        date_share = 1.0 - name_share
        weighted = amount_score * 0.20 + 0.80 * (
            name_share * name_score + date_share * date_score
        )
        if date_score >= 0.7 and name_score >= 0.7:
            weighted = min(1.0, weighted + 0.10)
        score = int(weighted * 100)
        score = min(100, score)

        # Cap confidence when name is only partial: strong surname/name match required for 100%
        # so e.g. "CHEKAVSKA Y" £96 favours "Yana Chekavska" over "Anastasiia Pervushyna"
        if name_score < 0.8:
            score = min(score, 92)
        return score

    def build_matching_reason(
        self, order: Order, amount_score: float, date_score: float, name_score: float
    ) -> str:
        """Build human-readable matching reason."""
        reasons = []

        if amount_score == 1.0:
            reasons.append("amount match")
        else:
            reasons.append("amount mismatch")

        if date_score >= 0.8:
            reasons.append("date close")
        elif date_score >= 0.5:
            reasons.append("date within window")
        else:
            reasons.append("date distant")

        if name_score >= 0.8:
            reasons.append("name strong match")
        elif name_score >= 0.5:
            reasons.append("name partial match")
        else:
            reasons.append("name weak match")

        return " + ".join(reasons)

    def _amount_matches(self, order_total, target: Decimal) -> bool:
        """True if order total is within ±AMOUNT_TOLERANCE_POUNDS of transaction amount."""
        try:
            order_dec = Decimal(str(round(float(order_total), 2)))
        except (TypeError, ValueError):
            return False
        t = Decimal(str(target)).quantize(Decimal("0.01"))
        return abs(order_dec - t) <= self.AMOUNT_TOLERANCE_POUNDS

    def find_candidate_orders(self) -> List[Order]:
        """
        Find orders with price match within the date window.
        - order total_price within ±AMOUNT_TOLERANCE_POUNDS of transaction amount
        - order created_at OR order delivery_date within ±DATE_WINDOW_DAYS (30 days) of transaction date
        """
        target = Decimal(str(self.transaction.amount)).quantize(Decimal("0.01"))
        window_days = self.DATE_WINDOW_DAYS

        # Price match within date window (creation date or delivery date)
        # Jan/Feb use normalized year so they match orders in Jan/Feb 2026
        tx_date = self._transaction_date_for_matching()
        if tx_date:
            date_start = tx_date - timedelta(days=window_days)
            date_end = tx_date + timedelta(days=window_days)
            orders_qs = (
                Order.objects.filter(
                    Q(created_at__date__gte=date_start, created_at__date__lte=date_end)
                    | Q(delivery_date__gte=date_start, delivery_date__lte=date_end)
                )
                .select_related("customer")
                .prefetch_related("items")
                .distinct()
            )
        else:
            # No transaction date - match by amount only (all orders)
            orders_qs = (
                Order.objects.all()
                .select_related("customer")
                .prefetch_related("items")
                .distinct()
            )

        # Filter by amount in Python (total_price is a property)
        candidates = []
        for order in orders_qs:
            if self._amount_matches(order.total_price, target):
                candidates.append(order)

        return candidates

    def find_name_only_candidates(self) -> List[Order]:
        """
        Find additional candidate orders by name within the date frame, even when
        amount differs. E.g. "17 Dec VOLODYMYR HUDKO £98" can suggest "Order #1386
        24 Dec Volodymyr Hudko £70.50".
        - Use payer name with bank suffixes stripped so we match on person name only.
        - Date window same as amount-based matching (created_at or delivery_date).
        - Restrict to orders whose customer name contains at least one name token.
        - Prefer orders closest in date to the transaction, then cap size.
        """
        clean_payer = self._payer_name_for_name_matching()
        tokens = self._name_tokens(clean_payer or self.transaction.payer_name or "")
        if not tokens:
            return []

        window_days = self.DATE_WINDOW_DAYS
        tx_date = self._transaction_date_for_matching()

        if tx_date:
            date_start = tx_date - timedelta(days=window_days)
            date_end = tx_date + timedelta(days=window_days)
            date_q = Q(
                created_at__date__gte=date_start, created_at__date__lte=date_end
            ) | Q(delivery_date__gte=date_start, delivery_date__lte=date_end)
            # Statement year can be wrong; include same month in next year for Nov/Dec transactions
            if tx_date.month >= 11:
                next_year_start = date(tx_date.year + 1, tx_date.month, 1)
                next_year_end = date(tx_date.year + 1, 12, 31)
                date_q = date_q | (
                    Q(
                        created_at__date__gte=next_year_start,
                        created_at__date__lte=next_year_end,
                    )
                    | Q(
                        delivery_date__gte=next_year_start,
                        delivery_date__lte=next_year_end,
                    )
                )
            base_qs = Order.objects.filter(date_q)
        else:
            base_qs = Order.objects.all()

        # Require customer to be non-null and match at least one significant token.
        # This is intentionally not too strict so we still get suggestions when
        # only part of the name matches or the order uses a slightly different
        # spelling/ordering of the name.
        name_filter = Q(customer__isnull=False)
        tokens_for_filter = [t for t in tokens if len(t) >= 2]
        if not tokens_for_filter:
            return []

        token_filter = Q()
        for t in tokens_for_filter:
            token_filter |= Q(customer__name__icontains=t)

        if not token_filter:
            return []

        name_filter &= token_filter

        orders_qs = base_qs.filter(name_filter).select_related("customer").distinct()

        candidates = list(orders_qs[:500])
        if not candidates or not tx_date:
            return candidates[:200]

        def _order_date(o: Order):
            o_date = o.created_at.date() if o.created_at else None
            if o.delivery_date and (
                o_date is None
                or abs((o.delivery_date - tx_date).days) < abs((o_date - tx_date).days)
            ):
                return o.delivery_date
            return o_date

        def _days_from_tx(o: Order) -> int:
            d = _order_date(o)
            if d is None:
                return 9999
            return abs((d - tx_date).days)

        candidates.sort(key=_days_from_tx)
        return candidates[:200]

    def match_transaction(self) -> List[Dict]:
        """
        Match transaction to orders and return ranked suggestions.

        Returns list of dicts with keys: order, confidence_score, matching_reason
        """
        candidates = self.find_candidate_orders()

        suggestions: List[Dict] = []
        candidate_ids = set()

        # Primary suggestions: amount matches (existing behaviour)
        tx_date = self._transaction_date_for_matching()
        for order in candidates:
            # Candidates already passed amount filter, so amount_score = 1.0
            amount_score = 1.0

            # Date score: use best of creation date and delivery date vs transaction date (Jan/Feb → 2026)
            score_created = self.calculate_date_score(order.created_at, tx_date)
            score_delivery = 0.0
            if order.delivery_date:
                score_delivery = self.calculate_date_score(order.delivery_date, tx_date)
            date_score = max(score_created, score_delivery)

            customer_name = order.customer.name if order.customer else ""
            name_score = self.calculate_name_similarity(
                self.transaction.payer_name,
                customer_name,
            )

            # Drop weak name matches entirely – even when amount matches – so we
            # only show suggestions where the customer name is at least a partial
            # match to the payer name.
            if name_score < 0.5:
                continue

            # Calculate confidence (amount_score is always 1.0 for candidates)
            confidence = self.calculate_confidence_score(
                order,
                amount_score,
                date_score,
                name_score,
            )

            # All candidates should have confidence > 0 (amount matches, date/name add to score)
            if confidence > 0:
                reason = self.build_matching_reason(
                    order,
                    amount_score,
                    date_score,
                    name_score,
                )

                suggestions.append(
                    {
                        "order": order,
                        "confidence_score": confidence,
                        "matching_reason": reason,
                        "amount_matches": True,
                    }
                )
                if order.id is not None:
                    candidate_ids.add(order.id)

        # Additional suggestions: name-based matches in date frame even if amount differs.
        name_candidates = self.find_name_only_candidates()
        payer_name_for_match = (
            self._payer_name_for_name_matching() or self.transaction.payer_name or ""
        )
        for order in name_candidates:
            if order.id in candidate_ids:
                continue

            customer_name = order.customer.name if order.customer else ""
            name_score = self.calculate_name_similarity(
                payer_name_for_match,
                customer_name,
            )

            # Drop weak name matches entirely – only keep when similarity is at
            # least "partial" (>= 0.5). Anything below that is considered too
            # weak to be useful as a suggestion.
            if name_score < 0.5:
                continue

            score_created = self.calculate_date_score(order.created_at, tx_date)
            score_delivery = 0.0
            if order.delivery_date:
                score_delivery = self.calculate_date_score(
                    order.delivery_date,
                    tx_date,
                )
            date_score = max(score_created, score_delivery)

            amount_score = 0.0  # by definition for these candidates

            # Name-first confidence: keep below automatic-match levels
            weighted = 0.6 * name_score + 0.4 * date_score
            confidence = int(weighted * 70)  # cap at 70
            if confidence <= 0:
                continue

            reason = self.build_matching_reason(
                order,
                amount_score,
                date_score,
                name_score,
            )

            suggestions.append(
                {
                    "order": order,
                    "confidence_score": confidence,
                    "matching_reason": reason,
                    "amount_matches": False,
                }
            )

        # Sort by confidence (highest first)
        suggestions.sort(key=lambda x: x["confidence_score"], reverse=True)

        return suggestions

    def auto_match_if_high_confidence(self) -> Optional[Order]:
        """
        Automatically match when we have a clear match.
        Returns matched order or None.

        - If any suggestion has 100% confidence: match to that order (ignore others).
        - Else if there is only one suggestion: match to it.
        """
        suggestions = self.match_transaction()
        if not suggestions:
            return None

        # Any 100% confidence with amount match → match to that order
        # (suggestions are sorted by confidence desc)
        perfect = [
            s
            for s in suggestions
            if s.get("amount_matches", False) and s["confidence_score"] == 100
        ]
        if perfect:
            return perfect[0]["order"]

        # Only one option → match it (even if amount didn't match but name/date are very strong)
        if len(suggestions) == 1:
            return suggestions[0]["order"]

        return None
