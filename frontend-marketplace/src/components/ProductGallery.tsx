import React from "react";
import Image from "next/image";

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
  if (images.length === 0) {
    return (
      <div
        className="aspect-square rounded-lg flex items-center justify-center"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <span className="text-6xl" style={{ color: "var(--muted-foreground)" }}>
          🍎
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div
        className="relative aspect-square rounded-lg overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <div className="relative w-full h-full">
          <Image
            src={images[selectedImage]}
            alt={`Product image ${selectedImage + 1}`}
            fill
            className="object-cover"
            priority
          />
        </div>
      </div>

      {/* Thumbnail Images */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => onImageSelect(index)}
              className="aspect-square rounded-lg overflow-hidden border-2 transition-all"
              style={{
                borderColor:
                  selectedImage === index
                    ? "var(--primary)"
                    : "var(--sidebar-border)",
                boxShadow:
                  selectedImage === index ? "0 0 0 2px var(--primary)" : "none",
              }}
              onMouseEnter={(e) => {
                if (selectedImage !== index) {
                  e.currentTarget.style.borderColor = "var(--foreground)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedImage !== index) {
                  e.currentTarget.style.borderColor = "var(--sidebar-border)";
                }
              }}
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
    </div>
  );
};

export default ProductGallery;
