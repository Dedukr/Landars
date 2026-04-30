import React from "react";
import {
  Leaf,
  Truck,
  Heart,
  Smartphone,
  MessageCircle,
  Star,
} from "lucide-react";

const benefits = [
  {
    icon: Leaf,
    title: "Freshly sourced",
    description:
      "Every product is carefully selected for authenticity and freshness. We only stock what meets our quality standards.",
  },
  {
    icon: Truck,
    title: "UK-wide delivery",
    description:
      "We deliver across the UK using Royal Mail and trusted couriers. Chilled products are packaged to maintain the cold chain.",
  },
  {
    icon: Heart,
    title: "Authentic recipes",
    description:
      "From traditional sausages to aged dairy and time-honoured pastries — every product honours Eastern European culinary heritage.",
  },
  {
    icon: Smartphone,
    title: "Mobile-friendly ordering",
    description:
      "Browse and order from any device. Our shop is fully optimised for mobile, tablet, and desktop.",
  },
  {
    icon: MessageCircle,
    title: "Friendly customer service",
    description:
      "Have a question about an order or product? Our team is here to help by email or phone during business hours.",
  },
  {
    icon: Star,
    title: "Simple and clear process",
    description:
      "Browse, select, and submit your order in minutes. No hidden steps, no complicated checkout — just straightforward ordering.",
  },
];

export default function TrustBenefitsSection() {
  return (
    <section
      className="py-16 md:py-20"
      style={{
        background: "var(--background)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--accent)" }}
          >
            Why choose us
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            What makes LandarsFood different
          </h2>
          <p
            className="mt-3 text-base max-w-md mx-auto"
            style={{ color: "var(--muted-foreground)" }}
          >
            We are a UK family business dedicated to bringing the finest
            Eastern European foods straight to your door.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {benefits.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex gap-4 p-5 rounded-2xl border transition-shadow hover:shadow-md"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <div
                className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center mt-0.5"
                style={{ background: "var(--sidebar-bg)" }}
              >
                <Icon className="w-5 h-5" style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <h3
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  {title}
                </h3>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
