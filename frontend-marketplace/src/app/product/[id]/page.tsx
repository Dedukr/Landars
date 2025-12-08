"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCartItems } from "@/hooks/useCartItems";
import { useWishlistItems } from "@/hooks/useWishlistItems";
import { useAuth } from "@/contexts/AuthContext";
import SignInPopup from "@/components/SignInPopup";
import Breadcrumb from "@/components/Breadcrumb";
import ProductGallery from "@/components/ProductGallery";
import ProductImageCollage from "@/components/ProductImageCollage";
// import ProductDetails from "@/components/ProductDetails";
import ProductRecommendations from "@/components/ProductRecommendations";
import LoadingSpinner from "@/components/LoadingSpinner";

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url?: string | null;
  images?: Array<{ image_url: string; sort_order: number }> | string[];
  primary_image?: string | null;
  stock_quantity?: number;
  category?: {
    id: number;
    name: string;
  };
  specifications?: {
    [key: string]: string;
  };
  nutrition_info?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  allergens?: string[];
  ingredients?: string[];
  storage_instructions?: string;
  shelf_life?: string;
}

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const { cart, addToCart, removeFromCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  // Get cart and wishlist items with full product details
  const { filteredProducts: cartItems } = useCartItems(products);
  const { filteredProducts: wishlistItems } = useWishlistItems(products);

  const productId = params.id;

  // Fetch all products for cart and wishlist hooks
  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch("/api/products/");
        if (response.ok) {
          const data = await response.json();
          const fetchedProducts = Array.isArray(data)
            ? data
            : data.results || [];
          setProducts(fetchedProducts);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    }
    fetchProducts();
  }, []);

  useEffect(() => {
    async function fetchProduct() {
      if (!productId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/products/${productId}/`);
        if (!response.ok) {
          throw new Error(`Product not found: ${response.status}`);
        }

        const data = await response.json();
        setProduct(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product");
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [productId]);

  const handleWishlistClick = () => {
    if (!user) {
      setShowSignInPopup(true);
      return;
    }

    if (!product) return;

    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product.id);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product.id, quantity);
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity >= 1 && newQuantity <= 99) {
      setQuantity(newQuantity);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !product) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <div className="text-center">
          <h1
            className="text-2xl font-bold mb-4"
            style={{ color: "var(--destructive)" }}
          >
            Product Not Found
          </h1>
          <p className="mb-4" style={{ color: "var(--muted-foreground)" }}>
            {error || "The product you're looking for doesn't exist."}
          </p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 rounded-lg transition-colors"
            style={{
              background: "var(--primary)",
              color: "white",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--primary)";
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const cartQuantity =
    cart.find((item) => item.productId === product.id)?.quantity || 0;

  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-950"
      style={{ background: "var(--background)" }}
    >
      {/* Breadcrumb Navigation */}
      <div
        className="border-b"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: product.category?.name || "Products", href: "/" },
              { label: product.name, href: "#" },
            ]}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Product Images - Collage Layout */}
          <div className="space-y-4">
            {(() => {
              // Extract image URLs from the images array
              // Handle both formats: array of strings or array of objects with image_url
              let imageUrls: string[] = [];
              
              if (product.images && product.images.length > 0) {
                imageUrls = product.images.map((img: string | { image_url: string }) => {
                  if (typeof img === "string") {
                    return img;
                  } else if (img && typeof img === "object" && "image_url" in img) {
                    return img.image_url;
                  }
                  return null;
                }).filter((url: string | null): url is string => url !== null);
              } else if (product.image_url || product.primary_image) {
                const url = product.image_url || product.primary_image;
                imageUrls = url ? [url] : [];
              }

              // Use collage for 2+ images, gallery for single image or when user wants gallery view
              if (imageUrls.length >= 2) {
                return (
                  <ProductImageCollage
                    images={imageUrls}
                    alt={product.name}
                    className="w-full"
                    onImageClick={(index) => setSelectedImage(index)}
                  />
                );
              }

              // Fallback to gallery for single image or empty
              return (
                <ProductGallery
                  images={imageUrls}
                  selectedImage={selectedImage}
                  onImageSelect={setSelectedImage}
                />
              );
            })()}
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            {/* Product Header */}
            <div>
              <h1
                className="text-3xl font-bold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                {product.name}
              </h1>
            </div>

            {/* Price */}
            <div
              className="text-3xl font-bold"
              style={{ color: "var(--success)" }}
            >
              £{product.price ? parseFloat(String(product.price)).toFixed(2) : "0.00"}
            </div>

            {/* Description */}
            <div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Description
              </h3>
              <p
                className="leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {product.description}
              </p>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <label
                  className="text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Quantity:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      border: "1px solid var(--sidebar-border)",
                      background: "var(--card-bg)",
                      color: "var(--foreground)",
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--sidebar-bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--card-bg)";
                      }
                    }}
                  >
                    -
                  </button>
                  <span
                    className="min-w-[2rem] text-center font-medium text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    {quantity}
                  </span>
                  <button
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= 99}
                    className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      border: "1px solid var(--sidebar-border)",
                      background: "var(--card-bg)",
                      color: "var(--foreground)",
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--sidebar-bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--card-bg)";
                      }
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold transition-colors"
                  style={{
                    background: "var(--success)",
                    color: "white",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(22, 163, 74, 0.8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--success)";
                  }}
                >
                  Add to Cart
                </button>
                <button
                  onClick={handleWishlistClick}
                  className="px-4 py-3 rounded-lg transition-colors"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--card-bg)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--card-bg)";
                  }}
                  title={
                    isInWishlist(product.id)
                      ? "Remove from wishlist"
                      : "Add to wishlist"
                  }
                >
                  <span className="text-xl">
                    {isInWishlist(product.id) ? "❤️" : "🤍"}
                  </span>
                </button>
              </div>

              {cartQuantity > 0 && (
                <div
                  className="rounded-lg p-4"
                  style={{
                    background: "var(--info-bg)",
                    border: "1px solid var(--info-border)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ color: "var(--info-text)" }}>
                      {cartQuantity} in your cart
                    </span>
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="text-sm underline"
                      style={{ color: "var(--info-text)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Key Features */}
            <div
              className="rounded-lg p-4"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h3
                className="font-semibold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Key Features
              </h3>
              <ul
                className="space-y-1 text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                <li>• Fresh, locally sourced ingredients</li>
                <li>• Sustainable packaging</li>
                <li>• Free delivery on orders over £25</li>
                <li>• 30-day satisfaction guarantee</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        {/* <div className="mt-12">
          <ProductDetails product={product} />
        </div> */}

        {/* Related Products */}
        <div className="mt-12">
          <ProductRecommendations
            excludeProducts={[product, ...cartItems, ...wishlistItems]}
            limit={4}
            title="You might also like"
            showWishlist={false}
            showQuickAdd={true}
            gridCols={{ default: 2, md: 4 }}
            className="mt-6"
          />
        </div>
      </div>

      <SignInPopup
        isOpen={showSignInPopup}
        onClose={() => setShowSignInPopup(false)}
      />
    </div>
  );
}
