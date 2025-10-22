import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  trailingSlash: true,
  output: "standalone", // Enable standalone output for Docker

  // Proxy API calls to backend
  async rewrites() {
    // Get backend URL from environment variables
    const getBackendUrl = () => {
      const urlBase = process.env.URL_BASE || "https://localhost";
      if (process.env.NODE_ENV === "development") {
        // For development, use localhost with port 8000
        if (urlBase.includes("localhost")) {
          return "http://localhost:8000/api/:path*/";
        }
        // Extract domain from URL_BASE and use port 8000
        const domain = urlBase.replace(/^https?:\/\//, "").split(":")[0];
        return `http://${domain}:8000/api/:path*/`;
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
