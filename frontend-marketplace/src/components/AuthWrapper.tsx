"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { isPublicCatalogRoute } from "@/lib/publicCatalogRoutes";

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { loading } = useAuth();
  const pathname = usePathname() ?? "/";

  // Shop, home, and product pages load the catalogue in parallel with session restore.
  if (loading && !isPublicCatalogRoute(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Restoring your session..." />
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthWrapper;
