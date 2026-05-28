import React from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, MessageCircle, Mail, Heart } from "lucide-react";
import { ContactLink } from "@/components/ContactLink";
import { getWhatsAppHref } from "@/lib/supportWhatsApp";

const quickLinks = [
  { name: "Shop", href: "/shop" },
  { name: "About Us", href: "/about" },
  { name: "Contact", href: "/contact" },
  { name: "My Orders", href: "/orders" },
  { name: "Wishlist", href: "/wishlist" },
];

const supportLinks = [
  { name: "My Account", href: "/profile" },
  { name: "Track Order", href: "/orders" },
  { name: "Shopping Cart", href: "/cart" },
  { name: "Checkout", href: "/checkout" },
];

export default function Footer() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const whatsappHref = getWhatsAppHref();

  return (
    <footer
      className="mt-auto border-t"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
        color: "var(--foreground)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4 group">
              <Image
                src="/landars_food_logo.svg"
                alt="Landar's Food Logo"
                width={32}
                height={32}
                className="object-contain"
              />
              <span
                className="font-extrabold text-xl tracking-tight"
                style={{ color: "var(--primary)" }}
              >
                Landar&apos;s Food
              </span>
            </Link>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--muted-foreground)" }}
            >
              Authentic Eastern European foods delivered across the UK.
              Bringing the finest traditional flavours to your door since day one.
            </p>
            {/* Trust badge */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{
                background: "var(--success-bg)",
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
              }}
            >
              <Heart className="w-3 h-3" />
              UK Family Business
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3
              className="font-semibold text-sm uppercase tracking-wider mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Quick Links
            </h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:opacity-80"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* My Account */}
          <div>
            <h3
              className="font-semibold text-sm uppercase tracking-wider mb-4"
              style={{ color: "var(--foreground)" }}
            >
              My Account
            </h3>
            <ul className="space-y-2.5">
              {supportLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:opacity-80"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3
              className="font-semibold text-sm uppercase tracking-wider mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Get in Touch
            </h3>
            <ul className="space-y-3">
              {whatsappHref && (
                <li className="flex items-center gap-2.5">
                  <MessageCircle
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <ContactLink
                    href={whatsappHref}
                    variant="footer"
                    aria-label="Chat with us on WhatsApp"
                  >
                    WhatsApp
                  </ContactLink>
                </li>
              )}
              {supportEmail ? (
                <li className="flex items-center gap-2.5">
                  <Mail
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <ContactLink href={`mailto:${supportEmail}`} variant="footer">
                    {supportEmail}
                  </ContactLink>
                </li>
              ) : (
                <li className="flex items-center gap-2.5">
                  <Mail
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <ContactLink href="mailto:info@landarsfood.com" variant="footer">
                    info@landarsfood.com
                  </ContactLink>
                </li>
              )}
              <li className="flex items-start gap-2.5">
                <MapPin
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  United Kingdom
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="py-5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t text-sm"
          style={{
            borderColor: "var(--sidebar-border)",
            color: "var(--muted-foreground)",
          }}
        >
          <p>
            &copy; {new Date().getFullYear()} Landar&apos;s Food. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:opacity-80 transition-opacity">
              About
            </Link>
            <Link href="/contact" className="hover:opacity-80 transition-opacity">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
