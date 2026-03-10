"""
Matching logic to match bank transactions to orders.
Uses amount (via Invoice.total_amount when available, else Order.total_price),
date proximity, and name similarity.
"""
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from typing import List, Dict, Optional
from django.db.models import Q
from django.utils import timezone
from api.models import Order
from reconciliation.models import BankTransaction, ReconciliationMatch


class TransactionMatcher:
    """Matches bank transactions to orders."""

    # Date window (days): look for price match only within ±N days of transaction date
    DATE_WINDOW_DAYS = 30

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
    }

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

        # Exact match
        if n1 == n2:
            return 1.0

        tokens1 = self._name_tokens(name1)
        tokens2 = self._name_tokens(name2)
        if not tokens1 or not tokens2:
            # Fallback: raw sequence ratio
            return SequenceMatcher(None, n1, n2).ratio()

        set1 = set(tokens1)
        set2 = set(tokens2)

        # Surname (last token) match – strong signal
        surname1 = tokens1[-1] if tokens1 else ""
        surname2 = tokens2[-1] if tokens2 else ""
        surname_exact = surname1 == surname2 and len(surname1) > 1
        surname_ratio = (
            SequenceMatcher(None, surname1, surname2).ratio() if surname1 and surname2 else 0.0
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

        # Partial: one name contained in the other (e.g. "J Smith" vs "John Smith")
        partial = 0.0
        if n1 in n2 or n2 in n1:
            partial = 0.9
        else:
            for t1 in tokens1:
                for t2 in tokens2:
                    if t1 in t2 or t2 in t1:
                        partial = max(
                            partial,
                            0.7 if len(t1) <= 2 or len(t2) <= 2 else 0.85,
                        )

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
            sum(token_pair_scores) / len(token_pair_scores) if token_pair_scores else 0.0
        )

        # Combine: take best signals so one clear match scores highest
        scores = [
            float(surname_exact) * 0.92 + (0.08 * jaccard),  # surname exact + some word overlap
            surname_ratio * 0.85 if surname_ratio > 0.6 else 0.0,
            jaccard * 0.95,
            token_sort_ratio * 0.95,
            sequence_ratio * 0.9,
            partial,
            token_pair_score * 0.9,
        ]
        return min(1.0, max(scores) if scores else 0.0)
    
    def calculate_date_score(self, order_date: datetime, transaction_date: Optional[datetime]) -> float:
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
    
    def calculate_amount_score(self, order_amount: Decimal, transaction_amount: Decimal) -> float:
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
        self,
        order: Order,
        amount_score: float,
        date_score: float,
        name_score: float
    ) -> int:
        """
        Overall confidence (0-100). Amount is required; date and name
        contribute with dynamic allocation so the best name match stands out.

        - Amount: fixed 40% (required gate).
        - Of the remaining 60%, name gets a larger share when name_score is
          high (dynamic allocation): so the candidate with the strongest
          customer-name match gets a higher total and becomes the single
          top option when names differ.
        - Bonus: +10% when both date and name are strong (>= 0.7).
        """
        if amount_score == 0:
            return 0  # No match if amount doesn't match

        # Dynamic allocation: name gets 15–50% of the 60% slice by similarity
        # (so high name similarity pushes one candidate clearly above others)
        name_share = 0.15 + 0.35 * name_score  # 0.15 when name=0, 0.50 when name=1
        date_share = 1.0 - name_share
        weighted = (
            amount_score * 0.40 +
            0.60 * (name_share * name_score + date_share * date_score)
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
        self,
        order: Order,
        amount_score: float,
        date_score: float,
        name_score: float
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
        target = Decimal(str(self.transaction.amount)).quantize(Decimal('0.01'))
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
                .select_related('customer')
                .prefetch_related('items')
                .distinct()
            )
        else:
            # No transaction date - match by amount only (all orders)
            orders_qs = (
                Order.objects.all()
                .select_related('customer')
                .prefetch_related('items')
                .distinct()
            )

        # Filter by amount in Python (total_price is a property)
        candidates = []
        for order in orders_qs:
            if self._amount_matches(order.total_price, target):
                candidates.append(order)
        
        return candidates
    
    def match_transaction(self) -> List[Dict]:
        """
        Match transaction to orders and return ranked suggestions.
        
        Returns list of dicts with keys: order, confidence_score, matching_reason
        """
        candidates = self.find_candidate_orders()
        
        if not candidates:
            return []
        
        suggestions = []
        
        for order in candidates:
            # Candidates already passed amount filter, so amount_score = 1.0
            amount_score = 1.0

            # Date score: use best of creation date and delivery date vs transaction date (Jan/Feb → 2026)
            tx_date = self._transaction_date_for_matching()
            score_created = self.calculate_date_score(order.created_at, tx_date)
            score_delivery = 0.0
            if order.delivery_date:
                score_delivery = self.calculate_date_score(
                    order.delivery_date,
                    tx_date
                )
            date_score = max(score_created, score_delivery)
            
            customer_name = order.customer.name if order.customer else ""
            name_score = self.calculate_name_similarity(
                self.transaction.payer_name,
                customer_name
            )
            
            # Calculate confidence (amount_score is always 1.0 for candidates)
            confidence = self.calculate_confidence_score(
                order,
                amount_score,
                date_score,
                name_score
            )
            
            # All candidates should have confidence > 0 (amount matches, date/name add to score)
            if confidence > 0:
                reason = self.build_matching_reason(
                    order,
                    amount_score,
                    date_score,
                    name_score
                )
                
                suggestions.append({
                    'order': order,
                    'confidence_score': confidence,
                    'matching_reason': reason,
                })
        
        # Sort by confidence (highest first)
        suggestions.sort(key=lambda x: x['confidence_score'], reverse=True)
        
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

        # Any 100% confidence → match to that order (suggestions sorted by confidence desc)
        perfect = [s for s in suggestions if s['confidence_score'] == 100]
        if perfect:
            return perfect[0]['order']

        # Only one option → match it
        if len(suggestions) == 1:
            return suggestions[0]['order']

        return None
