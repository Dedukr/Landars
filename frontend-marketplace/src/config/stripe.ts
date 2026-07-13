import { loadStripe } from "@stripe/stripe-js";

// Get the publishable key from environment variables
// In Docker: Uses NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from build args
// In Development: Uses NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from .env.local
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  console.error("Stripe configuration error: No publishable key found");
  console.error(
    "Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your environment"
  );
  throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not defined");
}

// Initialize Stripe
export const stripePromise = loadStripe(stripePublishableKey);

export const getStripeOptions = () => {
  return {
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#3b82f6",
        colorDanger: "#ef4444",
        colorSuccess: "#10b981",
        colorWarning: "#f59e0b",
        fontFamily: "system-ui, sans-serif",
        spacingUnit: "4px",
        borderRadius: "8px",
      },
    },
    loader: "auto" as const,
  };
};

// Legacy export for backward compatibility
export const stripeOptions = getStripeOptions();
