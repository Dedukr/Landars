"use client";
import React, { memo } from "react";
import Image from "next/image";

interface OrderReviewItemProps {
  product: {
    id: number;
    name: string;
    price: string;
    image_url?: string | null;
    description?: string;
  };
  quantity: number;
  totalPrice: string;
}

const OrderReviewItem = memo<OrderReviewItemProps>(
  ({ product, quantity, totalPrice }) => {
    return (
      <div
        className="p-6"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            {product?.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                width={80}
                height={80}
                className="w-20 h-20 object-cover rounded-lg"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-lg flex items-center justify-center"
                style={{ background: "var(--sidebar-bg)" }}
              >
                <span className="text-2xl">🍎</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-medium"
              style={{ color: "var(--foreground)" }}
            >
              {product?.name || "Product"}
            </h3>
            {product?.description && (
              <p
                className="text-sm mt-1 line-clamp-2"
                style={{
                  color: "var(--foreground)",
                  opacity: 0.6,
                }}
              >
                {product.description}
              </p>
            )}
            <div className="mt-2 flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span
                  className="text-sm font-medium px-2 py-1 rounded"
                  style={{
                    background: "var(--sidebar-bg)",
                    color: "var(--foreground)",
                  }}
                >
                  Qty: {quantity}
                </span>
              </div>
              <div
                className="text-sm"
                style={{
                  color: "var(--foreground)",
                  opacity: 0.6,
                }}
              >
                £{product?.price ? parseFloat(product.price).toFixed(2) : "0.00"} each
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <div
              className="text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              £{parseFloat(totalPrice).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

OrderReviewItem.displayName = "OrderReviewItem";

export default OrderReviewItem;
