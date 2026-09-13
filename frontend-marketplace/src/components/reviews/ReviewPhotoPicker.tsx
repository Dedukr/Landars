"use client";

import React, { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { MAX_REVIEW_PHOTOS } from "@/utils/uploadReviewImage";

export interface ReviewPhotoDraft {
  /** Local object URL for preview, or remote CDN URL for existing photos */
  previewUrl: string;
  /** Local file to upload on submit (undefined for already-uploaded / existing) */
  file?: File;
  /** Remote URL already on R2 */
  imageUrl?: string;
}

interface ReviewPhotoPickerProps {
  photos: ReviewPhotoDraft[];
  onChange: (photos: ReviewPhotoDraft[]) => void;
  max?: number;
  disabled?: boolean;
  error?: string;
}

export default function ReviewPhotoPicker({
  photos,
  onChange,
  max = MAX_REVIEW_PHOTOS,
  disabled = false,
  error,
}: ReviewPhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = Math.max(0, max - photos.length);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || remaining <= 0) return;
    const next = [...photos];
    for (const file of Array.from(fileList)) {
      if (next.length >= max) break;
      if (!file.type.startsWith("image/")) continue;
      next.push({
        previewUrl: URL.createObjectURL(file),
        file,
      });
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (index: number) => {
    const target = photos[index];
    if (target?.file && target.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Photos{" "}
          <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>
            (optional, up to {max})
          </span>
        </label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {photos.length}/{max}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {photos.map((photo, index) => (
          <div
            key={`${photo.previewUrl}-${index}`}
            className="relative w-20 h-20 rounded-lg overflow-hidden border shrink-0"
            style={{ borderColor: "var(--sidebar-border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              disabled={disabled}
              className="absolute top-1 right-1 rounded-full p-0.5 bg-black/60 text-white hover:bg-black/80 disabled:opacity-40"
              aria-label="Remove photo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{
              borderColor: "var(--sidebar-border)",
              color: "var(--muted-foreground)",
              background: "var(--sidebar-bg)",
            }}
          >
            <ImagePlus className="w-5 h-5" aria-hidden />
            Add
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        disabled={disabled || remaining <= 0}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <p className="text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

interface ReviewPhotoGalleryProps {
  images?: Array<{ image_url: string; alt_text?: string | null }>;
  size?: "sm" | "md";
}

/** Read-only thumbnail strip for review cards. */
export function ReviewPhotoGallery({ images, size = "sm" }: ReviewPhotoGalleryProps) {
  if (!images?.length) return null;
  const dim = size === "md" ? "w-24 h-24" : "w-16 h-16";

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img, i) => (
        <a
          key={`${img.image_url}-${i}`}
          href={img.image_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${dim} rounded-lg overflow-hidden border shrink-0`}
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.image_url}
            alt={img.alt_text || "Review photo"}
            className="w-full h-full object-cover"
          />
        </a>
      ))}
    </div>
  );
}
