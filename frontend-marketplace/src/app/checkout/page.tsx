"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { httpClient } from "@/utils/httpClient";
import { useCartOptimized } from "@/hooks/useCartOptimized";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";
import DeliveryFeeInfo from "@/components/DeliveryFeeInfo";
import LoadingSpinner from "@/components/LoadingSpinner";

interface ShippingFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address_line: string;
  address_line2: string;
  city: string;
  postal_code: string;
  delivery_date: string;
  notes: string;
}

interface PaymentFormData {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName: string;
  savePayment: boolean;
}

interface ProfileData {
  user: {
    id: number;
    name: string;
    email: string;
  };
  profile: {
    phone: string;
  } | null;
  address: {
    address_line: string;
    address_line2: string;
    city: string;
    postal_code: string;
  } | null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { cart } = useCart();
  const {
    products,
    loading: productsLoading,
    stats,
    clearCart,
  } = useCartOptimized();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !token) {
      router.push("/auth");
    }
  }, [user, token, router]);

  // Redirect if cart is empty
  useEffect(() => {
    if (cart.length === 0 && !productsLoading) {
      router.push("/cart");
    }
  }, [cart.length, productsLoading, router]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [, setProfileData] = useState<ProfileData | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form states
  const [shippingForm, setShippingForm] = useState<ShippingFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address_line: "",
    address_line2: "",
    city: "",
    postal_code: "",
    delivery_date: "",
    notes: "",
  });

  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: "",
    savePayment: false,
  });

  // Convert products to CartProduct format for delivery fee calculation
  const cartProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: parseFloat(product.price),
    categories: product.categories || [],
    quantity: cart.find((item) => item.productId === product.id)?.quantity || 0,
  }));

  // Dynamic delivery fee calculation
  const {
    deliveryCalculation,
    deliveryBreakdown,
    totalPrice: calculatedTotal,
  } = useDeliveryFee({
    products: cartProducts,
    subtotal: stats.subtotal,
    discount: 0, // No discount applied yet
  });

  // Fetch user profile data
  const fetchProfileData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await httpClient.get<ProfileData>("/api/auth/profile/");
      setProfileData(data);

      // Pre-populate form with existing data
      const nameParts = data.user.name.split(" ");
      setShippingForm({
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: data.user.email || "",
        phone: data.profile?.phone || "",
        address_line: data.address?.address_line || "",
        address_line2: data.address?.address_line2 || "",
        city: data.address?.city || "",
        postal_code: data.address?.postal_code || "",
        delivery_date: "",
        notes: "",
      });
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Shipping validation
    if (!shippingForm.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }
    if (!shippingForm.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }
    if (!shippingForm.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingForm.email)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!shippingForm.phone.trim()) {
      newErrors.phone = "Phone number is required";
    }
    if (!shippingForm.address_line.trim()) {
      newErrors.address_line = "Address is required";
    }
    if (!shippingForm.city.trim()) {
      newErrors.city = "City is required";
    }
    if (!shippingForm.postal_code.trim()) {
      newErrors.postal_code = "Postal code is required";
    }
    if (!shippingForm.delivery_date) {
      newErrors.delivery_date = "Delivery date is required";
    } else {
      const selectedDate = new Date(shippingForm.delivery_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        newErrors.delivery_date = "Delivery date cannot be in the past";
      }
    }

    // Payment validation
    if (!paymentForm.cardNumber.trim()) {
      newErrors.cardNumber = "Card number is required";
    } else if (
      !/^\d{4}\s?\d{4}\s?\d{4}\s?\d{4}$/.test(
        paymentForm.cardNumber.replace(/\s/g, "")
      )
    ) {
      newErrors.cardNumber = "Please enter a valid card number";
    }
    if (!paymentForm.expiryDate.trim()) {
      newErrors.expiryDate = "Expiry date is required";
    } else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(paymentForm.expiryDate)) {
      newErrors.expiryDate = "Please enter a valid expiry date (MM/YY)";
    }
    if (!paymentForm.cvv.trim()) {
      newErrors.cvv = "CVV is required";
    } else if (!/^\d{3,4}$/.test(paymentForm.cvv)) {
      newErrors.cvv = "Please enter a valid CVV";
    }
    if (!paymentForm.cardholderName.trim()) {
      newErrors.cardholderName = "Cardholder name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    const formatted = cleaned.replace(/(\d{4})(?=\d)/g, "$1 ");
    return formatted.slice(0, 19); // Max 16 digits + 3 spaces
  };

  // Format expiry date
  const formatExpiryDate = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + "/" + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      // Save payment method if checkbox is checked
      if (paymentForm.savePayment) {
        try {
          const paymentData = {
            card_number: paymentForm.cardNumber.replace(/\s/g, ""), // Remove spaces
            expiry_month: parseInt(paymentForm.expiryDate.split("/")[0]),
            expiry_year: parseInt("20" + paymentForm.expiryDate.split("/")[1]), // Convert YY to 20YY
            cvv: paymentForm.cvv,
            cardholder_name: paymentForm.cardholderName,
            is_default: true, // This will be the default payment method
          };

          await httpClient.post("/api/auth/payment-methods/", paymentData);
          console.log("Payment method saved successfully");
        } catch (paymentError) {
          console.error("Failed to save payment method:", paymentError);
          // Don't block the order if payment saving fails
        }
      }

      // Create order
      const orderData = {
        notes: shippingForm.notes,
        delivery_date: shippingForm.delivery_date,
        discount: 0,
      };

      const order = await httpClient.post<{ id: number }>(
        "/api/orders/",
        orderData
      );

      // Clear cart
      clearCart();

      // Redirect to order confirmation
      router.push(`/orders/${order.id}`);
    } catch (error) {
      console.error("Order creation failed:", error);
      setErrors({ submit: "Failed to create order. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || productsLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  if (cart.length === 0) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Checkout
          </h1>
          <p
            className="mt-2"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Complete your order securely
          </p>
        </div>

        {/* Checkout Progress */}
        <CheckoutProgress
          currentStep={2}
          steps={["Cart", "Shipping & Payment", "Review"]}
        />

        <form
          onSubmit={handleSubmit}
          className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start"
        >
          {/* Shipping & Payment Forms */}
          <div className="lg:col-span-8 space-y-8">
            {/* Shipping Information */}
            <div
              className="rounded-lg shadow-sm p-6"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Shipping Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="First Name *"
                  value={shippingForm.firstName}
                  onChange={(e) =>
                    setShippingForm({
                      ...shippingForm,
                      firstName: e.target.value,
                    })
                  }
                  error={errors.firstName}
                  fullWidth
                />
                <Input
                  label="Last Name *"
                  value={shippingForm.lastName}
                  onChange={(e) =>
                    setShippingForm({
                      ...shippingForm,
                      lastName: e.target.value,
                    })
                  }
                  error={errors.lastName}
                  fullWidth
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Input
                  label="Email Address *"
                  type="email"
                  value={shippingForm.email}
                  onChange={(e) =>
                    setShippingForm({ ...shippingForm, email: e.target.value })
                  }
                  error={errors.email}
                  fullWidth
                />
                <Input
                  label="Phone Number *"
                  type="tel"
                  value={shippingForm.phone}
                  onChange={(e) =>
                    setShippingForm({ ...shippingForm, phone: e.target.value })
                  }
                  error={errors.phone}
                  fullWidth
                />
              </div>

              <div className="mt-6">
                <Input
                  label="Address Line 1 *"
                  value={shippingForm.address_line}
                  onChange={(e) =>
                    setShippingForm({
                      ...shippingForm,
                      address_line: e.target.value,
                    })
                  }
                  error={errors.address_line}
                  fullWidth
                />
              </div>

              <div className="mt-6">
                <Input
                  label="Address Line 2"
                  value={shippingForm.address_line2}
                  onChange={(e) =>
                    setShippingForm({
                      ...shippingForm,
                      address_line2: e.target.value,
                    })
                  }
                  fullWidth
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Input
                  label="City *"
                  value={shippingForm.city}
                  onChange={(e) =>
                    setShippingForm({ ...shippingForm, city: e.target.value })
                  }
                  error={errors.city}
                  fullWidth
                />
                <Input
                  label="Postal Code *"
                  value={shippingForm.postal_code}
                  onChange={(e) =>
                    setShippingForm({
                      ...shippingForm,
                      postal_code: e.target.value,
                    })
                  }
                  error={errors.postal_code}
                  fullWidth
                />
              </div>

              <div className="mt-6">
                <Input
                  label="Delivery Date *"
                  type="date"
                  value={shippingForm.delivery_date}
                  onChange={(e) =>
                    setShippingForm({
                      ...shippingForm,
                      delivery_date: e.target.value,
                    })
                  }
                  error={errors.delivery_date}
                  min={new Date().toISOString().split("T")[0]}
                  fullWidth
                />
              </div>

              <div className="mt-6">
                <Textarea
                  label="Delivery Notes (Optional)"
                  value={shippingForm.notes}
                  onChange={(e) =>
                    setShippingForm({ ...shippingForm, notes: e.target.value })
                  }
                  placeholder="Any special instructions for delivery..."
                  fullWidth
                />
              </div>
            </div>

            {/* Payment Information */}
            <div
              className="rounded-lg shadow-sm p-6"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Payment Information
              </h2>

              {/* Trust Signals */}
              <div
                className="flex items-center justify-center space-x-6 mb-6 p-4 rounded-lg"
                style={{ background: "var(--info-bg)" }}
              >
                <div className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ color: "var(--success)" }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--info-text)" }}
                  >
                    SSL Secured
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ color: "var(--success)" }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--info-text)" }}
                  >
                    PCI Compliant
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ color: "var(--success)" }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--info-text)" }}
                  >
                    256-bit Encryption
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                <Input
                  label="Card Number *"
                  value={paymentForm.cardNumber}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      cardNumber: formatCardNumber(e.target.value),
                    })
                  }
                  error={errors.cardNumber}
                  placeholder="1234 5678 9012 3456"
                  fullWidth
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input
                    label="Expiry Date *"
                    value={paymentForm.expiryDate}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        expiryDate: formatExpiryDate(e.target.value),
                      })
                    }
                    error={errors.expiryDate}
                    placeholder="MM/YY"
                    fullWidth
                  />
                  <Input
                    label="CVV *"
                    value={paymentForm.cvv}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, cvv: e.target.value })
                    }
                    error={errors.cvv}
                    placeholder="123"
                    type="password"
                    fullWidth
                  />
                </div>

                <Input
                  label="Cardholder Name *"
                  value={paymentForm.cardholderName}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      cardholderName: e.target.value,
                    })
                  }
                  error={errors.cardholderName}
                  fullWidth
                />

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="savePayment"
                    checked={paymentForm.savePayment}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        savePayment: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300"
                  />
                  <label
                    htmlFor="savePayment"
                    className="text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    Save payment method for future purchases
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="mt-8 lg:mt-0 lg:col-span-4">
            <div
              className="rounded-lg shadow-sm sticky top-8"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <div
                className="px-6 py-4"
                style={{ borderBottom: "1px solid var(--sidebar-border)" }}
              >
                <h2
                  className="text-lg font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Order Summary
                </h2>
              </div>

              <div className="p-6 space-y-4">
                {/* Delivery Type Information */}
                <div
                  className="p-3 rounded-md"
                  style={{
                    background: "var(--info-bg)",
                    border: "1px solid var(--info-border)",
                  }}
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-lg mr-2">
                        {deliveryCalculation.isHomeDelivery ? "🏠" : "📦"}
                      </span>
                    </div>
                    <div>
                      <h4
                        className="text-sm font-medium"
                        style={{ color: "var(--info-text)" }}
                      >
                        {deliveryBreakdown.type}
                      </h4>
                      <p
                        className="text-sm"
                        style={{ color: "var(--info-text)", opacity: 0.8 }}
                      >
                        {deliveryBreakdown.reasoning}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Delivery Fee Information */}
                <DeliveryFeeInfo />

                {/* Order Summary */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                      Subtotal ({stats.totalItems} items)
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      £{stats.subtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                      Delivery Fee
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      {deliveryBreakdown.isFree
                        ? "Free"
                        : `£${deliveryCalculation.deliveryFee.toFixed(2)}`}
                    </span>
                  </div>

                  {deliveryCalculation.deliveryFee > 0 && (
                    <div
                      className="text-xs"
                      style={{ color: "var(--foreground)", opacity: 0.6 }}
                    >
                      {deliveryBreakdown.reasoning}
                      {deliveryBreakdown.hasSausages && (
                        <span>
                          {" "}
                          • Weight: {deliveryBreakdown.weight.toFixed(1)}kg
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    className="pt-3"
                    style={{ borderTop: "1px solid var(--sidebar-border)" }}
                  >
                    <div className="flex justify-between text-lg font-semibold">
                      <span style={{ color: "var(--foreground)" }}>Total</span>
                      <span style={{ color: "var(--foreground)" }}>
                        £{calculatedTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trust Signals */}
                <div
                  className="pt-4"
                  style={{ borderTop: "1px solid var(--sidebar-border)" }}
                >
                  <div
                    className="flex items-center space-x-4 text-sm"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    <div className="flex items-center">
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Secure checkout
                    </div>
                    <div className="flex items-center">
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      30-day returns
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  {errors.submit && (
                    <div
                      className="mb-4 p-3 rounded-md"
                      style={{
                        background: "var(--destructive-bg)",
                        border: "1px solid var(--destructive-border)",
                      }}
                    >
                      <p
                        className="text-sm"
                        style={{ color: "var(--destructive)" }}
                      >
                        {errors.submit}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    disabled={submitting}
                  >
                    {submitting
                      ? "Processing..."
                      : `Complete Order - £${calculatedTotal.toFixed(2)}`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
