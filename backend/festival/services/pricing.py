from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

TWOPLACES = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(str(value)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PricedLine:
    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    vat_rate: Decimal
    line_net: Decimal
    line_vat: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class OrderPricing:
    lines: list[PricedLine]
    subtotal_net: Decimal
    vat_total: Decimal
    total_gross: Decimal
    vat_breakdown: dict[str, dict[str, str]]


def price_line(
    *,
    product_id: int,
    product_name: str,
    quantity: int,
    unit_gross: Decimal,
    vat_rate_percent: Decimal,
) -> PricedLine:
    if quantity < 1:
        raise ValueError("Quantity must be at least 1.")
    unit = money(unit_gross)
    line_total = money(unit * quantity)
    vat_rate = Decimal(str(vat_rate_percent))
    if vat_rate < 0 or vat_rate > 100:
        raise ValueError("VAT rate must be between 0 and 100.")

    if vat_rate == 0:
        line_net = line_total
        line_vat = ZERO
    else:
        divisor = Decimal("1") + (vat_rate / Decimal("100"))
        line_net = money(line_total / divisor)
        line_vat = money(line_total - line_net)

    return PricedLine(
        product_id=product_id,
        product_name=product_name,
        quantity=quantity,
        unit_price=unit,
        vat_rate=vat_rate,
        line_net=line_net,
        line_vat=line_vat,
        line_total=line_total,
    )


def price_order(lines: Iterable[PricedLine]) -> OrderPricing:
    priced = list(lines)
    if not priced:
        raise ValueError("Order must contain at least one item.")

    subtotal_net = sum((line.line_net for line in priced), ZERO)
    vat_total = sum((line.line_vat for line in priced), ZERO)
    total_gross = sum((line.line_total for line in priced), ZERO)
    subtotal_net = money(subtotal_net)
    vat_total = money(vat_total)
    total_gross = money(total_gross)

    breakdown: dict[str, dict[str, Decimal]] = {}
    for line in priced:
        key = str(int(line.vat_rate))
        bucket = breakdown.setdefault(
            key,
            {"net": ZERO, "vat": ZERO, "gross": ZERO},
        )
        bucket["net"] = money(bucket["net"] + line.line_net)
        bucket["vat"] = money(bucket["vat"] + line.line_vat)
        bucket["gross"] = money(bucket["gross"] + line.line_total)

    serializable = {
        rate: {k: str(v) for k, v in values.items()}
        for rate, values in sorted(breakdown.items(), key=lambda item: int(item[0]))
    }
    return OrderPricing(
        lines=priced,
        subtotal_net=subtotal_net,
        vat_total=vat_total,
        total_gross=total_gross,
        vat_breakdown=serializable,
    )
