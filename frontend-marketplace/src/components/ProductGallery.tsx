import React, { useState } from "react";
import Image from "next/image";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface ProductGalleryProps {
  images: string[];
  selectedImage: number;
  onImageSelect: (index: number) => void;
}

const ProductGallery: React.FC<ProductGalleryProps> = ({
  images,
  selectedImage,
  onImageSelect,
}) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  };

  const handleZoomToggle = () => {
    setIsZoomed(!isZoomed);
  };

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg flex items-center justify-center">
        <span className="text-6xl text-gray-300 dark:text-gray-700">🍎</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div className="relative aspect-square bg-white dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
        <div
          className="relative w-full h-full cursor-zoom-in"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setIsZoomed(false)}
          onClick={handleZoomToggle}
        >
          <Image
            src={images[selectedImage]}
            alt={`Product image ${selectedImage + 1}`}
            fill
            className={`object-cover transition-transform duration-300 ${
              isZoomed ? "scale-150" : "scale-100"
            }`}
            style={{
              transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
            }}
            priority
          />

          {/* Zoom overlay */}
          {isZoomed && (
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
              <div className="bg-white dark:bg-gray-900 bg-opacity-90 rounded-full p-2">
                <MagnifyingGlassIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Thumbnail Images */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => onImageSelect(index)}
              className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                selectedImage === index
                  ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              }`}
            >
              <Image
                src={image}
                alt={`Product thumbnail ${index + 1}`}
                width={100}
                height={100}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Zoom Modal */}
      {isZoomed && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-900 bg-opacity-90 rounded-full p-2 hover:bg-opacity-100 transition-colors"
            >
              <XMarkIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="relative w-full h-full">
              <Image
                src={images[selectedImage]}
                alt={`Product image ${selectedImage + 1} - zoomed`}
                width={800}
                height={800}
                className="w-full h-full object-contain"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductGallery;
