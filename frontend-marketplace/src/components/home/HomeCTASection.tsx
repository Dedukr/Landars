import React from "react";
import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";

export default function HomeCTASection() {
  return (
    <section
      className="py-16 md:py-20"
      style={{ background: "var(--sidebar-bg)" }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-14 md:px-14 text-center"
          style={{
            background:
              "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)",
          }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 pointer-events-none bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10 pointer-events-none bg-white" />

          <div className="relative">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 bg-white/15">
              <ShoppingBag className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
              Ready to see what&apos;s available today?
            </h2>
            <p className="text-white/80 text-base mb-8 max-w-lg mx-auto">
              Explore our full range of authentic Eastern European foods and
              place your order. It only takes a few minutes.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm bg-white transition-all duration-200 hover:bg-white/90 hover:shadow-lg active:scale-[0.98] shadow-md"
                style={{ color: "var(--primary)" }}
              >
                Browse the Shop
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm bg-white/15 text-white border border-white/25 transition-all duration-200 hover:bg-white/25"
              >
                Learn about us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
