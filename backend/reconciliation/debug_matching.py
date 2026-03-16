"""
Debug script to test matching logic manually.
Run: python manage.py shell < reconciliation/debug_matching.py
"""
from decimal import Decimal
from reconciliation.models import BankTransaction
from reconciliation.matcher import TransactionMatcher
from api.models import Order

# Get a sample transaction
txn = BankTransaction.objects.first()
if not txn:
    print("No transactions found!")
    exit()

print(f"\n=== Testing Transaction ===")
print(f"Transaction ID: {txn.id}")
print(f"Amount: {txn.amount} (type: {type(txn.amount)})")
print(f"Date parsed: {txn.statement_date_parsed} (type: {type(txn.statement_date_parsed)})")
print(f"Payer: {txn.payer_name}")

# Test amount matching
print(f"\n=== Testing Amount Matching ===")
target = Decimal(str(txn.amount)).quantize(Decimal('0.01'))
print(f"Target amount (Decimal): {target}")

# Get some orders to test
orders = Order.objects.all()[:10]
print(f"\nTesting {len(orders)} orders:")
for order in orders:
    order_total = order.total_price
    order_dec = Decimal(str(round(float(order_total), 2)))
    matches = order_dec == target or abs(order_dec - target) < Decimal('0.01')
    print(f"  Order #{order.id}: total={order_total} (type: {type(order_total)}), "
          f"as Decimal={order_dec}, matches={matches}, diff={abs(order_dec - target)}")

# Test date filtering
print(f"\n=== Testing Date Filtering ===")
if txn.statement_date_parsed:
    from datetime import timedelta
    tx_date = txn.statement_date_parsed
    if hasattr(tx_date, 'date'):
        tx_date = tx_date.date()
    date_start = tx_date - timedelta(days=14)
    date_end = tx_date + timedelta(days=14)
    print(f"Transaction date: {tx_date}")
    print(f"Date range: {date_start} to {date_end}")
    
    orders_in_range = Order.objects.filter(
        created_at__date__gte=date_start,
        created_at__date__lte=date_end
    )
    print(f"Orders in date range: {orders_in_range.count()}")
    for order in orders_in_range[:5]:
        print(f"  Order #{order.id}: created_at={order.created_at.date()}, total={order.total_price}")
else:
    print("No transaction date parsed!")

# Test full matching
print(f"\n=== Testing Full Matching ===")
matcher = TransactionMatcher(txn)
candidates = matcher.find_candidate_orders()
print(f"Found {len(candidates)} candidates")
for cand in candidates[:5]:
    print(f"  Order #{cand.id}: total={cand.total_price}, created={cand.created_at.date()}, customer={cand.customer.name if cand.customer else 'None'}")

suggestions = matcher.match_transaction()
print(f"\nFound {len(suggestions)} suggestions")
for sug in suggestions:
    print(f"  Order #{sug['order'].id}: confidence={sug['confidence_score']}%, reason={sug['matching_reason']}")
