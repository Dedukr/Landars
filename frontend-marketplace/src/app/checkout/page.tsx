"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { httpClient } from "@/utils/httpClient";
import DeliveryFeeInfo from "@/components/DeliveryFeeInfo";
import LoadingSpinner from "@/components/LoadingSpinner";
import StripeProvider from "@/components/StripeProvider";
import StripePaymentForm from "@/components/StripePaymentForm";
import { Button } from "@/components/ui/Button";
import OrderReviewItem from "@/components/OrderReviewItem";
import DiscountDisplay from "@/components/cart/DiscountDisplay";
import DeliveryFeeDisplay from "@/components/cart/DeliveryFeeDisplay";
import SubtotalDisplay from "@/components/cart/SubtotalDisplay";
import TotalDisplay from "@/components/cart/TotalDisplay";
import ShippingOptions from "@/components/ShippingOptions";
import {
  useShippingOptions,
  type ShippingOption,
} from "@/hooks/useShippingOptions";

interface ShippingFormData {
  email: string;
  phone: string;
  address_line: string;
  address_line2: string;
  city: string;
  postal_code: string;
  notes: string;
  saveShippingInfo: boolean;
}

// Payment form data is now handled by Stripe Elements

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

interface OrderItem {
  id: number;
  product?: {
    id: number;
    name: string;
    price: string;
    image_url?: string | null;
    description?: string;
  };
  product_name?: string;
  product_price?: string;
  product_image_url?: string | null;
  quantity: number;
  total_price?: string;
  get_total_price?: string;
}

interface CartData {
  id: number;
  items: Array<{
    id: number;
    product: number;
    product_name: string;
    product_price: string;
    quantity: string;
    total_price: string;
    added_date: string;
  }>;
  notes?: string;
  delivery_date?: string | null;
  is_home_delivery?: boolean;
  delivery_fee?: string;
  discount?: string;
  sum_price?: string;
  total_price?: string;
  total_items?: number;
  created_at?: string;
  updated_at?: string;
}

interface OrderDetails {
  id: number;
  customer?: {
    id: number;
    name: string;
    email: string;
  };
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  notes?: string;
  delivery_date?: string | null;
  is_home_delivery?: boolean;
  delivery_fee?: string;
  discount?: string;
  order_date?: string;
  status?: string;
  invoice_link?: string;
  items?: OrderItem[];
  sum_price?: string;
  total_price?: string;
  total_items?: number;
  paymentIntent?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  };
  shippingInfo?: {
    email: string;
    phone: string;
    address_line: string;
    address_line2: string;
    city: string;
    postal_code: string;
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { cart, clearCart } = useCart();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !token) {
      router.push("/auth");
    }
  }, [user, token, router]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [, setProfileData] = useState<ProfileData | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutStep] = useState<1 | 2 | 3>(2); // 1=Cart, 2=Shipping & Payment, 3=Review
  const [orderDetails] = useState<OrderDetails | null>(null);
  const [cartData, setCartData] = useState<CartData | null>(null);

  // Shipping options state
  const {
    options: shippingOptions,
    loading: shippingOptionsLoading,
    error: shippingOptionsError,
    fetchShippingOptions,
  } = useShippingOptions();
  const [selectedShippingOption, setSelectedShippingOption] =
    useState<ShippingOption | null>(null);

  // Redirect if cart is empty (but not if we're showing order review)
  useEffect(() => {
    if (
      cart.length === 0 &&
      checkoutStep !== 3 &&
      !orderDetails &&
      !orderCompleted
    ) {
      router.push("/cart");
    }
  }, [cart.length, router, checkoutStep, orderDetails, orderCompleted]);

  // Form states
  const [shippingForm, setShippingForm] = useState<ShippingFormData>({
    email: "",
    phone: "",
    address_line: "",
    address_line2: "",
    city: "",
    postal_code: "",
    notes: "",
    saveShippingInfo: false,
  });

  // Payment form is now handled by Stripe Elements

  // Fetch cart data with metadata
  const fetchCartData = useCallback(async () => {
    if (!user) return;

    try {
      const data = await httpClient.get<CartData>("/api/cart/");
      setCartData(data);

      // Pre-populate notes from cart if available
      if (data.notes && !shippingForm.notes) {
        setShippingForm((prev) => ({
          ...prev,
          notes: data.notes || "",
        }));
      }
    } catch (error) {
      console.error("Failed to fetch cart data:", error);
    }
  }, [user, shippingForm.notes]);

  // Fetch cart data when component mounts and user is available
  useEffect(() => {
    if (user) {
      fetchCartData();
    }
  }, [user, fetchCartData]);

  // Save/update all cart information when entering checkout
  // This ensures cart metadata is synced before order creation
  useEffect(() => {
    if (user && cartData && checkoutStep === 2 && cart.length > 0) {
      const updateCartInfo = async () => {
        try {
          const updates: {
            recalculate_delivery?: boolean;
            delivery_fee?: string;
            notes?: string;
          } = {};
          let needsUpdate = false;

          // Calculate and save delivery fee
          if (cartData.is_home_delivery) {
            // For home delivery, use backend calculation
            const currentDeliveryFee = cartData.delivery_fee
              ? parseFloat(cartData.delivery_fee)
              : 0;
            if (!cartData.delivery_fee || currentDeliveryFee === 0) {
              updates.recalculate_delivery = true;
              needsUpdate = true;
            }
          } else {
            // For post delivery, use API price from shipping options
            // If shipping options are available, use the first one's price
            // Otherwise, keep the existing fee
            if (shippingOptions.length > 0) {
              const apiPrice = parseFloat(shippingOptions[0].price);
              const currentDeliveryFee = cartData.delivery_fee
                ? parseFloat(cartData.delivery_fee)
                : 0;

              // Update if fee doesn't match API price
              if (Math.abs(currentDeliveryFee - apiPrice) > 0.01) {
                updates.delivery_fee = apiPrice.toString();
                needsUpdate = true;
              }
            }
            // If no shipping options available yet, don't update (will be set when options load)
          }

          // Ensure notes are saved (if they exist in shipping form but not in cart)
          if (shippingForm.notes && shippingForm.notes !== cartData.notes) {
            updates.notes = shippingForm.notes;
            needsUpdate = true;
          }

          // Update cart if any changes are needed
          if (needsUpdate) {
            await httpClient.put("/api/cart/", updates);
            await fetchCartData();
          }
        } catch (error) {
          console.error("Failed to update cart information:", error);
        }
      };

      updateCartInfo();
    }
  }, [
    user,
    cartData,
    checkoutStep,
    cart.length,
    shippingForm.notes,
    fetchCartData,
    shippingOptions,
  ]);

  // All values come from cart model - single source of truth
  const cartSubtotal = cartData?.sum_price ? parseFloat(cartData.sum_price) : 0;
  const cartDiscount = cartData?.discount ? parseFloat(cartData.discount) : 0;
  const cartDeliveryFee = cartData?.delivery_fee
    ? parseFloat(cartData.delivery_fee)
    : 0;
  const cartIsHomeDelivery = cartData?.is_home_delivery ?? true;
  const cartTotal = cartData?.total_price
    ? parseFloat(cartData.total_price)
    : 0;
  const cartTotalWeight =
    cartData?.items?.reduce(
      (sum, item) => sum + (parseFloat(item.quantity) || 0),
      0
    ) || 0;
  const isOverweightSausageOrder = !cartIsHomeDelivery && cartTotalWeight > 20;

  // Calculate delivery fee - use API price from selected shipping option, or first available option
  const getDeliveryFeeFromAPI = (): number => {
    if (cartIsHomeDelivery) {
      return cartDeliveryFee;
    }

    if (isOverweightSausageOrder) {
      return 0;
    }

    // For post delivery, use price from selected shipping option
    if (selectedShippingOption) {
      return parseFloat(selectedShippingOption.price);
    }

    // If no option selected yet, use first available option's price (if available)
    if (shippingOptions.length > 0) {
      return parseFloat(shippingOptions[0].price);
    }

    // Fallback to cart fee if no shipping options available
    return cartDeliveryFee;
  };

  const apiDeliveryFee = getDeliveryFeeFromAPI();

  // Helper function to get delivery fee reasoning (simplified for display)
  const getDeliveryFeeReasoning = () => {
    if (isOverweightSausageOrder) {
      return "We can ship sausage orders up to 20kg. Please split your order or contact us for assistance.";
    }
    if (cartDeliveryFee === 0) {
      return "Free delivery";
    }
    if (cartIsHomeDelivery) {
      return "Standard home delivery fee";
    }
    // Post delivery - show API price
    if (selectedShippingOption) {
      return `Royal Mail shipping: £${parseFloat(
        selectedShippingOption.price
      ).toFixed(2)}`;
    }
    if (shippingOptions.length > 0) {
      return `Royal Mail shipping: £${parseFloat(
        shippingOptions[0].price
      ).toFixed(2)}`;
    }
    return "Depends on courier";
  };

  // Calculate display delivery fee - use API price for post delivery, otherwise cart fee
  const displayDeliveryFee = !cartIsHomeDelivery
    ? apiDeliveryFee
    : cartDeliveryFee;

  // Calculate display total - use API delivery fee in calculation
  const displayTotal = !cartIsHomeDelivery
    ? cartSubtotal + apiDeliveryFee - cartDiscount
    : cartTotal;

  const deliveryDisplayProps = {
    deliveryFee: displayDeliveryFee,
    isFree: displayDeliveryFee === 0 && cartIsHomeDelivery,
    reasoning: getDeliveryFeeReasoning(),
    hasSausages: !cartIsHomeDelivery,
    weight: cartTotalWeight,
    dependsOnCourier:
      (!cartIsHomeDelivery && shippingOptions.length === 0) ||
      isOverweightSausageOrder, // Depends on courier if no options loaded yet or overweight
    overweight: isOverweightSausageOrder,
  };

  // Fetch user profile data
  const fetchProfileData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await httpClient.get<ProfileData>("/api/auth/profile/");
      setProfileData(data);

      // Pre-populate form with existing data
      setShippingForm({
        email: data.user.email || "",
        phone: data.profile?.phone || "",
        address_line: data.address?.address_line || "",
        address_line2: data.address?.address_line2 || "",
        city: data.address?.city || "",
        postal_code: data.address?.postal_code || "",
        notes: "",
        saveShippingInfo: false,
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

  // Update cart notes when user changes them
  const updateCartNotes = useCallback(
    async (notes: string) => {
      if (!user) return;

      try {
        await httpClient.put("/api/cart/", {
          notes: notes,
        });
        // Refetch cart data to get updated values
        await fetchCartData();
      } catch (error) {
        console.error("Failed to update cart notes:", error);
      }
    },
    [user, fetchCartData]
  );

  // Update notes in cart when shipping form notes change (debounced)
  useEffect(() => {
    if (!user || !cartData) return;

    const timeoutId = setTimeout(() => {
      if (shippingForm.notes !== cartData.notes) {
        updateCartNotes(shippingForm.notes);
      }
    }, 500); // Debounce by 500ms

    return () => clearTimeout(timeoutId);
  }, [shippingForm.notes, user, cartData, updateCartNotes]);

  // Fetch shipping options when address is complete
  useEffect(() => {
    // Check if required address fields are filled
    const hasCompleteAddress =
      shippingForm.address_line.trim() &&
      shippingForm.city.trim() &&
      shippingForm.postal_code.trim();

    if (hasCompleteAddress && cartData && cartData.items.length > 0) {
      // Debounce the fetch
      const timeoutId = setTimeout(() => {
        fetchShippingOptions(
          {
            country: "GB", // Default to UK for now
            postal_code: shippingForm.postal_code,
            city: shippingForm.city,
            address_line: shippingForm.address_line,
          },
          cartData.items.map((item) => ({
            product_id: item.product,
            quantity: item.quantity,
          }))
        );
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [
    shippingForm.address_line,
    shippingForm.city,
    shippingForm.postal_code,
    cartData,
    fetchShippingOptions,
  ]);

  // Handle shipping option selection
  const handleSelectShippingOption = useCallback(
    async (optionId: number) => {
      const option = shippingOptions.find((opt) => opt.id === optionId);
      if (option) {
        setSelectedShippingOption(option);

        // Update cart delivery_fee to the API price from selected shipping option
        if (!cartIsHomeDelivery && user) {
          try {
            const apiPrice = parseFloat(option.price);
            await httpClient.put("/api/cart/", {
              delivery_fee: apiPrice.toString(),
            });
            // Refetch cart data to get updated values
            await fetchCartData();
          } catch (error) {
            console.error("Failed to update delivery fee:", error);
          }
        }
      }
    },
    [shippingOptions, cartIsHomeDelivery, user, fetchCartData]
  );

  // Create payment intent when component mounts - using cart total
  const createPaymentIntent = useCallback(async () => {
    // Use displayTotal for payment intent (includes shipping price if selected)
    const totalForPayment = displayTotal > 0 ? displayTotal : cartTotal;
    if (!user || totalForPayment <= 0) return;

    try {
      const response = await httpClient.post<{
        client_secret: string;
        payment_intent_id: string;
      }>("/api/payments/create-payment-intent/", {
        amount: Math.round(totalForPayment * 100), // Convert to cents
        currency: "gbp",
        metadata: {
          user_id: user.id.toString(),
          order_type: "food_delivery",
        },
      });

      setClientSecret(response.client_secret);
    } catch (error) {
      console.error("Failed to create payment intent:", error);
      setErrors({ payment: "Failed to initialize payment. Please try again." });
    }
  }, [user, cartTotal, displayTotal]);

  useEffect(() => {
    if (user && (displayTotal > 0 || cartTotal > 0) && cartData) {
      createPaymentIntent();
    }
  }, [user, cartTotal, displayTotal, cartData, createPaymentIntent]);

  // Form validation for shipping fields
  const validateShippingForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required field validation
    if (!shippingForm.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingForm.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!shippingForm.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (
      !/^[\+]?[0-9\s\-\(\)]{10,}$/.test(shippingForm.phone.replace(/\s/g, ""))
    ) {
      newErrors.phone = "Please enter a valid phone number";
    }

    if (!shippingForm.address_line.trim()) {
      newErrors.address_line = "Address line 1 is required";
    }

    if (!shippingForm.city.trim()) {
      newErrors.city = "City is required";
    }

    if (!shippingForm.postal_code.trim()) {
      newErrors.postal_code = "Postal code is required";
    } else if (
      !/^[A-Z]{1,2}[0-9]{1,2}[A-Z]?[0-9][A-Z]{2}$/i.test(
        shippingForm.postal_code.replace(/\s/g, "")
      )
    ) {
      newErrors.postal_code = "Please enter a valid UK postal code";
    }

    // Validate shipping option is selected
    if (!selectedShippingOption) {
      newErrors.shipping = "Please select a shipping option";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Card formatting is now handled by Stripe Elements

  // Handle payment success
  const handlePaymentSuccess = async (paymentIntent: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  }) => {
    setSubmitting(true);
    try {
      // Create order with payment intent ID and shipping info
      // If shipping option is selected, use its price as delivery_fee
      const orderData: {
        notes: string;
        discount: string;
        is_home_delivery: boolean;
        payment_intent_id: string;
        payment_status: string;
        address: {
          address_line: string;
          address_line2: string;
          city: string;
          postal_code: string;
          country: string;
        };
        delivery_fee: string;
        shipping_method_id?: number;
        shipping_carrier?: string;
        shipping_service_name?: string;
        shipping_cost?: string;
      } = {
        notes: cartData?.notes || shippingForm.notes,
        discount: cartData?.discount || "0",
        delivery_fee:
          selectedShippingOption?.price || cartData?.delivery_fee || "0",
        is_home_delivery: cartData?.is_home_delivery ?? true,
        payment_intent_id: paymentIntent.id,
        payment_status: "paid",
        address: {
          address_line: shippingForm.address_line,
          address_line2: shippingForm.address_line2,
          city: shippingForm.city,
          postal_code: shippingForm.postal_code,
          country: "GB", // Default to UK
        },
      };

      // If shipping option is selected, add shipping metadata
      if (selectedShippingOption?.price) {
        orderData.shipping_method_id = selectedShippingOption.id;
        orderData.shipping_carrier = selectedShippingOption.carrier;
        orderData.shipping_service_name = selectedShippingOption.name;
        orderData.shipping_cost = selectedShippingOption.price;
      }

      const order = await httpClient.post<{ id: number }>(
        "/api/orders/",
        orderData
      );

      setOrderCompleted(true);

      // Save shipping information if checkbox is checked
      if (shippingForm.saveShippingInfo) {
        try {
          await httpClient.put("/api/auth/profile/update/", {
            email: shippingForm.email,
            phone: shippingForm.phone,
            address: {
              address_line: shippingForm.address_line,
              address_line2: shippingForm.address_line2,
              city: shippingForm.city,
              postal_code: shippingForm.postal_code,
              country: "GB",
            },
          });
        } catch (profileError) {
          console.error("Failed to save shipping information:", profileError);
          // Don't block the order if profile saving fails
        }
      }

      // Clear cart context (backend already deleted the cart instance)
      clearCart();

      // Redirect to order detail page for successful confirmation
      router.push(`/orders/${order.id}`);
    } catch (error) {
      console.error("Order creation failed:", error);
      setErrors({
        submit:
          "Payment succeeded but order creation failed. Please contact support.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle payment error
  const handlePaymentError = (error: string) => {
    setErrors({ payment: error });
  };

  // No outer form submit; payment handled by StripePaymentForm

  if (loading || !cartData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  // Don't redirect if we're showing the review step with order details
  if (cart.length === 0 && checkoutStep !== 3 && !orderDetails) {
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
          currentStep={checkoutStep}
          steps={["Cart", "Shipping & Payment", "Review"]}
        />

        {checkoutStep === 2 ? (
          <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
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
                    label="Email Address *"
                    type="email"
                    value={shippingForm.email}
                    onChange={(e) =>
                      setShippingForm({
                        ...shippingForm,
                        email: e.target.value,
                      })
                    }
                    error={errors.email}
                    fullWidth
                  />
                  <Input
                    label="Phone Number *"
                    type="tel"
                    value={shippingForm.phone}
                    onChange={(e) =>
                      setShippingForm({
                        ...shippingForm,
                        phone: e.target.value,
                      })
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
                  <Textarea
                    label="Delivery Notes (Optional)"
                    value={shippingForm.notes}
                    onChange={(e) =>
                      setShippingForm({
                        ...shippingForm,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Any special instructions for delivery..."
                    fullWidth
                  />
                </div>

                <div className="mt-6">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={shippingForm.saveShippingInfo}
                      onChange={(e) =>
                        setShippingForm({
                          ...shippingForm,
                          saveShippingInfo: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      Save shipping information for future purchases
                    </span>
                  </label>
                </div>
              </div>

              {/* Shipping Options */}
              <ShippingOptions
                options={shippingOptions}
                selectedOptionId={selectedShippingOption?.id || null}
                onSelectOption={handleSelectShippingOption}
                loading={shippingOptionsLoading}
                error={shippingOptionsError}
              />

              {/* Validation Error for Shipping */}
              {errors.shipping && (
                <div
                  className="rounded-lg shadow-sm p-4"
                  style={{
                    background: "var(--destructive-bg)",
                    border: "1px solid var(--destructive-border)",
                  }}
                >
                  <p
                    className="text-sm"
                    style={{ color: "var(--destructive)" }}
                  >
                    {errors.shipping}
                  </p>
                </div>
              )}

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

                {clientSecret ? (
                  <StripeProvider clientSecret={clientSecret}>
                    <StripePaymentForm
                      onPaymentSuccess={handlePaymentSuccess}
                      onPaymentError={handlePaymentError}
                      totalAmount={displayTotal}
                      isProcessing={submitting}
                      onValidationRequired={validateShippingForm}
                      billingDetails={{
                        name: user?.name || "",
                        email: shippingForm.email,
                        phone: shippingForm.phone,
                        address: {
                          line1: shippingForm.address_line,
                          line2: shippingForm.address_line2,
                          city: shippingForm.city,
                          postal_code: shippingForm.postal_code,
                        },
                      }}
                    />
                  </StripeProvider>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner />
                    <span
                      className="ml-3"
                      style={{ color: "var(--foreground)" }}
                    >
                      Initializing secure payment...
                    </span>
                  </div>
                )}

                {errors.payment && (
                  <div
                    className="mt-4 p-3 rounded-md"
                    style={{
                      background: "var(--destructive-bg)",
                      border: "1px solid var(--destructive-border)",
                    }}
                  >
                    <p
                      className="text-sm"
                      style={{ color: "var(--destructive)" }}
                    >
                      {errors.payment}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary */}
            <div className="mt-8 lg:mt-0 lg:col-span-4">
              <div
                className="rounded-lg shadow-sm"
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
                  {!cartIsHomeDelivery && (
                    <div
                      className="p-3 rounded-md"
                      style={{
                        background: "var(--info-bg)",
                        border: "1px solid var(--info-border)",
                      }}
                    >
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <span className="text-lg mr-2">📦</span>
                        </div>
                        <div>
                          <h4
                            className="text-sm font-medium"
                            style={{ color: "var(--info-text)" }}
                          >
                            Post Delivery
                          </h4>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Delivery Fee Information */}
                  <DeliveryFeeInfo />

                  {/* Order Summary - mirror cart view */}
                  <div className="space-y-3">
                    <SubtotalDisplay subtotal={cartSubtotal} />
                    <DeliveryFeeDisplay {...deliveryDisplayProps} />
                    <DiscountDisplay discount={cartDiscount} />
                    <TotalDisplay total={displayTotal} />
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
                        VAT included
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : checkoutStep === 3 && orderDetails ? (
          /* Review Section */
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Success Message */}
            <div
              className="p-6 rounded-lg"
              style={{
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
              }}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="w-10 h-10"
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
                </div>
                <div className="ml-4">
                  <h3
                    className="text-2xl font-bold"
                    style={{ color: "var(--success-text)" }}
                  >
                    Order Placed Successfully!
                  </h3>
                  <p
                    className="mt-1 text-base"
                    style={{ color: "var(--success-text)", opacity: 0.9 }}
                  >
                    Thank you for your order #{orderDetails.id}. We&apos;ll send
                    you a confirmation email shortly.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Order Items */}
                <div
                  className="rounded-lg shadow-sm overflow-hidden"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <div
                    className="px-6 py-4"
                    style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                  >
                    <div className="flex items-center justify-between">
                      <h2
                        className="text-lg font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        Order Items (
                        {orderDetails.total_items ||
                          orderDetails.items?.length ||
                          0}{" "}
                        items)
                      </h2>
                      <p
                        className="text-sm"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Order #{orderDetails.id}
                      </p>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
                    {orderDetails.items?.map((item) => {
                      // Format price - ensure it's always formatted with 2 decimals
                      const productPrice =
                        item.product_price || item.product?.price || "0.00";
                      const totalPrice =
                        item.total_price ||
                        item.get_total_price ||
                        (
                          parseFloat(productPrice) *
                          parseFloat(item.quantity.toString())
                        ).toFixed(2);

                      // Ensure totalPrice is formatted correctly
                      const formattedTotalPrice =
                        typeof totalPrice === "string"
                          ? parseFloat(totalPrice).toFixed(2)
                          : Number(totalPrice).toFixed(2);

                      return (
                        <OrderReviewItem
                          key={item.id}
                          product={{
                            id: item.product?.id || item.id,
                            name:
                              item.product_name ||
                              item.product?.name ||
                              "Product",
                            price: productPrice,
                            image_url:
                              item.product_image_url ||
                              item.product?.image_url ||
                              null,
                            description: item.product?.description,
                          }}
                          quantity={parseFloat(item.quantity.toString())}
                          totalPrice={formattedTotalPrice}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Customer Information */}
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
                    Customer Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Name
                      </p>
                      <p
                        className="text-base"
                        style={{ color: "var(--foreground)" }}
                      >
                        {orderDetails.customer?.name ||
                          orderDetails.customer_name ||
                          ""}
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Email
                      </p>
                      <p
                        className="text-base"
                        style={{ color: "var(--foreground)" }}
                      >
                        {orderDetails.shippingInfo?.email ||
                          orderDetails.customer?.email ||
                          ""}
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Phone
                      </p>
                      <p
                        className="text-base"
                        style={{ color: "var(--foreground)" }}
                      >
                        {orderDetails.shippingInfo?.phone ||
                          orderDetails.customer_phone ||
                          ""}
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Order Date
                      </p>
                      <p
                        className="text-base"
                        style={{ color: "var(--foreground)" }}
                      >
                        {orderDetails.order_date
                          ? new Date(
                              orderDetails.order_date
                            ).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : new Date().toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
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
                    Delivery Address
                  </h2>
                  <div className="space-y-2">
                    <p
                      className="text-base"
                      style={{ color: "var(--foreground)" }}
                    >
                      {orderDetails.customer?.name ||
                        orderDetails.customer_name ||
                        ""}
                    </p>
                    <p
                      className="text-base"
                      style={{ color: "var(--foreground)" }}
                    >
                      {orderDetails.shippingInfo?.address_line ||
                        orderDetails.customer_address}
                      {orderDetails.shippingInfo?.address_line2 && (
                        <>
                          <br />
                          {orderDetails.shippingInfo.address_line2}
                        </>
                      )}
                    </p>
                    <p
                      className="text-base"
                      style={{ color: "var(--foreground)" }}
                    >
                      {orderDetails.shippingInfo?.city}
                      {orderDetails.shippingInfo?.postal_code &&
                        `, ${orderDetails.shippingInfo.postal_code}`}
                    </p>
                  </div>

                  {orderDetails.delivery_date && (
                    <div
                      className="mt-6 pt-6 border-t"
                      style={{ borderColor: "var(--sidebar-border)" }}
                    >
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Estimated Delivery Date
                      </p>
                      <p
                        className="text-base"
                        style={{ color: "var(--foreground)" }}
                      >
                        {new Date(
                          orderDetails.delivery_date
                        ).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}

                  {orderDetails.notes && (
                    <div
                      className="mt-6 pt-6 border-t"
                      style={{ borderColor: "var(--sidebar-border)" }}
                    >
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Special Instructions
                      </p>
                      <p
                        className="text-base"
                        style={{ color: "var(--foreground)" }}
                      >
                        {orderDetails.notes}
                      </p>
                    </div>
                  )}
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
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Payment Method
                      </p>
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          style={{ color: "var(--primary)" }}
                        >
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                          <path
                            fillRule="evenodd"
                            d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <p
                          className="text-base font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          Card Payment (Stripe)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Payment Status
                      </p>
                      <span
                        className="px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          background: "var(--success-bg)",
                          color: "var(--success-text)",
                        }}
                      >
                        ✓ Paid
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Payment Intent ID
                      </p>
                      <p
                        className="text-xs font-mono"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        {orderDetails.paymentIntent?.id?.substring(0, 20)}...
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar - Order Summary & Actions */}
              <div className="lg:col-span-1">
                <div
                  className="rounded-lg shadow-sm p-6 sticky top-8"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <h2
                    className="text-lg font-semibold mb-6"
                    style={{ color: "var(--foreground)" }}
                  >
                    Order Summary
                  </h2>

                  <div className="space-y-4">
                    <DeliveryFeeInfo />
                    <div className="space-y-3">
                      <SubtotalDisplay subtotal={cartSubtotal} />
                      <DeliveryFeeDisplay {...deliveryDisplayProps} />
                      <DiscountDisplay discount={cartDiscount} />
                      <TotalDisplay total={displayTotal} />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 space-y-3">
                    <Button onClick={() => router.push("/")} fullWidth>
                      Continue Shopping
                    </Button>

                    <Button
                      onClick={() => router.push("/orders")}
                      variant="outline"
                      fullWidth
                    >
                      View All Orders
                    </Button>

                    {orderDetails.invoice_link && (
                      <Button
                        onClick={() =>
                          window.open(orderDetails.invoice_link, "_blank")
                        }
                        variant="ghost"
                        fullWidth
                      >
                        Download Invoice
                      </Button>
                    )}
                  </div>

                  {/* Order Status */}
                  <div
                    className="mt-6 p-4 rounded-lg"
                    style={{ background: "var(--info-bg)" }}
                  >
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-lg mr-2">
                          {orderDetails.status === "paid" ? "✅" : "⏳"}
                        </span>
                      </div>
                      <div>
                        <h4
                          className="text-sm font-medium"
                          style={{ color: "var(--info-text)" }}
                        >
                          Order Status:{" "}
                          {orderDetails.status
                            ? orderDetails.status.charAt(0).toUpperCase() +
                              orderDetails.status.slice(1)
                            : "Pending"}
                        </h4>
                        <p
                          className="text-sm mt-1"
                          style={{ color: "var(--info-text)", opacity: 0.8 }}
                        >
                          {orderDetails.status === "paid"
                            ? "Payment confirmed, preparing for delivery"
                            : "Your order is being processed"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Trust Signals */}
                  <div
                    className="mt-6 pt-6"
                    style={{ borderTop: "1px solid var(--sidebar-border)" }}
                  >
                    <div className="flex flex-col space-y-3 text-sm">
                      <div className="flex items-center">
                        <svg
                          className="w-4 h-4 mr-2"
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
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          Secure Payment
                        </span>
                      </div>
                      <div className="flex items-center">
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          style={{ color: "var(--success)" }}
                        >
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        <span
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          Confirmation Email Sent
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
