import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Heart,
  Leaf,
  Star,
  Truck,
  ShieldCheck,
  MapPin,
  ChevronRight,
  Users,
  Award,
} from "lucide-react";
import { FoodHygieneRating } from "@/components/FoodHygieneRating";
import { ContactLink } from "@/components/ContactLink";

const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE;
const whatsappDigits = supportPhone?.replace(/\D/g, "") ?? "";
const whatsappHref = whatsappDigits ? `https://wa.me/${whatsappDigits}` : null;

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about Landar's Food — your UK destination for authentic Eastern European foods. Our story, mission and quality promise.",
};

const values = [
  {
    icon: Leaf,
    title: "Authenticity First",
    description:
      "Every product in our range honours traditional Eastern European recipes and ingredients. We never compromise on authenticity.",
  },
  {
    icon: ShieldCheck,
    title: "Quality You Can Trust",
    description:
      "We source directly from trusted producers and ensure every item meets our strict quality standards before it reaches you.",
  },
  {
    icon: Heart,
    title: "Family Values",
    description:
      "We are a family business that genuinely cares about our customers. When you order from us, you are part of our community.",
  },
  {
    icon: Truck,
    title: "Reliable Delivery",
    description:
      "From chilled sausages to ambient pantry staples, we pack and ship everything carefully so it arrives in perfect condition.",
  },
];

const stats = [
  { value: "100+", label: "Products", icon: Star },
  { value: "UK-Wide", label: "Delivery", icon: Truck },
  { value: "Trusted", label: "by Families", icon: Users },
  { value: "Premium", label: "Quality", icon: Award },
];

export default function AboutPage() {
  return (
    <div style={{ background: "var(--background)" }}>
      {/* ── Hero ─────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--sidebar-bg) 0%, var(--background) 70%)",
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        <div
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10 pointer-events-none"
          style={{ background: "var(--accent)" }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4 border"
            style={{
              background: "var(--success-bg)",
              borderColor: "var(--success-border)",
              color: "var(--success-text)",
            }}
          >
            <MapPin className="w-3 h-3" />
            UK Family Business
          </div>
          <h1
            className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-4"
            style={{ color: "var(--foreground)" }}
          >
            About{" "}
            <span style={{ color: "var(--accent)" }}>Landar&apos;s Food</span>
          </h1>
          <p
            className="text-lg leading-relaxed max-w-2xl"
            style={{ color: "var(--muted-foreground)" }}
          >
            Your premier destination for authentic Eastern European cuisine in
            the UK. We bring the finest traditional foods to your table —
            carefully selected, thoughtfully packed, and delivered with care.
          </p>
          <div className="mt-4 flex justify-center">
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{
                background: "var(--success-bg)",
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
              }}
            >
              <Award className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              Four years of experience
            </span>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────── */}
      <section
        className="border-b"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0"
            style={{ borderColor: "var(--sidebar-border)" }}
          >
            {stats.map(({ value, label, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center py-6 px-4 text-center">
                <Icon
                  className="w-6 h-6 mb-2"
                  style={{ color: "var(--accent)" }}
                />
                <span
                  className="text-2xl font-extrabold leading-none"
                  style={{ color: "var(--foreground)" }}
                >
                  {value}
                </span>
                <span
                  className="text-xs font-medium mt-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-center px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-lg">
              <FoodHygieneRating fluid />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">
        {/* ── Our Story ────────────────────────────────── */}
        <section className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2
              className="text-3xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Our Story
            </h2>
            <p
              className="text-base leading-relaxed mb-4"
              style={{ color: "var(--muted-foreground)" }}
            >
              Landar&apos;s Food was founded with a simple but powerful idea:
              the UK&apos;s growing Eastern European community deserves access
              to the authentic foods they grew up with — and so does anyone
              who loves great, honest food.
            </p>
            <p
              className="text-base leading-relaxed"
              style={{ color: "var(--muted-foreground)" }}
            >
              We started by sourcing the finest sausages, dairy, and pantry
              staples that remind people of home. Over time, our range has
              grown, but our commitment to quality and authenticity has never
              wavered. Every product tells a story of tradition.
            </p>
          </div>
          <div
            className="rounded-2xl p-8 flex flex-col gap-4 border"
            style={{
              background: "var(--sidebar-bg)",
              borderColor: "var(--sidebar-border)",
            }}
          >
            <blockquote
              className="text-lg font-medium italic leading-relaxed"
              style={{ color: "var(--foreground)" }}
            >
              &ldquo;We believe food is more than sustenance — it&apos;s a
              connection to culture, family, and the places we call home.&rdquo;
            </blockquote>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--accent)" }}
            >
              — The Landar&apos;s Food Team
            </p>
          </div>
        </section>

        {/* ── Mission ────────────────────────────────── */}
        <section
          className="rounded-2xl p-8 md:p-10 border"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--sidebar-border)",
          }}
        >
          <div className="max-w-2xl">
            <h2
              className="text-3xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Our Mission
            </h2>
            <p
              className="text-base leading-relaxed mb-4"
              style={{ color: "var(--muted-foreground)" }}
            >
              To make authentic Eastern European food accessible to everyone in
              the UK. Whether you are searching for the taste of home, or
              discovering these incredible flavours for the first time, we are
              here to make that experience easy, reliable and enjoyable.
            </p>
            <p
              className="text-base leading-relaxed"
              style={{ color: "var(--muted-foreground)" }}
            >
              We are committed to supporting the Eastern European food culture
              in Britain — preserving culinary heritage one delivery at a time.
            </p>
          </div>
        </section>

        {/* ── Values ────────────────────────────────── */}
        <section>
          <h2
            className="text-3xl font-bold mb-2"
            style={{ color: "var(--foreground)" }}
          >
            What We Stand For
          </h2>
          <p
            className="text-base mb-8"
            style={{ color: "var(--muted-foreground)" }}
          >
            Four principles guide everything we do.
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            {values.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 p-6 rounded-2xl border transition-shadow hover:shadow-md"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  <Icon className="w-6 h-6" style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h3
                    className="font-semibold text-base mb-1"
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
              </div>
            ))}
          </div>
        </section>

        {/* ── Quality Promise ────────────────────────── */}
        <section
          className="rounded-2xl p-8 md:p-10 border"
          style={{
            background: "var(--sidebar-bg)",
            borderColor: "var(--sidebar-border)",
          }}
        >
          <h2
            className="text-3xl font-bold mb-4"
            style={{ color: "var(--foreground)" }}
          >
            Our Quality Promise
          </h2>
          <p
            className="text-base leading-relaxed mb-4"
            style={{ color: "var(--muted-foreground)" }}
          >
            Every product in our selection is carefully chosen for its
            authenticity and quality. We work directly with trusted suppliers
            and producers to ensure our customers receive the finest Eastern
            European foods available in the UK.
          </p>
          <p
            className="text-base leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            Chilled and perishable items are packaged with insulated materials
            to maintain the cold chain during transit. We take food safety
            seriously so you can order with complete confidence.
          </p>
        </section>

        {/* ── CTA ────────────────────────────────────── */}
        <section className="text-center py-4">
          <h2
            className="text-2xl font-bold mb-3"
            style={{ color: "var(--foreground)" }}
          >
            Ready to explore our range?
          </h2>
          <p
            className="text-base mb-4"
            style={{ color: "var(--muted-foreground)" }}
          >
            Browse hundreds of authentic Eastern European products, available
            for delivery across the UK.
          </p>
          {whatsappHref && (
            <p
              className="text-base mb-6"
              style={{ color: "var(--muted-foreground)" }}
            >
              Questions? Message us on{" "}
              <ContactLink href={whatsappHref} variant="inline">
                WhatsApp
              </ContactLink>
              .
            </p>
          )}
          {!whatsappHref && <div className="mb-6" />}
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow-md transition-all duration-200 hover:opacity-90"
              style={{
                background: "var(--btn-primary)",
                color: "white",
              }}
            >
              Shop Now
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: "var(--sidebar-border)",
                color: "var(--foreground)",
                background: "var(--card-bg)",
              }}
            >
              Contact Us
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
