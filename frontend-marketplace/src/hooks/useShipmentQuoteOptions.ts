/**
 * Courier quote options from the Django **shipment** app (Sendcloud-backed).
 */

import { useState, useCallback } from "react";
import { httpClient } from "@/utils/httpClient";
import { SHIPPING_QUOTE_OPTIONS_URL } from "@/constants/shippingBackend";

/** One priced method row returned by `POST /api/shipping/options/`. */
export interface ShipmentQuoteOption {
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

export interface ShipmentQuoteAddress {
  country: string;
  postal_code: string;
  city?: string;
  address_line?: string;
}

export interface ShipmentQuoteCartItem {
  product_id?: number;
  product?: number;
  quantity: string | number;
}

export function useShipmentQuoteOptions() {
  const [options, setOptions] = useState<ShipmentQuoteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShipmentQuotes = useCallback(
    async (address: ShipmentQuoteAddress, items: ShipmentQuoteCartItem[]) => {
      if (!address.country || !address.postal_code) {
        setError("Country and postal code are required");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await httpClient.post<{
          success: boolean;
          options: ShipmentQuoteOption[];
          error?: string;
        }>(SHIPPING_QUOTE_OPTIONS_URL, {
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
          setError(response.error || "Failed to fetch delivery quotes");
          setOptions([]);
        }
      } catch (err) {
        console.error("Error fetching shipment quotes:", err);
        setError(
          "Unable to fetch delivery quotes. Please check your address and try again."
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
    fetchShipmentQuotes,
    clearOptions,
  };
}
