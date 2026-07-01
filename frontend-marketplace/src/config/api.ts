/**
 * Centralized API Configuration
 *
 * This module provides a single source of truth for API configuration
 * following Next.js best practices for development and production environments.
 */

/**
 * Get the base URL for API requests
 */
export const getApiBaseUrl = (): string => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  // Development: Use relative paths to leverage Next.js rewrites
  return "";
};

/**
 * Base URL for fetch/httpClient in the current runtime.
 * In the browser we prefer same-origin `/api/...` so Cloudflare tunnel / phone testing
 * does not call https://localhost on the remote device.
 */
export function getClientApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";

  if (typeof window !== "undefined") {
    if (
      !configured ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(configured)
    ) {
      return "";
    }
    try {
      const target = new URL(configured);
      if (target.hostname === window.location.hostname) {
        return "";
      }
    } catch {
      return "";
    }
    return configured;
  }

  if (configured) return configured;
  const internal = process.env.METADATA_API_BASE_URL?.trim().replace(/\/$/, "");
  if (internal) return internal;
  return "https://localhost";
}

/**
 * API endpoints configuration
 */
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: "/auth/login/",
    REGISTER: "/auth/register/",
    LOGOUT: "/auth/logout/",
    PROFILE: "/auth/profile/",
    REFRESH_TOKEN: "/auth/token/refresh/",
    CSRF_TOKEN: "/auth/csrf-token/",
    VERIFY_EMAIL: "/auth/verify-email/",
    RESET_PASSWORD: "/auth/reset-password/",
    CHANGE_PASSWORD: "/auth/change-password/",
  },

  // Products
  PRODUCTS: {
    LIST: "/products/",
    DETAIL: (id: number) => `/products/${id}/`,
    SEARCH: "/products/search/",
    CATEGORIES: "/products/categories/",
    RECOMMENDATIONS: (id: number) => `/products/${id}/recommendations/`,
  },

  // Cart
  CART: {
    LIST: "/cart/",
    ADD: "/cart/add/",
    UPDATE: (id: number) => `/cart/${id}/`,
    REMOVE: (id: number) => `/cart/${id}/`,
    CLEAR: "/cart/clear/",
  },

  // Wishlist
  WISHLIST: {
    LIST: "/wishlist/",
    ADD: "/wishlist/add/",
    REMOVE: (id: number) => `/wishlist/${id}/`,
    CLEAR: "/wishlist/clear/",
  },

  // Orders
  ORDERS: {
    LIST: "/orders/",
    DETAIL: (id: number) => `/orders/${id}/`,
    CREATE: "/orders/create/",
    CANCEL: (id: number) => `/orders/${id}/cancel/`,
  },

  // Checkout
  CHECKOUT: {
    PROCESS: "/checkout/process/",
    VALIDATE: "/checkout/validate/",
  },

  // Reviews (public)
  REVIEWS: {
    HIGHLIGHTS: "/reviews/highlights/",
    SHOP: "/reviews/shop/",
    SHOP_ME: "/reviews/shop/me/",
    PRODUCT_REVIEWS: (productId: number) => `/products/${productId}/reviews/`,
  },

  // Admin API (staff only)
  ADMIN: {
    REVIEWS: {
      LIST: "/admin/reviews/",
      DETAIL: (id: number) => `/admin/reviews/${id}/`,
    },
  },
} as const;

/**
 * Environment-specific configuration
 */
export const API_CONFIG = {
  // Development configuration
  development: {
    baseUrl: "https://localhost",
    timeout: 30000,
    retries: 3,
  },

  // Production configuration
  production: {
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "https://landarsfood.com",
    timeout: 10000,
    retries: 2,
  },
} as const;

/**
 * Get current API configuration based on environment
 */
export const getApiConfig = () => {
  const isDevelopment = process.env.NODE_ENV === "development";
  return isDevelopment ? API_CONFIG.development : API_CONFIG.production;
};

/**
 * Build full API URL
 */
export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${endpoint}`;
};

/**
 * Check if we're in development mode
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === "development";
};

/**
 * Check if we're in production mode
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === "production";
};
