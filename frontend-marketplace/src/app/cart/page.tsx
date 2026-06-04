"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import CartSignedIn from "./CartSignedIn";

export default function CartPage() {
  const pathname = usePathname();
  const { user } = useAuth();

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
