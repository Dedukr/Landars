import {
  readCartSnapshot,
  writeCartSnapshot,
  clearCartStorage,
} from "@/utils/cartStorage";
import {
  readAuthenticatedWishlistSnapshot,
  writeAuthenticatedWishlistSnapshot,
} from "@/utils/wishlistStorage";
import {
  readListingProductsCache,
  writeListingProductsCache,
} from "@/utils/listingProductCache";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    },
    configurable: true,
  });
});

describe("cart snapshot persistence", () => {
  it("round-trips cart lines for a user", () => {
    writeCartSnapshot(42, [{ productId: 1, quantity: 2 }]);
    expect(readCartSnapshot(42)).toEqual([{ productId: 1, quantity: 2 }]);
    clearCartStorage(42);
    expect(readCartSnapshot(42)).toBeNull();
  });
});

describe("authenticated wishlist snapshot persistence", () => {
  it("round-trips product ids for a user", () => {
    writeAuthenticatedWishlistSnapshot(7, [3, 9]);
    expect(readAuthenticatedWishlistSnapshot(7)).toEqual([3, 9]);
  });
});

describe("listing product cache", () => {
  it("round-trips cached product rows", () => {
    const rows = [{ id: 1, name: "Buns", price: "5.00" }];
    writeListingProductsCache("cart", 1, rows);
    expect(readListingProductsCache("cart", 1)).toEqual(rows);
  });
});
