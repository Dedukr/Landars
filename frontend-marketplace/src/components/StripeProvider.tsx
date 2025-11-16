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

    // Listen to system preference changes as well
    const mql: MediaQueryList = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );
    const mqlHandler = () => updateKey();
    const mqlAny = mql as unknown as {
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
      addListener?: (listener: () => void) => void; // legacy Safari
      removeListener?: (listener: () => void) => void; // legacy Safari
    };

    if (typeof mqlAny.addEventListener === "function") {
      mqlAny.addEventListener("change", mqlHandler);
    } else if (typeof mqlAny.addListener === "function") {
      mqlAny.addListener(mqlHandler);
    }

    return () => {
      observer.disconnect();
      const mqlAnyCleanup = mql as unknown as {
        removeEventListener?: (type: string, listener: () => void) => void;
        removeListener?: (listener: () => void) => void;
      };
      if (typeof mqlAnyCleanup.removeEventListener === "function") {
        mqlAnyCleanup.removeEventListener("change", mqlHandler);
      } else if (typeof mqlAnyCleanup.removeListener === "function") {
        mqlAnyCleanup.removeListener(mqlHandler);
      }
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
