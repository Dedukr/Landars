"use client";

import React, { useEffect, useState } from "react";
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
  // Track theme changes so Elements remounts with correct Stripe appearance
  const [themeKey, setThemeKey] = useState<string>(() => {
    const appearance = getStripeOptions().appearance as { theme?: string };
    return `elements-${appearance?.theme ?? "stripe"}`;
  });

  useEffect(() => {
    // Observe changes to html class or data-theme attributes
    const htmlEl = document.documentElement;

    const updateKey = () => {
      const appearance = getStripeOptions().appearance as { theme?: string };
      setThemeKey(`elements-${appearance?.theme ?? "stripe"}`);
    };

    // Mutation observer for class/data-theme changes
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (
          m.type === "attributes" &&
          (m.attributeName === "class" || m.attributeName === "data-theme")
        ) {
          updateKey();
          break;
        }
      }
    });
    observer.observe(htmlEl, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const options = {
    ...getStripeOptions(),
    clientSecret,
  } as const;

  return (
    <Elements key={themeKey} stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}
