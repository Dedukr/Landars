"use client";
import React, { useState } from "react";
import Image from "next/image";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ProductImageCollageProps {
  images: string[];
  alt: string;
  className?: string;
  layout?: "grid" | "masonry";
  onImageClick?: (index: number) => void;
}

const ProductImageCollage: React.FC<ProductImageCollageProps> = ({
  images,
  alt,
  className = "",
  onImageClick,
}) => {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });

  // Filter out null/undefined images
  const validImages = images.filter((img) => img && img.trim() !== "");

  const handleImageClick = (index: number) => {
    if (onImageClick) {
      onImageClick(index);
    } else {
      setSelectedImage(index);
      setIsZoomed(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  };

  const handleCloseZoom = () => {
    setIsZoomed(false);
    setSelectedImage(null);
  };

  // If no images, show placeholder
  if (validImages.length === 0) {
    return (
      <div
        className={`aspect-square rounded-lg flex items-center justify-center ${className}`}
        style={{ background: "var(--sidebar-bg)" }}
      >
        <span className="text-6xl" style={{ color: "var(--muted-foreground)" }}>
          🍎
        </span>
      </div>
    );
  }

  // Single image - full display
  if (validImages.length === 1) {
    return (
      <div
        className={`relative aspect-square rounded-lg overflow-hidden ${className}`}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <div
          className="relative w-full h-full cursor-zoom-in"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setIsZoomed(false)}
          onClick={() => handleImageClick(0)}
        >
          <Image
            src={validImages[0]}
            alt={alt}
            fill
            className={`object-cover transition-transform duration-300 ${
              isZoomed ? "scale-150" : "scale-100"
            }`}
            style={{
              transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
            }}
            priority
          />
        </div>
      </div>
    );
  }

  // Two images - side by side
  if (validImages.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {validImages.map((image, index) => (
          <div
            key={index}
            className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
            onClick={() => handleImageClick(index)}
          >
            <Image
              src={image}
              alt={`${alt} - Image ${index + 1}`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
          </div>
        ))}
      </div>
    );
  }

  // Three images - one large, two small
  if (validImages.length === 3) {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        <div
          className="relative row-span-2 rounded-lg overflow-hidden cursor-pointer group"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
          onClick={() => handleImageClick(0)}
        >
          <Image
            src={validImages[0]}
            alt={`${alt} - Image 1`}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        </div>
        <div
          className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
          onClick={() => handleImageClick(1)}
        >
          <Image
            src={validImages[1]}
            alt={`${alt} - Image 2`}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        </div>
        <div
          className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
          onClick={() => handleImageClick(2)}
        >
          <Image
            src={validImages[2]}
            alt={`${alt} - Image 3`}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        </div>
      </div>
    );
  }

  // Four or more images - grid layout
  if (validImages.length === 4) {
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {validImages.map((image, index) => (
          <div
            key={index}
            className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
            onClick={() => handleImageClick(index)}
          >
            <Image
              src={image}
              alt={`${alt} - Image ${index + 1}`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
          </div>
        ))}
      </div>
    );
  }

  // Five or more images - first large, rest grid
  return (
    <>
      <div className={`grid grid-cols-3 gap-2 ${className}`}>
        {/* Main large image */}
        <div
          className="relative col-span-2 row-span-2 rounded-lg overflow-hidden cursor-pointer group"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
          onClick={() => handleImageClick(0)}
        >
          <Image
            src={validImages[0]}
            alt={`${alt} - Image 1`}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        </div>

        {/* Smaller images */}
        {validImages.slice(1, 5).map((image, index) => (
          <div
            key={index + 1}
            className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
            onClick={() => handleImageClick(index + 1)}
          >
            <Image
              src={image}
              alt={`${alt} - Image ${index + 2}`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
            {/* Show "+X more" overlay if this is the last visible image */}
            {index === 3 && validImages.length > 5 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  +{validImages.length - 5} more
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Zoom Modal */}
      {isZoomed && selectedImage !== null && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4"
          onClick={handleCloseZoom}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={handleCloseZoom}
              className="absolute top-4 right-4 z-10 bg-opacity-90 rounded-full p-2 hover:bg-opacity-100 transition-colors"
              style={{ background: "var(--card-bg)" }}
            >
              <XMarkIcon
                className="w-6 h-6"
                style={{ color: "var(--foreground)" }}
              />
            </button>
            <div className="relative w-full h-full">
              <Image
                src={validImages[selectedImage]}
                alt={`${alt} - Image ${selectedImage + 1} - zoomed`}
                width={800}
                height={800}
                className="w-full h-full object-contain"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductImageCollage;

