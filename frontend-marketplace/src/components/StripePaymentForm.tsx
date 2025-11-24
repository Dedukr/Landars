"use client";

import React, { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/Button";

interface StripePaymentFormProps {
  onPaymentSuccess: (paymentIntent: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  }) => void;
  onPaymentError: (error: string) => void;
  totalAmount: number;
  isProcessing?: boolean;
  billingDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      postal_code?: string;
      country?: string;
    };
  };
  onValidationRequired?: () => boolean;
}

export default function StripePaymentForm({
  onPaymentSuccess,
  onPaymentError,
  totalAmount,
  isProcessing = false,
  billingDetails,
  onValidationRequired,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    // Validate shipping form before processing payment
    if (onValidationRequired && !onValidationRequired()) {
      setError("Please complete all required fields before proceeding with payment.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment(
        {
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/orders`,
          },
          redirect: "if_required",
        }
      );

      if (stripeError) {
        setError(stripeError.message || "Payment failed. Please try again.");
        onPaymentError(
          stripeError.message || "Payment failed. Please try again."
        );
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        onPaymentSuccess(paymentIntent);
      } else {
        setError("Payment was not completed. Please try again.");
        onPaymentError("Payment was not completed. Please try again.");
      }
    } catch (err) {
      console.error("Payment error:", err);
      const errorMessage = "An unexpected error occurred. Please try again.";
      setError(errorMessage);
      onPaymentError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Payment Method */}
      <div>
        <h3
          className="text-lg font-medium mb-4"
          style={{ color: "var(--foreground)" }}
        >
          Payment Method
        </h3>
        <PaymentElement
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card", "klarna", "afterpay_clearpay"],
            defaultValues: billingDetails ? { billingDetails } : undefined,
          }}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div
          className="p-4 rounded-md"
          style={{
            background: "var(--destructive-bg)",
            border: "1px solid var(--destructive-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={isLoading || isProcessing}
        disabled={!stripe || !elements || isLoading || isProcessing}
      >
        {isLoading || isProcessing
          ? "Processing Payment..."
          : `Pay £${totalAmount.toFixed(2)}`}
      </Button>

      {/* Security Notice */}
      <div
        className="text-xs text-center"
        style={{ color: "var(--foreground)", opacity: 0.7 }}
      >
        Your payment information is secure and encrypted. We never store your
        card details.
      </div>
    </form>
  );
}
