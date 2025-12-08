import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  trailingSlash: true,
  output: "standalone", // Enable standalone output for Docker

  // Image configuration - allow external image domains
  images: {
    remotePatterns: [
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
    ],
    // Allow unoptimized images if needed (fallback)
    unoptimized: false,
    // Image optimization settings
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
  },

  // Proxy API calls to backend
  async rewrites() {
    // Get backend URL from environment variables
    const getBackendUrl = () => {
      if (process.env.NODE_ENV === "development") {
        // For development, use NEXT_PUBLIC_API_BASE_URL or fallback to https://localhost
        const apiBaseUrl =
          process.env.NEXT_PUBLIC_API_BASE_URL || "https://localhost";
        return `${apiBaseUrl}/api/:path*/`;
      } else {
        // For production, use Docker service name
        return "http://backend:8000/api/:path*/";
      }
    };

    return [
      {
        source: "/api/:path*",
        destination: getBackendUrl(),
      },
    ];
  },
};

export default nextConfig;
