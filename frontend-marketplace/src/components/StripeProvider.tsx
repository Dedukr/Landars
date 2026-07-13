"use client";

import React from "react";
import { Elements } from "@stripe/react-stripe-js";
import { stripePromise, getStripeOptions } from "@/config/stripe";

interface StripeProviderProps {
  children: React.ReactNode;
  clientSecret?: string;
}

export default function StripeProvider({
  children,
  clientSecret,
}: StripeProviderProps) {
  const options = {
    ...getStripeOptions(),
    clientSecret,
  } as const;

  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}
