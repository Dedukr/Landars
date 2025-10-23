import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  trailingSlash: true,
  output: "standalone", // Enable standalone output for Docker

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
