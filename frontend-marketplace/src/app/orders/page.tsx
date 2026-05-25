"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import OrdersSignedIn from "./OrdersSignedIn";

export default function OrdersPage() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) {
    return (
      <NotAuthenticatedState
        title="Sign in to view your orders"
        description="Your order history is available after signing in."
        signInHref={getAuthUrl({ next: pathname })}
        showShopLink
      />
    );
  }

  return <OrdersSignedIn />;
}
