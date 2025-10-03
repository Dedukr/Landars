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
        source: "/api/auth/register",
        destination: "http://backend:8000/api/auth/register/",
      },
      {
        source: "/api/auth/login",
        destination: "http://backend:8000/api/auth/login/",
      },
      {
        source: "/api/auth/logout",
        destination: "http://backend:8000/api/auth/logout/",
      },
      {
        source: "/api/auth/csrf-token",
        destination: "http://backend:8000/api/auth/csrf-token/",
      },
      {
        source: "/api/auth/csrf-token/",
        destination: "http://backend:8000/api/auth/csrf-token/",
      },
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
