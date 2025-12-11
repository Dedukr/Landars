import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import AuthWrapper from "@/components/AuthWrapper";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import CartMergeNotification from "@/components/CartMergeNotification";

export const metadata: Metadata = {
  title: "Landar's Food",
  description: "Shop delicious Eastern European foods from Landar's Food.",
  icons: {
    icon: "/landars_food_logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5e6cc", // Light theme color
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <AuthWrapper>
                <CartProvider>
                  <WishlistProvider>
                    <Header />
                    <CartMergeNotification />
                    {children}
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
