/**
 * Shipping Options Component
 *
 * Displays available shipping options and allows user to select one
 */

import React, { useState } from "react";
import type { ShippingOption } from "@/hooks/useShippingOptions";
import LoadingSpinner from "./LoadingSpinner";

interface ShippingOptionsProps {
  options: ShippingOption[];
  selectedOptionId: number | null;
  onSelectOption: (optionId: number) => void;
  loading?: boolean;
  error?: string | null;
}

// Component to handle logo image with error fallback
function LogoImage({
  src,
  alt,
  fallbackText,
}: {
  src: string;
  alt: string;
  fallbackText: string;
}) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div
        className="px-3 py-2 rounded text-xs font-medium"
        style={{
          background: "var(--sidebar-border)",
          color: "var(--foreground)",
        }}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <div className="w-24 h-16 bg-white rounded border border-gray-200 flex items-center justify-center p-2">
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

export default function ShippingOptions({
  options,
  selectedOptionId,
  onSelectOption,
  loading = false,
  error = null,
}: ShippingOptionsProps) {
  if (loading) {
    return (
      <div
        className="rounded-lg shadow-sm p-6"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <h2
          className="text-xl font-semibold mb-6"
          style={{ color: "var(--foreground)" }}
        >
          Shipping Options
        </h2>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
          <span className="ml-3" style={{ color: "var(--foreground)" }}>
            Loading shipping options...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg shadow-sm p-6"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <h2
          className="text-xl font-semibold mb-6"
          style={{ color: "var(--foreground)" }}
        >
          Shipping Options
        </h2>
        <div
          className="p-4 rounded-md"
          style={{
            background: "var(--destructive-bg)",
            border: "1px solid var(--destructive-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div
        className="rounded-lg shadow-sm p-6"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <h2
          className="text-xl font-semibold mb-6"
          style={{ color: "var(--foreground)" }}
        >
          Shipping Options
        </h2>
        <div
          className="p-4 rounded-md"
          style={{
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--info-text)" }}>
            Please complete your shipping address to view available delivery
            options.
          </p>
        </div>
      </div>
    );
  }

  const formatDeliveryTime = (
    minDays?: number | null,
    maxDays?: number | null
  ) => {
    if (!minDays && !maxDays) return null;
    if (minDays === maxDays)
      return `${minDays} ${minDays === 1 ? "day" : "days"}`;
    if (minDays && maxDays) return `${minDays}-${maxDays} days`;
    if (minDays) return `${minDays}+ days`;
    if (maxDays) return `Up to ${maxDays} days`;
    return null;
  };

  // Get carrier display name
  const getCarrierDisplayName = (carrier: string) => {
    const carrierLower = carrier.toLowerCase();

    // Map carrier codes to display names
    const nameMapping: Record<string, string> = {
      royal_mail: "Royal Mail",
      royal_mailv2: "Royal Mail",
      dpd: "DPD",
      dpd_gb: "DPD",
      evri: "Evri",
      hermes_c2c_gb: "Evri",
      ups: "UPS",
      dhl: "DHL",
      inpost_gb: "InPost",
      parcelforce: "Parcelforce",
    };

    return (
      nameMapping[carrierLower] ||
      carrier.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    );
  };

  // Extract size/type from service name (e.g., "Large Letter", "Medium Parcel 0-5kg")
  const extractServiceDetails = (serviceName: string) => {
    // Remove common prefixes
    const details = serviceName
      .replace(/Royal Mail/gi, "")
      .replace(/Tracked 48/gi, "")
      .replace(/Tracked 24/gi, "")
      .replace(/^[\s-]+|[\s-]+$/g, ""); // Trim dashes and spaces

    return details || serviceName;
  };

  return (
    <div
      className="rounded-lg shadow-sm p-6"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
      }}
    >
      <h2
        className="text-xl font-semibold mb-6"
        style={{ color: "var(--foreground)" }}
      >
        Shipping Options
      </h2>

      <div className="space-y-3">
        {options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          const deliveryTime = formatDeliveryTime(
            option.min_delivery_days,
            option.max_delivery_days
          );
          const carrierDisplayName = getCarrierDisplayName(option.carrier);
          const serviceDetails = extractServiceDetails(option.name);
          const logoUrl = option.logo_url || "";

          return (
            <div
              key={option.id}
              onClick={() => onSelectOption(option.id)}
              className="cursor-pointer rounded-lg p-4 transition-all"
              style={{
                border: isSelected
                  ? "2px solid var(--primary)"
                  : "1px solid var(--sidebar-border)",
                background: isSelected
                  ? "var(--primary-bg)"
                  : "var(--background)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start space-x-4 flex-1">
                  {/* Radio Button */}
                  <div className="flex items-center h-6 mt-1">
                    <div
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                      style={{
                        borderColor: isSelected
                          ? "var(--primary)"
                          : "var(--sidebar-border)",
                      }}
                    >
                      {isSelected && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: "var(--primary)" }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Carrier Logo */}
                  <div className="flex-shrink-0">
                    {logoUrl ? (
                      <LogoImage
                        src={logoUrl}
                        alt={`${carrierDisplayName} logo`}
                        fallbackText={carrierDisplayName}
                      />
                    ) : (
                      <div
                        className="px-3 py-2 rounded text-xs font-medium"
                        style={{
                          background: "var(--sidebar-border)",
                          color: "var(--foreground)",
                        }}
                      >
                        {carrierDisplayName}
                      </div>
                    )}
                  </div>

                  {/* Option Details */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-base font-semibold"
                      style={{
                        color: "var(--foreground)",
                      }}
                    >
                      {carrierDisplayName}
                    </h3>
                    <p
                      className="text-sm mt-0.5"
                      style={{
                        color: "var(--foreground)",
                        opacity: 0.8,
                      }}
                    >
                      {serviceDetails}
                    </p>

                    {deliveryTime && (
                      <p
                        className="text-xs mt-1 flex items-center"
                        style={{
                          color: "var(--foreground)",
                          opacity: 0.6,
                        }}
                      >
                        <span className="mr-1">🚚</span>
                        {deliveryTime} delivery
                      </p>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span
                    className="font-bold text-xl"
                    style={{ color: "var(--foreground)" }}
                  >
                    £{parseFloat(option.price).toFixed(2)}
                  </span>
                  {option.currency !== "GBP" && (
                    <span
                      className="text-xs mt-0.5"
                      style={{
                        color: "var(--foreground)",
                        opacity: 0.5,
                      }}
                    >
                      {option.currency}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedOptionId && (
        <div
          className="mt-4 p-3 rounded-md"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--success-text)" }}>
            ✓ Shipping method selected
          </p>
        </div>
      )}
    </div>
  );
}
