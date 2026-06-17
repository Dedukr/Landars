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
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "Landar's Food — Authentic Eastern European Foods",
    template: "%s | Landar's Food",
  },
  description: "Ukrainian, Slavic, European cuisine.\
  Homemade semi-prepared products, ready meals, sausages and meat products, fresh bakery items, and desserts.",
  icons: {
    icon: "/landars_food_logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf4e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="light overflow-x-hidden">
      <body className="antialiased flex flex-col min-h-screen overflow-x-hidden">
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
