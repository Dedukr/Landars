"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatUserDisplayName, formatUserFirstName } from "@/lib/userName";
import { getAuthUrl } from "@/utils/authHelpers";
import {
  ShoppingCart,
  Heart,
  Menu,
  X,
  ChevronDown,
  User,
  Package,
  LogOut,
  LayoutDashboard,
  UtensilsCrossed,
} from "lucide-react";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Shop", href: "/shop" },
  { name: "Reviews", href: "/reviews" },
  { name: "About Us", href: "/about" },
  { name: "Contact Us", href: "/contact" },
];

export default function Header() {
  const { cart } = useCart();
  const { user, logout } = useAuth();

  const userMenu = [
    { name: "My Profile", href: "/profile", icon: User },
    { name: "My Orders", href: "/orders", icon: Package },
    ...(user?.is_staff
      ? [{ name: "Admin Panel", href: "/admin/", icon: LayoutDashboard }]
      : []),
    ...(user?.can_use_festival
      ? [{ name: "Festival Till", href: "/festival", icon: UtensilsCrossed }]
      : []),
    { name: "Log Out", action: "logout", icon: LogOut },
  ];

  const router = useRouter();
  const pathname = usePathname();
  const signInUrl = getAuthUrl({ mode: "signin", next: pathname });
  const signUpUrl = getAuthUrl({ mode: "signup", next: pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const cartItemCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  async function handleMenuClick(item: {
    name: string;
    href?: string;
    action?: string;
  }) {
    if (item.action === "logout") {
      await logout();
      router.push("/");
    }
    setMenuOpen(false);
    setMobileMenuOpen(false);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        mobileMenuButtonRef.current &&
        mobileMenuButtonRef.current.contains(target)
      ) {
        return;
      }
      if (mobileMenuOpen) {
        if (mobileMenuRef.current && !mobileMenuRef.current.contains(target)) {
          setMobileMenuOpen(false);
        }
      }
      if (menuOpen) {
        if (menuRef.current && !menuRef.current.contains(target)) {
          setMenuOpen(false);
        }
      }
    }

    function handleRouteChange() {
      setMobileMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [mobileMenuOpen, menuOpen]);

  // /shop should be active for /shop and /shop/* but not for / (homepage)
  const isActive = (href: string) => {
    if (href === "/shop") return pathname === "/shop" || pathname.startsWith("/shop/");
    return pathname === href;
  };

  return (
    <header
      className="sticky top-0 z-50 w-full backdrop-blur-md transition-all duration-300"
      style={{
        background: "var(--sidebar-bg)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="w-full lg:max-w-7xl lg:mx-auto">
        {/* Main header row */}
        <div className="flex items-center justify-between px-4 py-3 md:px-6 lg:px-8 gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 flex-shrink-0 hover:opacity-85 transition-opacity"
          >
            <Image
              src="/landars_food_logo.svg"
              alt="Landar's Food"
              width={32}
              height={32}
              className="object-contain w-7 h-7 md:w-8 md:h-8"
            />
            <span
              className="font-extrabold text-base sm:text-lg md:text-xl tracking-tight select-none whitespace-nowrap"
              style={{ color: "var(--primary)" }}
            >
              Landar&apos;s Food
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center justify-center gap-1 flex-1 min-w-0">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(link.href)
                    ? "font-semibold"
                    : "hover:opacity-80"
                }`}
                style={{
                  color: isActive(link.href)
                    ? "var(--accent)"
                    : "var(--foreground)",
                  background: isActive(link.href)
                    ? "var(--info-bg)"
                    : "transparent",
                }}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {/* Wishlist (icon on desktop & mobile header) */}
            <Link
              href="/wishlist"
              className="relative p-2 rounded-lg transition-all duration-200 hover:opacity-80"
              aria-label="Wishlist"
              style={{ color: "var(--foreground)" }}
            >
              <Heart className="w-5 h-5" />
            </Link>

            {/* Cart */}
            <Link
              href="/cart"
              className="relative p-2 rounded-lg transition-all duration-200 hover:opacity-80"
              aria-label={`Cart (${cartItemCount} items)`}
              style={{ color: "var(--foreground)" }}
            >
              <ShoppingCart className="w-5 h-5 md:w-5 md:h-5" />
              {cartItemCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none"
                  style={{ background: "var(--accent)" }}
                >
                  {cartItemCount > 99 ? "99+" : cartItemCount}
                </span>
              )}
            </Link>

            {/* Mobile menu button */}
            <button
              ref={mobileMenuButtonRef}
              className="lg:hidden p-2 rounded-lg transition-all duration-200 hover:opacity-80"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              style={{ color: "var(--foreground)" }}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>

            {/* Desktop user menu */}
            {user ? (
              <div className="hidden lg:block relative" ref={menuRef}>
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 hover:opacity-80 focus:outline-none"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="User menu"
                  aria-expanded={menuOpen}
                >
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white flex-shrink-0"
                    style={{ background: "var(--primary)" }}
                  >
                    {(formatUserDisplayName(user).charAt(0) || "U").toUpperCase()}
                  </span>
                  <span
                    className="text-sm font-medium max-w-[100px] truncate hidden xl:block"
                    style={{ color: "var(--foreground)" }}
                  >
                    {formatUserFirstName(user)}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                    style={{ color: "var(--muted-foreground)" }}
                  />
                </button>

                {/* Dropdown */}
                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-52 rounded-xl overflow-hidden shadow-xl animate-fade-in z-[60]"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--sidebar-border)",
                      boxShadow: "var(--card-shadow)",
                    }}
                  >
                    {/* User info */}
                    <div
                      className="px-4 py-3"
                      style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                    >
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {formatUserDisplayName(user)}
                      </p>
                      <p
                        className="text-xs truncate mt-0.5"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {user.email}
                      </p>
                    </div>

                    {/* Menu items */}
                    <div className="py-1">
                      {userMenu.map((item) => {
                        const Icon = "icon" in item ? item.icon : undefined;
                        const isLogout = item.name === "Log Out";
                        const linkClassName = `flex items-center px-4 py-2.5 text-sm transition-colors hover:opacity-80 ${Icon ? "gap-3" : ""}`;
                        const linkContent = (
                          <>
                            {Icon ? (
                              <Icon
                                className="w-4 h-4 flex-shrink-0"
                                style={{ color: "var(--accent)" }}
                              />
                            ) : null}
                            {item.name}
                          </>
                        );
                        if (item.href?.startsWith("/admin")) {
                          return (
                            <a
                              key={item.name}
                              href={item.href}
                              className={linkClassName}
                              style={{ color: "var(--foreground)" }}
                              onClick={() => setMenuOpen(false)}
                            >
                              {linkContent}
                            </a>
                          );
                        }
                        return item.href ? (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={linkClassName}
                            style={{ color: "var(--foreground)" }}
                            onClick={() => setMenuOpen(false)}
                          >
                            {linkContent}
                          </Link>
                        ) : (
                          <button
                            key={item.name}
                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors hover:opacity-80 mt-1"
                            style={{
                              color: isLogout ? "var(--destructive)" : "var(--foreground)",
                              borderTop: isLogout ? `1px solid var(--sidebar-border)` : undefined,
                            }}
                            onClick={() => handleMenuClick(item)}
                          >
                            {Icon ? <Icon className="w-4 h-4 flex-shrink-0" /> : null}
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden lg:flex items-center gap-2">
                <Link
                  href={signInUrl}
                  className="px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 hover:opacity-80"
                  style={{ color: "var(--foreground)" }}
                >
                  Sign In
                </Link>
                <Link
                  href={signUpUrl}
                  className="px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 hover:opacity-90 shadow-sm"
                  style={{
                    background: "var(--btn-primary)",
                    color: "white",
                  }}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="lg:hidden animate-fade-in"
            style={{
              background: "var(--card-bg)",
              borderTop: "1px solid var(--sidebar-border)",
            }}
          >
            <div className="px-4 py-4 space-y-1">
              {/* Nav links */}
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    color: isActive(link.href) ? "var(--accent)" : "var(--foreground)",
                    background: isActive(link.href) ? "var(--info-bg)" : "transparent",
                  }}
                  onClick={closeMobileMenu}
                >
                  {link.name}
                </Link>
              ))}
              {/* Wishlist is accessible via the heart icon in the header */}

              {/* User section */}
              {user ? (
                <div
                  className="mt-3 pt-3"
                  style={{ borderTop: "1px solid var(--sidebar-border)" }}
                >
                  <div className="px-3 py-2 mb-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {formatUserDisplayName(user)}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {user.email}
                    </p>
                  </div>
                  {userMenu.map((item) => {
                    const Icon = "icon" in item ? item.icon : undefined;
                    const isLogout = item.name === "Log Out";
                    const linkClassName = `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-80 ${Icon ? "gap-3" : ""}`;
                    const linkContent = (
                      <>
                        {Icon ? (
                          <Icon className="w-4 h-4" style={{ color: "var(--accent)" }} />
                        ) : null}
                        {item.name}
                      </>
                    );
                    if (item.href?.startsWith("/admin")) {
                      return (
                        <a
                          key={item.name}
                          href={item.href}
                          className={linkClassName}
                          style={{ color: "var(--foreground)" }}
                          onClick={closeMobileMenu}
                        >
                          {linkContent}
                        </a>
                      );
                    }
                    return item.href ? (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={linkClassName}
                        style={{ color: "var(--foreground)" }}
                        onClick={closeMobileMenu}
                      >
                        {linkContent}
                      </Link>
                    ) : (
                      <button
                        key={item.name}
                        className={`flex items-center w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-80 ${Icon ? "gap-3" : ""}`}
                        style={{ color: isLogout ? "var(--destructive)" : "var(--foreground)" }}
                        onClick={() => handleMenuClick(item)}
                      >
                        {Icon ? (
                          <Icon
                            className="w-4 h-4"
                            style={{
                              color: isLogout ? "var(--destructive)" : "var(--accent)",
                            }}
                          />
                        ) : null}
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="mt-3 pt-3 space-y-2"
                  style={{ borderTop: "1px solid var(--sidebar-border)" }}
                >
                  <Link
                    href={signInUrl}
                    onClick={closeMobileMenu}
                    className="flex items-center justify-center w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-80 border"
                    style={{
                      borderColor: "var(--sidebar-border)",
                      color: "var(--foreground)",
                      background: "var(--sidebar-bg)",
                    }}
                  >
                    Sign In
                  </Link>
                  <Link
                    href={signUpUrl}
                    onClick={closeMobileMenu}
                    className="flex items-center justify-center w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 hover:opacity-90"
                    style={{
                      background: "var(--btn-primary)",
                      color: "white",
                    }}
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
