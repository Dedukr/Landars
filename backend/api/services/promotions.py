"""
Automatic multi-buy promotions — the single source of truth for promo money.

Today there is exactly one promotion, ``jerky_5_1`` ("buy 5 Jerky, get the 6th
free"), driven by the admin-editable ``Product.promo_group`` flag rather than by
category or name matching. Every eligible unit in a basket pools together
regardless of flavour, so 6 mixed jerky still yields 1 free unit.

Free units are always priced from the **cheapest** eligible units, ties broken by
product id, so both the discount and its per-line attribution are deterministic
and reproducible across cart, checkout, order and invoice.

:func:`compute_promo` accepts any iterable of "lines" exposing ``product`` and
``quantity`` — both :class:`api.models.CartItem` and :class:`api.models.OrderItem`
qualify. Order lines additionally prefer their ``item_price`` snapshot, so a
historical order never re-prices itself from the live product.

Only whole units earn the promotion: ``quantity`` is a ``Decimal(10, 2)`` on both
line models, and any fractional remainder is ignored when counting units.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - typing only, avoids a models import cycle
    from api.models import Product

TWOPLACES = Decimal("0.01")
ZERO = Decimal("0.00")


@dataclass(frozen=True)
class PromoDefinition:
    """
    One automatic multi-buy rule.

    ``group_size`` units (paid + free) form a group and ``free_per_group`` of them
    are given away, i.e. ``jerky_5_1`` charges 5 of every 6 units.
    """

    group: str
    group_size: int
    free_per_group: int
    label: str
    description: str

    @property
    def paid_per_group(self) -> int:
        return self.group_size - self.free_per_group


JERKY_5_1 = PromoDefinition(
    group="jerky_5_1",
    group_size=6,
    free_per_group=1,
    label="Jerky 5+1",
    description="Buy any 5 Jerky, get 1 free",
)

# Registry keyed by ``Product.promo_group``. Add future promos here.
PROMO_DEFINITIONS: dict[str, PromoDefinition] = {
    JERKY_5_1.group: JERKY_5_1,
}


@dataclass(frozen=True)
class PromoResult:
    """
    Outcome of applying one :class:`PromoDefinition` to a set of basket lines.

    ``per_product_free`` / ``per_product_discount`` are keyed by product id and
    only contain the products that actually received free units, so they map
    straight onto ``OrderItem.free_quantity`` at checkout.
    """

    definition: PromoDefinition
    eligible_quantity: int = 0
    free_units: int = 0
    discount: Decimal = ZERO
    per_product_free: dict[int, Decimal] = field(default_factory=dict)
    per_product_discount: dict[int, Decimal] = field(default_factory=dict)
    units_to_next_free: int = 0

    @property
    def group(self) -> str:
        return self.definition.group

    @property
    def label(self) -> str:
        return self.definition.label

    @property
    def description(self) -> str:
        return self.definition.description

    @property
    def group_size(self) -> int:
        return self.definition.group_size

    @property
    def applies(self) -> bool:
        """True when the basket actually earned at least one free unit."""
        return self.free_units > 0

    def free_quantity_for_product(self, product_id: int | None) -> Decimal:
        """Free units attributed to ``product_id`` (0.00 when none)."""
        if product_id is None:
            return ZERO
        return self.per_product_free.get(int(product_id), ZERO)

    def discount_for_product(self, product_id: int | None) -> Decimal:
        """Monetary discount attributed to ``product_id`` (0.00 when none)."""
        if product_id is None:
            return ZERO
        return self.per_product_discount.get(int(product_id), ZERO)


@dataclass(frozen=True)
class _EligibleLine:
    """Normalised view of a cart/order line that takes part in a promotion."""

    product_id: int
    unit_price: Decimal
    units: int


def promo_definition_for_group(group: str | None) -> PromoDefinition | None:
    """Look up a promo definition by its ``Product.promo_group`` value."""
    if not group:
        return None
    return PROMO_DEFINITIONS.get(str(group).strip())


def promo_definition_for_product(product: Product | None) -> PromoDefinition | None:
    """
    Promo definition a product takes part in, or None.

    Inactive products never advertise or earn a promotion.
    """
    if product is None or not getattr(product, "active", True):
        return None
    return promo_definition_for_group(getattr(product, "promo_group", ""))


def promo_payload_for_product(product: Product | None) -> dict[str, object] | None:
    """
    Storefront-facing promo descriptor for a product detail page (None when no promo).

    Shape: ``{"group", "label", "description", "group_size", "free_per_group",
    "paid_per_group", "badge"}``.
    """
    definition = promo_definition_for_product(product)
    if definition is None:
        return None
    return {
        "group": definition.group,
        "label": definition.label,
        "description": definition.description,
        "group_size": definition.group_size,
        "free_per_group": definition.free_per_group,
        "paid_per_group": definition.paid_per_group,
        "badge": f"{definition.paid_per_group} + {definition.free_per_group} FREE",
    }


def _to_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value if value not in (None, "") else 0))
    except (InvalidOperation, TypeError, ValueError):
        return ZERO


def _whole_units(quantity: object) -> int:
    """Whole sellable units on a line; fractional remainders never earn a promo."""
    value = _to_decimal(quantity)
    if value <= 0:
        return 0
    return int(value.to_integral_value(rounding=ROUND_DOWN))


def _unit_price_for_line(line: object) -> Decimal:
    """
    Price of one unit on this line.

    Order lines carry an ``item_price`` snapshot which always wins; cart lines fall
    back to the live ``product.price`` (base_price + holiday_fee).
    """
    snapshot = getattr(line, "item_price", None)
    if snapshot is not None:
        return _to_decimal(snapshot)
    product = getattr(line, "product", None)
    if product is None:
        return ZERO
    return _to_decimal(getattr(product, "price", 0))


def _eligible_lines(
    items: Iterable[object], definition: PromoDefinition
) -> list[_EligibleLine]:
    """Collapse the basket to eligible whole units per product, cheapest first."""
    by_product: dict[int, _EligibleLine] = {}
    for line in items:
        product = getattr(line, "product", None)
        if product is None or product.pk is None:
            continue
        if promo_definition_for_product(product) != definition:
            continue
        units = _whole_units(getattr(line, "quantity", 0))
        if units <= 0:
            continue
        product_id = int(product.pk)
        unit_price = _unit_price_for_line(line)
        existing = by_product.get(product_id)
        if existing is None:
            by_product[product_id] = _EligibleLine(product_id, unit_price, units)
        else:
            # Same product on two lines (possible on orders): keep the cheaper price.
            by_product[product_id] = _EligibleLine(
                product_id,
                min(existing.unit_price, unit_price),
                existing.units + units,
            )

    return sorted(by_product.values(), key=lambda ln: (ln.unit_price, ln.product_id))


def compute_promo(
    items: Iterable[object],
    *,
    definition: PromoDefinition = JERKY_5_1,
) -> PromoResult:
    """
    Apply ``definition`` to ``items`` and return the resulting :class:`PromoResult`.

    ``items`` may be any iterable of ``CartItem`` / ``OrderItem`` (or anything with
    ``product`` and ``quantity``). Lines whose product is missing, inactive, or not
    flagged for this promo are ignored.

    Free units are taken from the cheapest eligible units first (ties broken by
    product id), which makes mixed-flavour baskets deterministic.
    """
    lines = _eligible_lines(items, definition)
    eligible_quantity = sum(line.units for line in lines)
    if eligible_quantity <= 0:
        return PromoResult(
            definition=definition,
            units_to_next_free=definition.group_size,
        )

    groups = eligible_quantity // definition.group_size
    free_units = groups * definition.free_per_group
    units_to_next_free = definition.group_size - (
        eligible_quantity % definition.group_size
    )

    per_product_free: dict[int, Decimal] = {}
    per_product_discount: dict[int, Decimal] = {}
    discount = ZERO

    remaining = free_units
    for line in lines:
        if remaining <= 0:
            break
        take = min(remaining, line.units)
        remaining -= take
        line_discount = (line.unit_price * take).quantize(
            TWOPLACES, rounding=ROUND_HALF_UP
        )
        per_product_free[line.product_id] = Decimal(take).quantize(TWOPLACES)
        per_product_discount[line.product_id] = line_discount
        discount += line_discount

    return PromoResult(
        definition=definition,
        eligible_quantity=eligible_quantity,
        free_units=free_units,
        discount=discount.quantize(TWOPLACES, rounding=ROUND_HALF_UP),
        per_product_free=per_product_free,
        per_product_discount=per_product_discount,
        units_to_next_free=units_to_next_free,
    )


def promo_result_for_cart(cart) -> PromoResult:
    """
    Promo result for a cart, memoised on the cart instance.

    Serializers read the cart-level totals and the per-line free units from the
    same result; without the memo each nested field would re-query ``cart.items``.
    The memo is populated lazily on first read, so it must only be used *after*
    the request has finished mutating the cart (which is how the cart views are
    ordered). Use :func:`compute_promo` directly when in doubt.
    """
    cached = getattr(cart, "_promo_result_cache", None)
    if cached is None:
        cached = compute_promo(cart.items.all())
        cart._promo_result_cache = cached
    return cached


def promo_label_for_items(
    items: Iterable[object],
    *,
    default: str = JERKY_5_1.label,
) -> str:
    """
    Label of the promotion these lines belong to, for snapshots and summary rows.

    Falls back to ``default`` when no line is flagged any more (an order keeps its
    ``promo_discount`` even if a product's flag is cleared later on).
    """
    for line in items:
        definition = promo_definition_for_product(getattr(line, "product", None))
        if definition is not None:
            return definition.label
    return default
