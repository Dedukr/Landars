"""
PDF parser for bank statements.
Extracts transactions from PDF files in the format:
"01 May I SIKANOVYCH Automated Credit £143.00"
"""
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Optional
from pypdf import PdfReader


class StatementParser:
    """Parser for bank statement PDFs."""
    
    # Pattern to match transaction lines
    # Format: DD MMM NAME(S) TYPE £AMOUNT
    # Examples:
    # "28 May POHRIBNIAK Automated Credit £8.00"
    # "27 May FASTOVETS I & S Mobile/Online Transaction £70.00"
    TRANSACTION_PATTERN = re.compile(
        r'(\d{1,2})\s+([A-Za-z]{3,9})\s+(.+?)\s+(Automated Credit|Credit|Debit|Payment|Transfer|Mobile/Online Transaction)\s+£?([\d,]+\.\d{2})',
        re.IGNORECASE
    )
    
    # Month names mapping
    MONTHS = {
        'january': 1, 'jan': 1,
        'february': 2, 'feb': 2,
        'march': 3, 'mar': 3,
        'april': 4, 'apr': 4,
        'may': 5,
        'june': 6, 'jun': 6,
        'july': 7, 'jul': 7,
        'august': 8, 'aug': 8,
        'september': 9, 'sep': 9, 'sept': 9,
        'october': 10, 'oct': 10,
        'november': 11, 'nov': 11,
        'december': 12, 'dec': 12,
    }

    # Statement period in PDF (e.g. "From 01/05/2025" or "From\n01/05/2025")
    STATEMENT_FROM_PATTERN = re.compile(
        r'From\s*\n?\s*(\d{1,2})/(\d{1,2})/(\d{4})',
        re.IGNORECASE
    )

    def __init__(self, upload_date: Optional[datetime] = None):
        """
        Initialize parser.

        Args:
            upload_date: Date when PDF was uploaded (used to infer year for dates)
        """
        self.upload_date = upload_date or datetime.now()
        self._statement_year: Optional[int] = None  # Set from PDF when available

    def extract_statement_year_from_text(self, text: str) -> Optional[int]:
        """Extract statement year from PDF text (e.g. From 01/05/2025) for transaction dates."""
        m = self.STATEMENT_FROM_PATTERN.search(text)
        if m:
            d, mon, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= mon <= 12 and 2000 <= y <= 2100:
                return y
        return None

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract all text from PDF file."""
        try:
            reader = PdfReader(pdf_path)
            text_parts = []
            for page in reader.pages:
                text_parts.append(page.extract_text())
            return "\n".join(text_parts)
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF: {e}")
    
    def parse_date(self, day_str: str, month_str: str) -> Optional[datetime]:
        """
        Parse date from day and month strings.
        Uses statement year from PDF when set; otherwise infers from upload date.
        """
        try:
            day = int(day_str)
            month_name = month_str.lower()
            month = self.MONTHS.get(month_name)

            if not month:
                return None

            # Prefer statement year extracted from PDF (e.g. "From 01/05/2025")
            if self._statement_year is not None:
                year = self._statement_year
            else:
                year = self.upload_date.year
                test_date = datetime(year, month, day)
                if test_date > self.upload_date + timedelta(days=180):
                    year = year - 1

            return datetime(year, month, day)
        except (ValueError, KeyError):
            return None
    
    def parse_transaction_line(self, line: str) -> Optional[Dict]:
        """
        Parse a single transaction line.
        
        Returns dict with keys: date, date_parsed, amount, payer_name, raw_line
        or None if line doesn't match expected format.
        """
        line = line.strip()
        if not line:
            return None
        
        # Try to match the pattern
        match = self.TRANSACTION_PATTERN.search(line)
        if not match:
            return None
        
        day_str, month_str, name_part, transaction_type, amount_str = match.groups()
        
        # Only process incoming payments (credits)
        # Skip debits and mobile/online transactions (those are outgoing)
        transaction_type_lower = transaction_type.lower()
        if transaction_type_lower not in ['automated credit', 'credit']:
            return None
        
        # Parse amount
        try:
            amount = Decimal(amount_str.replace(',', ''))
        except (ValueError, TypeError):
            return None
        
        # Parse date
        date_str = f"{day_str} {month_str}"
        date_parsed = self.parse_date(day_str, month_str)
        
        # Clean payer name (remove extra spaces)
        payer_name = ' '.join(name_part.split())
        
        return {
            'statement_date': date_str,
            'statement_date_parsed': date_parsed,
            'amount': amount,
            'payer_name': payer_name,
            'raw_line': line,
        }
    
    def parse_pdf(self, pdf_path: str) -> List[Dict]:
        """
        Parse PDF file and extract all transactions.
        Detects statement period (From/To dates) and uses that year for transaction dates.
        Returns list of transaction dicts.
        """
        text = self.extract_text_from_pdf(pdf_path)
        self._statement_year = self.extract_statement_year_from_text(text)

        lines = text.split('\n')
        transactions = []
        for line in lines:
            transaction = self.parse_transaction_line(line)
            if transaction:
                transactions.append(transaction)

        return transactions
    
    def calculate_file_hash(self, pdf_path: str) -> str:
        """Calculate SHA-256 hash of PDF file for deduplication."""
        import hashlib
        
        with open(pdf_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
        return file_hash
