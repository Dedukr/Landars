import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  trailingSlash: true,
  output: "standalone", // Enable standalone output for Docker

  // Proxy API calls to backend
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*/",
      },
    ];
  },
};

export default nextConfig;
