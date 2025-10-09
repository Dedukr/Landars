"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import SignInPopup from "@/components/SignInPopup";
import Breadcrumb from "@/components/Breadcrumb";
import ProductGallery from "@/components/ProductGallery";
import ProductDetails from "@/components/ProductDetails";
import RelatedProducts from "@/components/RelatedProducts";
import LoadingSpinner from "@/components/LoadingSpinner";

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url?: string | null;
  stock_quantity?: number;
  category?: {
    id: number;
    name: string;
  };
  images?: string[];
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

// interface Review {
//   id: number;
//   user: {
//     name: string;
//     avatar?: string;
//   };
//   rating: number;
//   title: string;
//   comment: string;
//   date: string;
//   verified: boolean;
// }

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const { cart, addToCart, removeFromCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const productId = params.id;

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Product Not Found
          </h1>
          <p className="text-gray-600 mb-4">
            {error || "The product you're looking for doesn't exist."}
          </p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800">
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
          {/* Product Images */}
          <div className="space-y-4">
            <ProductGallery
              images={
                product.images || (product.image_url ? [product.image_url] : [])
              }
              selectedImage={selectedImage}
              onImageSelect={setSelectedImage}
            />
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            {/* Product Header */}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {product.name}
              </h1>
            </div>

            {/* Price */}
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              £{product.price}
            </div>

            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Description
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <label
                  htmlFor="quantity"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Quantity:
                </label>
                <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg">
                  <button
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                    className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    id="quantity"
                    value={quantity}
                    onChange={(e) =>
                      handleQuantityChange(parseInt(e.target.value) || 1)
                    }
                    min="1"
                    max={99}
                    className="w-16 text-center border-0 focus:ring-0 bg-transparent text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= 99}
                    className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  Add to Cart
                </button>
                <button
                  onClick={handleWishlistClick}
                  className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-800 dark:text-blue-200">
                      {cartQuantity} in your cart
                    </span>
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Key Features */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Key Features
              </h3>
              <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <li>• Fresh, locally sourced ingredients</li>
                <li>• Sustainable packaging</li>
                <li>• Free delivery on orders over £25</li>
                <li>• 30-day satisfaction guarantee</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <div className="mt-12">
          <ProductDetails product={product} />
        </div>

        {/* Related Products */}
        <div className="mt-12">
          <RelatedProducts
            categoryId={product.category?.id}
            currentProductId={product.id}
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
