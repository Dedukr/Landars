"use client";
import React, { useEffect, useState } from "react";

interface Product {
  id: number;
  name: string;
}

const Navbar: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch("/api/products/");
        if (!res.ok) throw new Error("Failed to fetch products");
        const data = await res.json();
        setProducts(data);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unknown error");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  return (
    <nav className="navbar">
      <span className="navbar-title">Food Shop</span>
      <div className="navbar-products">
        {loading && <span>Loading...</span>}
        {error && <span style={{ color: "red" }}>{error}</span>}
        {!loading && !error && products.length === 0 && (
          <span>No products</span>
        )}
        {!loading &&
          !error &&
          products.map((product) => (
            <a key={product.id} className="navbar-link" href="#">
              {product.name}
            </a>
          ))}
      </div>
    </nav>
  );
};

export default Navbar;
