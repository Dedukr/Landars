import {
  holidayFeeAmount,
  holidayUnitPrice,
  percentOf,
  pickSeasonTheme,
  type HolidayEvent,
} from "@/lib/holidayApi";
import { calculateTotalPrice } from "@/utils/deliveryFeeCalculator";

function event(theme: HolidayEvent["theme"], id = 1): HolidayEvent {
  return {
    id,
    name: theme === "christmas" ? "Christmas" : "New Year",
    theme,
    emoji: theme === "christmas" ? "🎄" : "🎆",
    label: theme === "christmas" ? "🎄 Christmas" : "🎆 New Year",
    surcharge_percent: "15",
    delivery_window_label: "",
  };
}

describe("pickSeasonTheme", () => {
  it("is regular when no holiday is on", () => {
    expect(pickSeasonTheme([])).toBeNull();
  });

  it("prefers Christmas while it is on", () => {
    expect(pickSeasonTheme([event("new_year", 2), event("christmas")])).toBe(
      "christmas"
    );
  });

  it("switches to New Year once only New Year is on", () => {
    expect(pickSeasonTheme([event("new_year")])).toBe("new_year");
  });
});

describe("holiday rate maths", () => {
  it("reads the percent from the event", () => {
    expect(percentOf(event("christmas"))).toBe(15);
    expect(percentOf(null)).toBe(0);
  });

  it("adds 15% to the items subtotal, rounded to pence", () => {
    expect(holidayFeeAmount(40, 15)).toBe(6);
    expect(holidayFeeAmount(96, 15)).toBe(14.4);
    expect(holidayFeeAmount(33.33, 15)).toBe(5);
    expect(holidayFeeAmount(0, 15)).toBe(0);
  });

  it("rounds half pennies to even, like the server", () => {
    expect(holidayFeeAmount(0.3, 15)).toBe(0.04); // 4.5p -> 4p
    expect(holidayFeeAmount(0.1, 15)).toBe(0.02); // 1.5p -> 2p
  });

  it("shows the holiday unit price", () => {
    expect(holidayUnitPrice(10, 15)).toBe(11.5);
    expect(holidayUnitPrice(6.99, 15)).toBe(8.04);
    expect(holidayUnitPrice(9.9, 15)).toBe(11.38); // 1138.5p -> even
  });

  it("includes the holiday fee in the basket total and stacks with discounts", () => {
    // 96 + 14.40 holiday + 10 delivery - 9.60 coupon - 6 promo (server: 104.80)
    expect(calculateTotalPrice(96, 10, 9.6, 6, 14.4)).toBeCloseTo(104.8, 2);
    expect(calculateTotalPrice(40, 10)).toBe(50);
  });
});
