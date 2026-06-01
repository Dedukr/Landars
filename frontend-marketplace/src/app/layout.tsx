import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthWrapper from "@/components/AuthWrapper";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import CartMergeNotification from "@/components/CartMergeNotification";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "Landar's Food — Authentic Eastern European Foods",
    template: "%s | Landar's Food",
  },
  description:
    "Shop authentic Eastern European foods delivered across the UK. Freshly sourced sausages, dairy, pastries and more from Landar's Food.",
  icons: {
    icon: "/landars_food_logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf4e8" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased flex flex-col min-h-screen">
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <AuthWrapper>
                <CartProvider>
                  <WishlistProvider>
                    <Header />
                    <CartMergeNotification />
                    <main className="flex-1">{children}</main>
                    <Footer />
                    <Toaster richColors position="top-right" />
                  </WishlistProvider>
                </CartProvider>
              </AuthWrapper>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
