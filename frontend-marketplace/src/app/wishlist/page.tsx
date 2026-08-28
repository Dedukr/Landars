"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import WishlistSignedIn from "./WishlistSignedIn";
import WishlistLoadingState from "@/components/wishlist/WishlistLoadingState";

export default function WishlistPage() {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <WishlistLoadingState />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <NotAuthenticatedState
        title="Sign in to view your wishlist"
        description="Save your favourite products and access them any time."
        signInHref={getAuthUrl({ next: pathname })}
        showShopLink
      />
    );
  }

  return <WishlistSignedIn />;
}
