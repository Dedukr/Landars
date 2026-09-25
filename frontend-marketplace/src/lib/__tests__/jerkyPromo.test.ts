import {
  computeJerkyPromo,
  isJerkyPromoProduct,
  jerkyPromoNudge,
  jerkyPromoRowLabel,
  JERKY_PROMO_GROUP,
  type JerkyPromoLine,
} from "../jerkyPromo";

function jerky(
  productId: number,
  quantity: number,
  price = 6
): JerkyPromoLine {
  return { productId, price, quantity, promoGroup: JERKY_PROMO_GROUP };
}

describe("computeJerkyPromo free unit counts", () => {
  it("gives no free unit for 5 units", () => {
    const result = computeJerkyPromo([jerky(1, 5)]);
    expect(result.eligibleQuantity).toBe(5);
    expect(result.freeUnits).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.unitsToNextFree).toBe(1);
  });

  it("gives one free unit for 6 units", () => {
    const result = computeJerkyPromo([jerky(1, 6)]);
    expect(result.freeUnits).toBe(1);
    expect(result.discount).toBe(6);
  });

  it("still gives one free unit for 11 units", () => {
    const result = computeJerkyPromo([jerky(1, 11)]);
    expect(result.freeUnits).toBe(1);
    expect(result.discount).toBe(6);
    expect(result.unitsToNextFree).toBe(1);
  });

  it("gives two free units for 12 units", () => {
    const result = computeJerkyPromo([jerky(1, 12)]);
    expect(result.freeUnits).toBe(2);
    expect(result.discount).toBe(12);
  });
});

describe("computeJerkyPromo pooling and attribution", () => {
  it("pools mixed flavours into one group", () => {
    const result = computeJerkyPromo([jerky(3, 2), jerky(1, 2), jerky(2, 2)]);
    expect(result.eligibleQuantity).toBe(6);
    expect(result.freeUnits).toBe(1);
    expect(result.discount).toBe(6);
  });

  it("breaks equal-price ties by ascending product id", () => {
    const result = computeJerkyPromo([jerky(9, 3), jerky(4, 3)]);
    expect(result.perProductFree).toEqual({ 4: 1 });
  });

  it("prices free units from the cheapest eligible units", () => {
    const result = computeJerkyPromo([jerky(1, 6, 6), jerky(2, 6, 4.5)]);
    expect(result.freeUnits).toBe(2);
    expect(result.discount).toBe(9);
    expect(result.perProductFree).toEqual({ 2: 2 });
  });

  it("spills onto the next cheapest product when the cheapest runs out", () => {
    const result = computeJerkyPromo([jerky(1, 11, 6), jerky(2, 1, 4.5)]);
    expect(result.freeUnits).toBe(2);
    expect(result.discount).toBe(10.5);
    expect(result.perProductFree).toEqual({ 2: 1, 1: 1 });
  });
});

describe("computeJerkyPromo eligibility", () => {
  it("ignores products without the promo group", () => {
    const result = computeJerkyPromo([
      jerky(1, 4),
      { productId: 2, price: 6, quantity: 8, promoGroup: "" },
      { productId: 3, price: 6, quantity: 8 },
    ]);
    expect(result.eligibleQuantity).toBe(4);
    expect(result.freeUnits).toBe(0);
  });

  it("returns an empty result for an empty cart", () => {
    const result = computeJerkyPromo([]);
    expect(result).toEqual({
      eligibleQuantity: 0,
      freeUnits: 0,
      discount: 0,
      unitsToNextFree: 6,
      perProductFree: {},
    });
  });

  it("merges repeated lines for the same product at the cheaper price", () => {
    const result = computeJerkyPromo([jerky(1, 4, 6), jerky(1, 2, 4.5)]);
    expect(result.eligibleQuantity).toBe(6);
    expect(result.freeUnits).toBe(1);
    expect(result.discount).toBe(4.5);
    expect(result.perProductFree).toEqual({ 1: 1 });
  });

  it("recognises the promo group string", () => {
    expect(isJerkyPromoProduct("jerky_5_1")).toBe(true);
    expect(isJerkyPromoProduct("")).toBe(false);
    expect(isJerkyPromoProduct(null)).toBe(false);
  });
});

describe("promo copy helpers", () => {
  it("nudges only when a free unit is within reach", () => {
    expect(jerkyPromoNudge(2)).toBe("Add 2 more for another free jerky");
    expect(jerkyPromoNudge(1)).toBe("Add 1 more for another free jerky");
    expect(jerkyPromoNudge(0)).toBeNull();
    expect(jerkyPromoNudge(6)).toBeNull();
  });

  it("labels the discount row with the free unit count", () => {
    expect(jerkyPromoRowLabel(1)).toBe("Jerky 5+1 offer (1 free)");
    expect(jerkyPromoRowLabel(2, "Jerky 5+1")).toBe("Jerky 5+1 offer (2 free)");
    expect(jerkyPromoRowLabel(0)).toBe("Jerky 5+1 offer");
  });
});
