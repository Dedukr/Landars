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

// Function to detect if dark mode is active
const isDarkMode = () => {
  if (typeof window === "undefined") return false;

  // Check for dark mode class on html element
  const htmlElement = document.documentElement;
  return (
    htmlElement.classList.contains("dark") ||
    htmlElement.getAttribute("data-theme") === "dark" ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

// Dynamic Stripe configuration options based on theme
export const getStripeOptions = () => {
  const darkMode = isDarkMode();

  return {
    appearance: {
      theme: darkMode ? ("night" as const) : ("stripe" as const),
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
