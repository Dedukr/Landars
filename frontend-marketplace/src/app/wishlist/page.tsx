"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import WishlistSignedIn from "./WishlistSignedIn";

export default function WishlistPage() {
  const pathname = usePathname();
  const { user } = useAuth();

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
