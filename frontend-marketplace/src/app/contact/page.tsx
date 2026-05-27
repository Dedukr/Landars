import React from "react";
import type { Metadata } from "next";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Landar's Food team. We're here to help with orders, products, and delivery queries.",
};

const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE;
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
// `wa.me` requires the international number with digits only (no `+`, spaces, or dashes).
const whatsappDigits = supportPhone?.replace(/\D/g, "") ?? "";

const contactDetails = [
  {
    icon: Mail,
    title: "Email Us",
    value: supportEmail || "info@landarsfood.com",
    href: `mailto:${supportEmail || "info@landarsfood.com"}`,
    description: "We aim to reply within one business day",
  },
  ...(whatsappDigits
    ? [
        {
          icon: MessageCircle,
          title: "WhatsApp Us",
          value: "WhatsApp",
          href: `https://wa.me/${whatsappDigits}`,
          description: "Message us on WhatsApp for a quick reply",
        },
      ]
    : []),
  {
    icon: MapPin,
    title: "Location",
    value: "United Kingdom",
    href: null,
    description: "Serving customers across the UK",
  },
];

export default function ContactPage() {
  return (
    <div style={{ background: "var(--background)" }}>
      {/* ── Hero ─────────────────────────────────────── */}
      <section
        className="border-b"
        style={{
          background:
            "linear-gradient(135deg, var(--sidebar-bg) 0%, var(--background) 70%)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h1
            className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-3"
            style={{ color: "var(--foreground)" }}
          >
            Contact{" "}
            <span style={{ color: "var(--accent)" }}>Us</span>
          </h1>
          <p
            className="text-base sm:text-lg max-w-xl leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            We&apos;re here to help. Whether you have a question about an
            order, a product, or just want to say hello — we&apos;d love to
            hear from you.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
          {/* ── Contact info ──────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <h2
              className="text-xl font-semibold mb-5"
              style={{ color: "var(--foreground)" }}
            >
              Get in Touch
            </h2>
            {contactDetails.map(({ icon: Icon, title, value, href, description }) => (
              <div
                key={title}
                className="flex gap-4 p-4 rounded-xl border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: "var(--accent)" }}
                  />
                </div>
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wide mb-0.5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {title}
                  </p>
                  {href ? (
                    <a
                      href={href}
                      {...(/^https?:\/\//.test(href)
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-sm font-medium underline underline-offset-2 whitespace-pre-line transition-opacity hover:opacity-80"
                      style={{ color: "var(--primary)" }}
                    >
                      {value}
                    </a>
                  ) : (
                    <p
                      className="text-sm font-medium whitespace-pre-line"
                      style={{ color: "var(--foreground)" }}
                    >
                      {value}
                    </p>
                  )}
                  {description && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {description}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Order help note */}
            <div
              className="p-4 rounded-xl border"
              style={{
                background: "var(--info-bg)",
                borderColor: "var(--info-border)",
              }}
            >
              <p className="text-sm" style={{ color: "var(--info-text)" }}>
                <strong>For order queries</strong>, please include your order
                number in your message so we can help you quickly.
              </p>
            </div>
          </div>

          {/* ── Contact form (client component) ────────── */}
          <div className="lg:col-span-3">
            <div
              className="rounded-2xl border p-6 md:p-8"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
