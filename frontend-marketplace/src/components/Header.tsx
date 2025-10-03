"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";

const navLinks = [
  { name: "Shop", href: "/" },
  { name: "About Us", href: "/about" },
  { name: "Contact Us", href: "/contact" },
];

const userMenu = [
  { name: "My Profile", href: "/profile" },
  { name: "My Orders", href: "/orders" },
  { name: "Wishlist", href: "/wishlist" },
  { name: "Log Out", action: "logout" },
];

export default function Header() {
  const { cart } = useCart();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  async function handleMenuClick(item: {
    name: string;
    href?: string;
    action?: string;
  }) {
    if (item.action === "logout") {
      await logout();
      router.push("/"); // Redirect to home page after logout
    }
    setMenuOpen(false);
    setMobileMenuOpen(false);
  }

  // Dedicated function to close mobile menu
  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  // Close mobile menu when clicking outside or on navigation
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    // Close mobile menu on route change
    function handleRouteChange() {
      setMobileMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    // Listen for navigation events
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-50 w-full backdrop-blur transition-all duration-300"
      style={{
        background: "var(--sidebar-bg)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="max-w-[90rem] mx-auto">
        {/* Main header content */}
        <div className="flex items-center justify-between px-4 py-2 md:px-8 md:py-3 gap-4">
          {/* Logo - responsive sizing */}
          <div
            className="flex items-center gap-2 md:gap-3 flex-shrink-0 min-w-0"
            style={{ minWidth: "140px" }}
          >
            <Image
              src="/landars_food_logo.svg"
              alt="Landar's Food Logo"
              width={28}
              height={28}
              className="object-contain md:w-9 md:h-9 flex-shrink-0"
            />
            <span
              className="font-extrabold text-sm sm:text-lg md:text-2xl tracking-tight select-none whitespace-nowrap"
              style={{ color: "var(--primary)" }}
            >
              Landar&apos;s Food
            </span>
          </div>

          {/* Desktop Navigation - hidden on mobile */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="navbar-link transition-colors hover:opacity-80"
                style={{
                  color: "var(--primary)",
                  fontSize: "1.1rem",
                  fontFamily:
                    "var(--font-inter), 'Segoe UI', 'Roboto', sans-serif",
                }}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Right side - Cart and User/Auth */}
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            {/* Cart Icon */}
            <Link
              href="/cart"
              className="relative group p-2"
              aria-label="Cart"
              style={{ color: "var(--primary)" }}
            >
              <svg
                width="20"
                height="20"
                className="md:w-6 md:h-6"
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

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 rounded-md hover:bg-gray-100 focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle mobile menu"
            >
              <svg
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>

            {/* Desktop User Menu */}
            {user ? (
              <div className="hidden lg:block relative" ref={menuRef}>
                <button
                  className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 focus:outline-none"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="User menu"
                >
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-lg font-bold"
                    style={{ background: "var(--primary)", color: "#fff" }}
                  >
                    {user.name.charAt(0).toUpperCase()}
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
                {/* Desktop Dropdown */}
                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg animate-fade-in z-[60]"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        {user.name}
                      </p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <div>
                      {userMenu.map((item) =>
                        item.href ? (
                          <Link
                            key={item.name}
                            href={item.href}
                            className="block px-4 py-2 transition-colors hover:opacity-80"
                            style={{ color: "var(--foreground)" }}
                            onClick={() => setMenuOpen(false)}
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <button
                            key={item.name}
                            className="block w-full text-left px-4 transition-colors hover:opacity-80"
                            style={{ color: "var(--foreground)" }}
                            onClick={() => handleMenuClick(item)}
                          >
                            {item.name}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Desktop Guest User - Show Login/Signup Links */
              <div className="hidden lg:flex items-center gap-2">
                <Link
                  href="/auth?mode=signin"
                  className="px-3 py-1 text-sm font-medium rounded-md transition-colors"
                  style={{
                    color: "var(--primary)",
                    border: "1px solid var(--primary)",
                    background: "transparent",
                  }}
                >
                  Sign In
                </Link>
                <Link
                  href="/auth?mode=signup"
                  className="px-3 py-1 text-sm font-medium rounded-md text-white transition-colors"
                  style={{ background: "var(--primary)" }}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="lg:hidden border-t border-gray-200 bg-white"
            style={{
              background: "var(--card-bg)",
              borderTop: "1px solid var(--sidebar-border)",
            }}
          >
            <div className="px-4 py-4 space-y-4">
              {/* Mobile Navigation Links */}
              <nav className="space-y-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="block px-3 py-2 text-base font-medium rounded-md transition-colors hover:opacity-80"
                    style={{ color: "var(--foreground)" }}
                    onClick={closeMobileMenu}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>

              {/* Mobile User Section */}
              {user ? (
                <div className="pt-4 border-t border-gray-200">
                  <div className="px-3 py-2 mb-2">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      {user.name}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <div className="space-y-1">
                    {userMenu.map((item) =>
                      item.href ? (
                        <Link
                          key={item.name}
                          href={item.href}
                          className="block px-3 py-2 text-base font-medium rounded-md transition-colors hover:opacity-80"
                          style={{ color: "var(--foreground)" }}
                          onClick={closeMobileMenu}
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <button
                          key={item.name}
                          className="block w-full text-left px-3 py-2 text-base font-medium rounded-md transition-colors hover:opacity-80"
                          style={{ color: "var(--foreground)" }}
                          onClick={() => handleMenuClick(item)}
                        >
                          {item.name}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                /* Mobile Guest User */
                <div className="pt-4 border-t border-gray-200 space-y-2">
                  <Link
                    href="/auth?mode=signin"
                    className="block w-full text-center px-4 py-2 text-base font-medium rounded-md transition-colors"
                    style={{
                      color: "var(--primary)",
                      border: "1px solid var(--primary)",
                      background: "transparent",
                    }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    className="block w-full text-center px-4 py-2 text-base font-medium rounded-md text-white transition-colors"
                    style={{ background: "var(--primary)" }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
