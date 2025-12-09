/**
 * Hook for fetching and managing shipping options
 */

import { useState, useCallback } from "react";
import { httpClient } from "@/utils/httpClient";

export interface ShippingOption {
  id: number;
  carrier: string;
  name: string;
  service_point_input: string;
  price: string;
  currency: string;
  min_delivery_days?: number | null;
  max_delivery_days?: number | null;
  countries: string[];
  properties: Record<string, unknown>;
  logo_url?: string;
}

export interface ShippingAddress {
  country: string;
  postal_code: string;
  city?: string;
  address_line?: string;
}

export interface CartItem {
  product_id?: number;
  product?: number;
  quantity: string | number;
}

export function useShippingOptions() {
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShippingOptions = useCallback(
    async (address: ShippingAddress, items: CartItem[]) => {
      // Validate required fields
      if (!address.country || !address.postal_code) {
        setError("Country and postal code are required");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await httpClient.post<{
          success: boolean;
          options: ShippingOption[];
          error?: string;
        }>("/api/shipping/options/", {
          address: {
            country: address.country.toUpperCase(),
            postal_code: address.postal_code,
            city: address.city || "",
            address_line: address.address_line || "",
          },
          items: items.map((item) => ({
            product_id: item.product_id || item.product,
            quantity: parseFloat(item.quantity.toString()),
          })),
        });

        if (response.success && response.options) {
          setOptions(response.options);
        } else {
          setError(response.error || "Failed to fetch shipping options");
          setOptions([]);
        }
      } catch (err) {
        console.error("Error fetching shipping options:", err);
        setError(
          "Unable to fetch shipping options. Please check your address and try again."
        );
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearOptions = useCallback(() => {
    setOptions([]);
    setError(null);
  }, []);

  return {
    options,
    loading,
    error,
    fetchShippingOptions,
    clearOptions,
  };
}

