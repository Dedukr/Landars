import React from "react";
import { Search, ShoppingCart, ClipboardList } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: Search,
    title: "Browse the range",
    description:
      "Explore our full selection of Eastern European foods — from sausages and dairy to pastries and pantry staples. Filter by category or search by name.",
  },
  {
    step: "02",
    icon: ShoppingCart,
    title: "Add to your basket",
    description:
      "Select the products you want and add them to your cart. Review quantities, check product details, and adjust your order at any time.",
  },
  {
    step: "03",
    icon: ClipboardList,
    title: "Submit your order",
    description:
      "Enter your delivery details and place your order request. We'll confirm the details and arrange delivery across the UK.",
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
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
            Simple process
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            How it works
          </h2>
          <p
            className="mt-3 text-base max-w-md mx-auto"
            style={{ color: "var(--muted-foreground)" }}
          >
            Ordering your favourite Eastern European foods is straightforward
            and takes just a few minutes.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative">
          {/* Connector line on desktop */}
          <div
            className="hidden md:block absolute top-10 left-[16.5%] right-[16.5%] h-px"
            style={{ background: "var(--sidebar-border)" }}
          />

          {steps.map(({ step, icon: Icon, title, description }, index) => (
            <div
              key={step}
              className="relative flex flex-col items-center text-center p-6 rounded-2xl border transition-shadow hover:shadow-md"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              {/* Step icon with number */}
              <div className="relative mb-5">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  <Icon className="w-7 h-7" style={{ color: "var(--accent)" }} />
                </div>
                <span
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-[10px] font-extrabold flex items-center justify-center text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {index + 1}
                </span>
              </div>

              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                {title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
