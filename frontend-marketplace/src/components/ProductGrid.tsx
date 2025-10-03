import React, { useEffect, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import ProductModal from "./ProductModal";
import SignInPopup from "./SignInPopup";

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
  search?: string;
}

const skeletons = Array.from({ length: 8 });

const ProductGrid: React.FC<ProductGridProps> = ({ filters, sort, search }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { cart, addToCart, removeFromCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSignInPopup, setShowSignInPopup] = useState(false);

  const handleWishlistClick = (productId: number) => {
    if (!user) {
      setShowSignInPopup(true);
      return;
    }

    if (isInWishlist(productId)) {
      removeFromWishlist(productId);
    } else {
      addToWishlist(productId);
    }
  };

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
      {loading
        ? skeletons.map((_, i) => (
            <div
              key={i}
              className="bg-gray-100 rounded-lg shadow p-4 animate-pulse h-80 flex flex-col gap-2"
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
              className="rounded-lg shadow p-4 flex flex-col hover:shadow-lg transition-shadow border animate-fade-in-up cursor-pointer relative h-80"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
              onClick={() => {
                setSelectedProduct(product);
                setIsModalOpen(true);
              }}
            >
              {/* Wishlist Heart Icon - positioned in top-right corner */}
              <button
                className="absolute top-3 right-3 shadow-lg flex items-center justify-center hover:scale-110 transition-all duration-200 z-10"
                style={{
                  background: "white",
                  cursor: "pointer",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  aspectRatio: "1 / 1",
                  padding: "0",
                  border: "none",
                  outline: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleWishlistClick(product.id);
                }}
                title={
                  isInWishlist(product.id)
                    ? "Remove from wishlist"
                    : "Add to wishlist"
                }
              >
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    lineHeight: "1",
                    display: "block",
                  }}
                >
                  {isInWishlist(product.id) ? "❤️" : "🖤"}
                </span>
              </button>
              {/* Image section - fixed height */}
              <div className="h-32 w-full flex items-center justify-center bg-gray-50 rounded mb-2 overflow-hidden flex-shrink-0">
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

              {/* Content section - grows to fill available space */}
              <div className="flex flex-col flex-grow">
                <div
                  className="font-semibold text-lg truncate mb-1"
                  title={product.name}
                >
                  {product.name}
                </div>
                <div
                  className="text-sm truncate flex-grow"
                  style={{ color: "var(--foreground)" }}
                  title={product.description}
                >
                  {product.description.length > 48
                    ? product.description.slice(0, 48) + "..."
                    : product.description}
                </div>

                {/* Price and quantity controls - always at bottom */}
                <div className="mt-auto pt-2">
                  {/* Price and quantity controls in a row */}
                  <div className="flex items-center justify-between">
                    {/* Price tag on the left */}
                    <div
                      className="font-bold text-lg"
                      style={{ color: "var(--primary)" }}
                    >
                      £{product.price}
                    </div>
                    {/* Quantity controls on the right */}
                    <div className="flex items-center gap-1">
                      <button
                        className="px-1.5 py-0.5 rounded bg-gray-200 text-sm font-bold hover:bg-gray-300 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromCart(product.id);
                        }}
                        disabled={
                          !cart.find((item) => item.productId === product.id)
                            ?.quantity
                        }
                      >
                        -
                      </button>
                      <span className="min-w-[1.25rem] text-center text-sm">
                        {cart.find((item) => item.productId === product.id)
                          ?.quantity || 0}
                      </span>
                      <button
                        className="px-1.5 py-0.5 rounded bg-gray-200 text-sm font-bold hover:bg-gray-300 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product.id, 1);
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
      <ProductModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <SignInPopup
        isOpen={showSignInPopup}
        onClose={() => setShowSignInPopup(false)}
      />
    </div>
  );
};

export default ProductGrid;
