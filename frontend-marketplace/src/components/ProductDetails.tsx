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
                    className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800"
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {value}
                    </span>
                  </div>
                ))}
              {(!product.specifications ||
                Object.keys(product.specifications).length === 0) && (
                <div className="col-span-2 text-gray-500 dark:text-gray-400 text-center py-8">
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
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {product.nutrition_info.calories}
                    </div>
                    <div className="text-sm text-orange-700 dark:text-orange-300">
                      Calories
                    </div>
                  </div>
                )}
                {product.nutrition_info.protein && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {product.nutrition_info.protein}g
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      Protein
                    </div>
                  </div>
                )}
                {product.nutrition_info.carbs && (
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {product.nutrition_info.carbs}g
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">
                      Carbs
                    </div>
                  </div>
                )}
                {product.nutrition_info.fat && (
                  <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {product.nutrition_info.fat}g
                    </div>
                    <div className="text-sm text-purple-700 dark:text-purple-300">
                      Fat
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400 text-center py-8">
                No nutrition information available
              </div>
            )}

            {product.ingredients && product.ingredients.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Ingredients
                </h4>
                <p className="text-gray-700 dark:text-gray-300">
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
                <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                  <ExclamationTriangleIcon className="w-5 h-5" />
                  <span className="font-medium">Contains allergens:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.allergens.map((allergen, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 rounded-full text-sm font-medium"
                    >
                      {allergen}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
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
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                  <ShieldCheckIcon className="w-5 h-5 mr-2" />
                  Storage Instructions
                </h4>
                <p className="text-gray-700 dark:text-gray-300">
                  {product.storage_instructions}
                </p>
              </div>
            )}

            {product.shelf_life && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                  <ClockIcon className="w-5 h-5 mr-2" />
                  Shelf Life
                </h4>
                <p className="text-gray-700 dark:text-gray-300">
                  {product.shelf_life}
                </p>
              </div>
            )}

            {!product.storage_instructions && !product.shelf_life && (
              <div className="text-gray-500 dark:text-gray-400 text-center py-8">
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
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
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
