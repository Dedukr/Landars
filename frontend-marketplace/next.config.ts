import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  trailingSlash: true,
  output: "standalone", // Enable standalone output for Docker
  async rewrites() {
    return [
      {
        source: "/api/categories",
        destination: "http://backend:8000/api/categories/",
      },
      {
        source: "/api/products",
        destination: "http://backend:8000/api/products/",
      },
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
