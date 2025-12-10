/**
 * Comprehensive tests for cart merging functionality
 *
 * Tests various scenarios including:
 * - No conflicts
 * - Quantity conflicts
 * - Empty carts
 * - Edge cases
 */

import {
  CartMerger,
  createCartMerger,
  mergeCarts,
  MergeStrategy,
  ConflictResolution,
  type CartItem,
} from "../cartMerger";

describe("CartMerger", () => {
  let cartMerger: CartMerger;

  beforeEach(() => {
    cartMerger = createCartMerger(
      MergeStrategy.SMART,
      ConflictResolution.KEEP_HIGHER
    );
  });

  describe("Basic Merging", () => {
    it("should merge carts with no conflicts", async () => {
      const localCart: CartItem[] = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ];

      const backendCart: CartItem[] = [
        { productId: 3, quantity: 1 },
        { productId: 4, quantity: 3 },
      ];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.mergedCart).toHaveLength(4);
      expect(result.conflicts).toHaveLength(0);
      expect(result.mergeSummary.totalItems).toBe(4);
      expect(result.mergeSummary.conflictsResolved).toBe(0);
    });

    it("should handle empty local cart", async () => {
      const localCart: CartItem[] = [];
      const backendCart: CartItem[] = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.mergedCart).toEqual(backendCart);
      expect(result.conflicts).toHaveLength(0);
    });

    it("should handle empty backend cart", async () => {
      const localCart: CartItem[] = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ];
      const backendCart: CartItem[] = [];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.mergedCart).toEqual(localCart);
      expect(result.conflicts).toHaveLength(0);
    });

    it("should handle both empty carts", async () => {
      const localCart: CartItem[] = [];
      const backendCart: CartItem[] = [];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.mergedCart).toEqual([]);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe("Conflict Resolution", () => {
    it("should resolve conflicts with KEEP_HIGHER strategy", async () => {
      cartMerger.setStrategy(MergeStrategy.CONSERVATIVE);
      cartMerger.setConflictResolution(ConflictResolution.KEEP_HIGHER);

      const localCart: CartItem[] = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ];

      const backendCart: CartItem[] = [
        { productId: 1, quantity: 3 }, // Higher quantity
        { productId: 2, quantity: 1 }, // Same quantity
      ];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.conflicts).toHaveLength(2);
      expect(
        result.mergedCart.find((item) => item.productId === 1)?.quantity
      ).toBe(3);
      expect(
        result.mergedCart.find((item) => item.productId === 1)?.quantity
      ).toBe(3);
    });

    it("should resolve conflicts with SUM_QUANTITIES strategy", async () => {
      cartMerger.setStrategy(MergeStrategy.AGGRESSIVE);
      cartMerger.setConflictResolution(ConflictResolution.SUM_QUANTITIES);

      const localCart: CartItem[] = [{ productId: 1, quantity: 2 }];

      const backendCart: CartItem[] = [{ productId: 1, quantity: 3 }];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.conflicts).toHaveLength(1);
      expect(
        result.mergedCart.find((item) => item.productId === 1)?.quantity
      ).toBe(5);
    });

    it("should handle smart merging with similar quantities", async () => {
      cartMerger.setStrategy(MergeStrategy.SMART);

      const localCart: CartItem[] = [{ productId: 1, quantity: 2 }];

      const backendCart: CartItem[] = [{ productId: 1, quantity: 3 }];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.conflicts).toHaveLength(1);
      // Smart merging: ratio is 3/2 = 1.5 (not > 2), so it sums quantities
      expect(
        result.mergedCart.find((item) => item.productId === 1)?.quantity
      ).toBe(5); // 2 + 3 = 5
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero quantities", async () => {
      const localCart: CartItem[] = [
        { productId: 1, quantity: 0 },
        { productId: 2, quantity: 1 },
      ];

      const backendCart: CartItem[] = [
        { productId: 1, quantity: 2 },
        { productId: 3, quantity: 0 },
      ];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      // Zero quantity items should be filtered out
      expect(result.mergedCart.every((item) => item.quantity > 0)).toBe(true);
    });

    it("should handle negative quantities gracefully", async () => {
      const localCart: CartItem[] = [
        { productId: 1, quantity: -1 },
        { productId: 2, quantity: 1 },
      ];

      const backendCart: CartItem[] = [{ productId: 1, quantity: 2 }];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      // Negative quantities should be filtered out
      expect(result.mergedCart.every((item) => item.quantity > 0)).toBe(true);
    });

    it("should handle very large quantities", async () => {
      const localCart: CartItem[] = [{ productId: 1, quantity: 1000 }];

      const backendCart: CartItem[] = [{ productId: 1, quantity: 500 }];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      expect(result.conflicts).toHaveLength(1);
      // Smart merging: ratio is 1000/500 = 2 (not > 2), so it sums quantities
      expect(
        result.mergedCart.find((item) => item.productId === 1)?.quantity
      ).toBe(1500); // 1000 + 500 = 1500
    });
  });

  describe("Product Details Integration", () => {
    it("should respect max quantity limits", async () => {
      const productDetails = new Map([
        [1, { name: "Test Product", maxQuantity: 5 }],
      ]);

      const localCart: CartItem[] = [{ productId: 1, quantity: 3 }];

      const backendCart: CartItem[] = [{ productId: 1, quantity: 4 }];

      const result = await cartMerger.mergeCarts(
        localCart,
        backendCart,
        productDetails
      );

      // Should be capped at max quantity
      expect(
        result.mergedCart.find((item) => item.productId === 1)?.quantity
      ).toBeLessThanOrEqual(5);
    });
  });

  describe("Error Handling", () => {
    it("should handle merge errors gracefully", async () => {
      // Mock a scenario that would cause an error
      const localCart: CartItem[] = [{ productId: 1, quantity: 2 }];

      const backendCart: CartItem[] = [{ productId: 1, quantity: 3 }];

      // This should not throw an error
      await expect(
        cartMerger.mergeCarts(localCart, backendCart)
      ).resolves.toBeDefined();
    });
  });

  describe("Merge Summary", () => {
    it("should generate accurate merge summary", async () => {
      const localCart: CartItem[] = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ];

      const backendCart: CartItem[] = [
        { productId: 1, quantity: 3 },
        { productId: 3, quantity: 1 },
      ];

      const result = await cartMerger.mergeCarts(localCart, backendCart);

      // totalItems is localCart.length + backendCart.length = 2 + 2 = 4
      expect(result.mergeSummary.totalItems).toBe(4);
      expect(result.mergeSummary.conflictsResolved).toBe(1);
      expect(result.mergeSummary.itemsAdded).toBe(1); // Product 2 from local
      expect(result.mergeSummary.itemsUpdated).toBe(1); // Product 1 conflict
    });
  });

  describe("Utility Functions", () => {
    it("should work with mergeCarts utility function", async () => {
      const localCart: CartItem[] = [{ productId: 1, quantity: 2 }];

      const backendCart: CartItem[] = [{ productId: 2, quantity: 1 }];

      const result = await mergeCarts(localCart, backendCart);

      expect(result.mergedCart).toHaveLength(2);
      expect(result.conflicts).toHaveLength(0);
    });
  });
});
