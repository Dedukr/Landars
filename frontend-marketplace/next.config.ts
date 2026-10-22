import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  trailingSlash: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone", // Enable standalone output for Docker

  // Expose env to client (NEXT_PUBLIC_* are inlined at build time)
  env: {
    NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "",
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  },

  // Image configuration - allow external image domains
  images: {
    // We already serve fully-optimized images from the CDN, so disable
    // Next.js' built-in image optimizer to avoid heavy /_next/image work.
    // This makes Next serve the source URLs directly.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "localhost",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "127.0.0.1",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.landarsfood.com",
        pathname: "/**",
      },
      // Allow any R2 public URL (for flexibility)
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        pathname: "/**",
      },
      // Allow any Cloudflare R2 custom domain
      {
        protocol: "https",
        hostname: "*.cloudflarestorage.com",
        pathname: "/**",
      },
      // Allow Sendcloud carrier logos
      {
        protocol: "https",
        hostname: "www.sendcloud.com",
        pathname: "/wp-content/uploads/**",
      },
      // Allow Sendcloud panel assets
      {
        protocol: "https",
        hostname: "panel.sendcloud.sc",
        pathname: "/**",
      },
      // Allow Wikimedia Commons for carrier logos
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/**",
      },
      // Allow Logos World for carrier logos
      {
        protocol: "https",
        hostname: "logos-world.net",
        pathname: "/**",
      },
    ],
  },

  // Proxy API calls to backend
  async rewrites() {
    // Local nginx (https://localhost) presents a certificate Node does not trust, so a
    // rewrite to that origin fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE and the browser
    // sees "Failed to fetch" (including /api/auth/csrf-token/). Django is published on
    // loopback :8000 for this. Other configured origins are left unchanged.
    const devOrigin = () => {
      const configured = (
        process.env.NEXT_PUBLIC_API_BASE_URL || "https://localhost"
      )
        .trim()
        .replace(/\/$/, "");
      try {
        const url = new URL(configured);
        const localHttps =
          url.protocol === "https:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1");
        if (localHttps) return "http://127.0.0.1:8000";
      } catch {
        // Keep the configured string if it is not a URL.
      }
      return configured;
    };

    const getBackendUrl = () => {
      if (process.env.NODE_ENV === "development") {
        return `${devOrigin()}/api/:path*/`;
      }
      // For production, use Docker service name
      return "http://backend:8000/api/:path*/";
    };

    const getPayBackendUrl = () => {
      if (process.env.NODE_ENV === "development") {
        return `${devOrigin()}/pay/:path*/`;
      }
      return "http://backend:8000/pay/:path*/";
    };

    return [
      {
        source: "/api/:path*",
        destination: getBackendUrl(),
      },
      {
        // Local/dev: invoice payment links without nginx /pay → Django.
        source: "/pay/:path*",
        destination: getPayBackendUrl(),
      },
    ];
  },
};

export default nextConfig;
