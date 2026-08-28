"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import CartSignedIn from "./CartSignedIn";
import CartLoadingState from "@/components/cart/CartLoadingState";

export default function CartPage() {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <CartLoadingState />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <NotAuthenticatedState
        title="Sign in to view your basket"
        description="Add items to your basket and checkout when you are signed in."
        signInHref={getAuthUrl({ next: pathname })}
        showShopLink
      />
    );
  }

  return <CartSignedIn />;
}
