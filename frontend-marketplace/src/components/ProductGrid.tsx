import React, { useEffect, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import Image from "next/image";

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url?: string | null;
  stock_quantity?: number;
}

interface Filters {
  categories: number[];
  price: [number, number];
  inStock: boolean;
}

interface ProductGridProps {
  filters: Filters;
  sort: string;
  view: "grid" | "list";
  search?: string;
}

const skeletons = Array.from({ length: 8 });

const ProductGrid: React.FC<ProductGridProps> = ({
  filters,
  sort,
  view,
  search,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { cart, addToCart, removeFromCart } = useCart();
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      // Build query params
      const params = new URLSearchParams();
      if (filters.categories.length)
        params.append("categories", filters.categories.join(","));
      if (search) params.append("search", search);
      if (filters.inStock) params.append("in_stock", "1");
      if (sort) params.append("sort", sort);
      const res = await fetch(`/api/products/?${params.toString()}`);
      const data = await res.json();
      setProducts(data);
      setLoading(false);
    }
    fetchProducts();
  }, [filters, sort, search]);

  return (
    <div
      className={
        view === "grid"
          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6"
          : "flex flex-col gap-4"
      }
    >
      {loading
        ? skeletons.map((_, i) => (
            <div
              key={i}
              className="bg-gray-100 rounded-lg shadow p-4 animate-pulse h-64 flex flex-col gap-2"
            >
              <div className="bg-gray-200 h-32 w-full rounded mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-1/3 mt-auto" />
            </div>
          ))
        : products.map((product) => (
            <div
              key={product.id}
              className="rounded-lg shadow p-4 flex flex-col hover:shadow-lg transition-shadow border animate-fade-in-up"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <div className="h-32 w-full flex items-center justify-center bg-gray-50 rounded mb-2 overflow-hidden">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    className="object-cover h-full w-full"
                  />
                ) : (
                  <span className="text-4xl text-gray-300">🍎</span>
                )}
              </div>
              <div
                className="font-semibold text-lg truncate"
                title={product.name}
              >
                {product.name}
              </div>
              <div
                className="text-sm truncate"
                style={{ color: "var(--foreground)" }}
                title={product.description}
              >
                {product.description.length > 48
                  ? product.description.slice(0, 48) + "..."
                  : product.description}
              </div>
              <div
                className="font-bold text-lg mt-2"
                style={{ color: "var(--primary)" }}
              >
                £{product.price}
              </div>
              {/* Quantity and Add to Cart (placeholder) */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  className="px-2 py-1 rounded bg-gray-200 text-lg font-bold"
                  onClick={() => removeFromCart(product.id)}
                  disabled={
                    !cart.find((item) => item.productId === product.id)
                      ?.quantity
                  }
                >
                  -
                </button>
                <span>
                  {cart.find((item) => item.productId === product.id)
                    ?.quantity || 0}
                </span>
                <button
                  className="px-2 py-1 rounded bg-gray-200 text-lg font-bold"
                  onClick={() => addToCart(product.id, 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
    </div>
  );
};

export default ProductGrid;
