"use client";
import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";

const navLinks = [
  { name: "Shop", href: "/" },
  { name: "About Us", href: "/about" },
  { name: "Contact Us", href: "/contact" },
];

const userMenu = [
  { name: "My Profile", href: "/profile" },
  { name: "My Orders", href: "/orders" },
  { name: "Wishlist", href: "/wishlist" },
  { name: "Log Out", href: "/logout" },
];

interface Product {
  id: number;
  name: string;
}

export default function Header() {
  const { cart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  async function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);
    if (value.length > 1) {
      const res = await fetch(
        `/api/products/?search=${encodeURIComponent(value)}`
      );
      if (res.ok) {
        const data: Product[] = await res.json();
        setSuggestions(data.map((p) => p.name));
        setShowSuggestions(true);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleSuggestionClick(s: string) {
    setSearch(s);
    setShowSuggestions(false);
    // Optionally: trigger navigation or filtering
    if (typeof window !== "undefined") {
      const event = new CustomEvent("product-search", { detail: s });
      window.dispatchEvent(event);
    }
  }

  // No useEffect needed

  return (
    <header
      className="sticky top-0 z-50 w-full backdrop-blur transition-all duration-300"
      style={{
        background: "var(--sidebar-bg)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Top nav menu bar */}
      <nav
        className="w-full flex justify-center gap-16 py-0 text-base font-medium"
        style={{
          minHeight: "36px",
          background: "var(--primary)",
          color: "#fff",
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        {navLinks.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className="transition-colors hover:opacity-80"
          >
            {link.name}
          </Link>
        ))}
      </nav>
      <div className="relative max-w-[90rem] mx-auto flex flex-row items-center px-8 py-2 md:py-3 gap-8 justify-between">
        {/* Logo absolutely left */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-3 min-w-[160px] flex-shrink-0 flex-grow-0 pl-4">
          <Image
            src="/landars_food_logo.svg"
            alt="Landar's Food Logo"
            width={36}
            height={36}
            className="object-contain"
          />
          <span
            className="font-extrabold text-2xl tracking-tight select-none"
            style={{ color: "var(--primary)" }}
          >
            Landar&apos;s Food
          </span>
        </div>
        {/* Center: Search Bar */}
        <div className="flex-1 flex flex-row items-center justify-center gap-12 mx-auto">
          <div className="relative w-1/2 max-w-xl mx-auto">
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search products by name..."
              className="w-full rounded px-3 py-2 transition-all duration-300"
              style={{
                border: "1px solid var(--sidebar-border)",
                background: "#fff",
              }}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul
                className="absolute z-10 rounded w-full mt-1 shadow"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--sidebar-border)",
                }}
              >
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="px-3 py-2 cursor-pointer"
                    style={{ color: "var(--foreground)" }}
                    onMouseDown={() => handleSuggestionClick(s)}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {/* User/Cart (far right, more right margin) */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-4 flex-shrink-0 flex-grow-0 pr-4">
          {/* Cart Icon */}
          <Link
            href="/cart"
            className="relative group p-2"
            aria-label="Cart"
            style={{ color: "var(--primary)" }}
          >
            {/* Placeholder SVG for cart */}
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h7.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span
              className="absolute -top-1 -right-1 text-white text-xs rounded-full px-1.5 py-0.5 font-bold"
              style={{ background: "var(--accent)" }}
            >
              {cart.length}
            </span>
          </Link>
          {/* Avatar + Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 focus:outline-none"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="User menu"
            >
              {/* Placeholder avatar */}
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-lg font-bold"
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                A
              </span>
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {/* Dropdown */}
            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg py-2 animate-fade-in z-50"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--sidebar-border)",
                }}
              >
                {userMenu.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="block px-4 py-2 transition-colors"
                    style={{ color: "var(--foreground)" }}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Mobile Nav (always on top for mobile) */}
      <nav
        className="flex md:hidden justify-center gap-6 py-2"
        style={{
          background: "var(--primary)",
          color: "#fff",
          borderTop: "1px solid var(--sidebar-border)",
        }}
      >
        {navLinks.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className="transition-opacity text-base font-medium hover:opacity-80"
          >
            {link.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
