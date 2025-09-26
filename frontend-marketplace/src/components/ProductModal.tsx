import React from "react";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url?: string | null;
  stock_quantity?: number;
}

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

const ProductModal: React.FC<ProductModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const { cart, addToCart, removeFromCart } = useCart();

  if (!isOpen || !product) return null;

  const quantity = cart.find((i) => i.productId === product.id)?.quantity || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative z-10 w-11/12 max-w-md rounded-lg shadow-lg overflow-hidden border-2"
        style={{
          background: "var(--card-bg)",
          color: "var(--foreground)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div
          className="w-full h-56 bg-gray-50 relative border-b-2"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">
              🍎
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="text-xl font-semibold">{product.name}</div>
          <div className="text-sm mt-2" style={{ color: "var(--foreground)" }}>
            {product.description}
          </div>
          <div
            className="text-lg font-bold mt-3 text-center"
            style={{ color: "var(--primary)" }}
          >
            £{product.price}
          </div>

          {/* Divider line */}
          <div
            className="w-full h-px my-4"
            style={{ backgroundColor: "var(--sidebar-border)" }}
          ></div>

          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              className="px-3 py-1 rounded bg-gray-200 text-lg font-bold hover:bg-gray-300 transition-colors"
              onClick={() => removeFromCart(product.id)}
              disabled={quantity <= 0}
            >
              -
            </button>
            <span className="min-w-[1.5rem] text-center">{quantity}</span>
            <button
              className="px-3 py-1 rounded bg-gray-200 text-lg font-bold hover:bg-gray-300 transition-colors"
              onClick={() => addToCart(product.id, 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
