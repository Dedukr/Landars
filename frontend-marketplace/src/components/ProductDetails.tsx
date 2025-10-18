import React, { useState } from "react";
import {
  InformationCircleIcon,
  BeakerIcon,
  ShieldCheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

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

interface ProductDetailsProps {
  product: Product;
}

const ProductDetails: React.FC<ProductDetailsProps> = ({ product }) => {
  const [activeTab, setActiveTab] = useState("specifications");

  const tabs = [
    {
      id: "specifications",
      label: "Specifications",
      icon: InformationCircleIcon,
    },
    { id: "nutrition", label: "Nutrition", icon: BeakerIcon },
    { id: "allergens", label: "Allergens", icon: ExclamationTriangleIcon },
    { id: "storage", label: "Storage", icon: ShieldCheckIcon },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "specifications":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {product.specifications &&
                Object.entries(product.specifications).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between py-2"
                    style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                  >
                    <span
                      className="font-medium capitalize"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {key.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "var(--foreground)" }}>{value}</span>
                  </div>
                ))}
              {(!product.specifications ||
                Object.keys(product.specifications).length === 0) && (
                <div
                  className="col-span-2 text-center py-8"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  No specifications available
                </div>
              )}
            </div>
          </div>
        );

      case "nutrition":
        return (
          <div className="space-y-6">
            {product.nutrition_info ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {product.nutrition_info.calories && (
                  <div
                    className="text-center p-4 rounded-lg"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {product.nutrition_info.calories}
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Calories
                    </div>
                  </div>
                )}
                {product.nutrition_info.protein && (
                  <div
                    className="text-center p-4 rounded-lg"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {product.nutrition_info.protein}g
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Protein
                    </div>
                  </div>
                )}
                {product.nutrition_info.carbs && (
                  <div
                    className="text-center p-4 rounded-lg"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {product.nutrition_info.carbs}g
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Carbs
                    </div>
                  </div>
                )}
                {product.nutrition_info.fat && (
                  <div
                    className="text-center p-4 rounded-lg"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {product.nutrition_info.fat}g
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Fat
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="text-center py-8"
                style={{ color: "var(--muted-foreground)" }}
              >
                No nutrition information available
              </div>
            )}

            {product.ingredients && product.ingredients.length > 0 && (
              <div>
                <h4
                  className="font-semibold mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  Ingredients
                </h4>
                <p style={{ color: "var(--muted-foreground)" }}>
                  {product.ingredients.join(", ")}
                </p>
              </div>
            )}
          </div>
        );

      case "allergens":
        return (
          <div className="space-y-4">
            {product.allergens && product.allergens.length > 0 ? (
              <div className="space-y-3">
                <div
                  className="flex items-center space-x-2"
                  style={{ color: "var(--destructive)" }}
                >
                  <ExclamationTriangleIcon className="w-5 h-5" />
                  <span className="font-medium">Contains allergens:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.allergens.map((allergen, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        background: "var(--destructive)",
                        color: "white",
                      }}
                    >
                      {allergen}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="flex items-center space-x-2"
                style={{ color: "var(--success)" }}
              >
                <ShieldCheckIcon className="w-5 h-5" />
                <span className="font-medium">No known allergens</span>
              </div>
            )}
          </div>
        );

      case "storage":
        return (
          <div className="space-y-4">
            {product.storage_instructions && (
              <div>
                <h4
                  className="font-semibold mb-2 flex items-center"
                  style={{ color: "var(--foreground)" }}
                >
                  <ShieldCheckIcon className="w-5 h-5 mr-2" />
                  Storage Instructions
                </h4>
                <p style={{ color: "var(--muted-foreground)" }}>
                  {product.storage_instructions}
                </p>
              </div>
            )}

            {product.shelf_life && (
              <div>
                <h4
                  className="font-semibold mb-2 flex items-center"
                  style={{ color: "var(--foreground)" }}
                >
                  <ClockIcon className="w-5 h-5 mr-2" />
                  Shelf Life
                </h4>
                <p style={{ color: "var(--muted-foreground)" }}>
                  {product.shelf_life}
                </p>
              </div>
            )}

            {!product.storage_instructions && !product.shelf_life && (
              <div
                className="text-center py-8"
                style={{ color: "var(--muted-foreground)" }}
              >
                No storage information available
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="rounded-lg shadow-sm"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Tab Navigation */}
      <div style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors"
                style={{
                  borderBottomColor:
                    activeTab === tab.id ? "var(--primary)" : "transparent",
                  color:
                    activeTab === tab.id
                      ? "var(--primary)"
                      : "var(--muted-foreground)",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.color = "var(--foreground)";
                    e.currentTarget.style.borderBottomColor =
                      "var(--sidebar-border)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.color = "var(--muted-foreground)";
                    e.currentTarget.style.borderBottomColor = "transparent";
                  }
                }}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">{renderTabContent()}</div>
    </div>
  );
};

export default ProductDetails;
