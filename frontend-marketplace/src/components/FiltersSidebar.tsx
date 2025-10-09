"use client";
import React, { useState, useEffect } from "react";

interface Category {
  id: number;
  name: string;
  parent?: number | null;
}

interface Filters {
  categories: number[];
  price: [number, number];
  inStock: boolean;
}

interface FiltersSidebarProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

export default function FiltersSidebar({
  filters,
  setFilters,
}: FiltersSidebarProps) {
  const [open, setOpen] = useState(false); // mobile sidebar
  const [collapse, setCollapse] = useState({ category: true, stock: true });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      setLoading(true);
      try {
        const res = await fetch(`/api/categories/`);
        if (!res.ok) throw new Error("Failed to fetch categories");
        const data = await res.json();
        setCategories(data);
      } catch {
        setCategories([]);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  function toggleCollapse(section: keyof typeof collapse) {
    setCollapse((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  // Build a map of parentId -> children
  const categoryTree: { [parentId: number]: Category[] } = {};
  categories.forEach((cat) => {
    if (cat.parent == null) return; // skip root for now
    if (!categoryTree[cat.parent]) categoryTree[cat.parent] = [];
    categoryTree[cat.parent].push(cat);
  });
  // Get only root categories (true parents)
  const rootCategories = categories.filter((cat) => cat.parent == null);

  // Recursively render category tree, only true parent->children
  function renderCategoryTree(parentId: number, level: number = 0) {
    const children = categoryTree[parentId] || [];
    // Sort children alphabetically
    const sorted = [...children].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.map((cat) => {
      const subChildren = categoryTree[cat.id];
      const childIds = subChildren ? subChildren.map((c) => c.id) : [];
      const allChildrenChecked =
        childIds.length > 0 &&
        childIds.every((id) => filters.categories.includes(id));
      const isChecked =
        childIds.length > 0
          ? allChildrenChecked
          : filters.categories.includes(cat.id);
      return (
        <div key={cat.id} style={{ marginLeft: level * 16 }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => handleCategoryTreeChange(cat, isChecked)}
            />
            {cat.name}
          </label>
          {subChildren &&
            subChildren.length > 0 &&
            renderCategoryTree(cat.id, level + 1)}
        </div>
      );
    });
  }

  // Handle category tree changes - parent categories act as select-all buttons
  function handleCategoryTreeChange(cat: Category, isChecked: boolean) {
    const children = categoryTree[cat.id] || [];
    const childIds = children.map((c) => c.id);
    let newCategories = [...filters.categories];

    if (childIds.length > 0) {
      // This is a parent category - act as select-all button for children
      if (isChecked) {
        // Uncheck all children (parent ID is never added to filter array)
        newCategories = newCategories.filter((id) => !childIds.includes(id));
      } else {
        // Check all children (parent ID is never added to filter array)
        newCategories = Array.from(new Set([...newCategories, ...childIds]));
      }
    } else {
      // This is a child category - handle normally
      if (isChecked) {
        // Uncheck this category
        newCategories = newCategories.filter((id) => id !== cat.id);
      } else {
        // Check this category
        newCategories = Array.from(new Set([...newCategories, cat.id]));
      }
    }
    setFilters({ ...filters, categories: newCategories });
  }

  // function handleInStockChange() {
  //   setFilters({ ...filters, inStock: !filters.inStock });
  // }

  // Sidebar content
  const sidebar = (
    <aside
      className="w-auto bg-white border-r border-gray-100 p-4 pt-6 fixed top-20 left-0 h-[calc(100vh-5rem)] overflow-y-auto hidden md:block rounded-tr-lg rounded-br-lg shadow-sm z-10"
      style={{ width: "var(--sidebar-width)" }}
    >
      <h2 className="text-xl font-bold mb-4 text-center">Filters</h2>
      {/* Category */}
      <div className="mb-4">
        <button
          className="w-full flex justify-between items-center font-semibold mb-2"
          onClick={() => toggleCollapse("category")}
        >
          Category <span>{collapse.category ? "−" : "+"}</span>
        </button>
        {collapse.category && (
          <div className="pl-2 flex flex-col gap-1">
            {loading ? (
              <span>Loading...</span>
            ) : categories.length === 0 ? (
              <span>No categories</span>
            ) : (
              rootCategories
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cat) => {
                  const children = categoryTree[cat.id];
                  const childIds = children ? children.map((c) => c.id) : [];
                  const allChildrenChecked =
                    childIds.length > 0 &&
                    childIds.every((id) => filters.categories.includes(id));
                  const isChecked =
                    childIds.length > 0
                      ? allChildrenChecked
                      : filters.categories.includes(cat.id);
                  return (
                    <div key={cat.id}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            handleCategoryTreeChange(cat, isChecked)
                          }
                        />
                        {cat.name}
                      </label>
                      {children &&
                        children.length > 0 &&
                        renderCategoryTree(cat.id, 1)}
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>
      {/* In Stock
      <div className="mb-4">
        <button
          className="w-full flex justify-between items-center font-semibold mb-2"
          onClick={() => toggleCollapse("stock")}
        >
          In Stock <span>{collapse.stock ? "−" : "+"}</span>
        </button>
        {collapse.stock && (
          <div className="pl-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.inStock}
              onChange={handleInStockChange}
            />
            <span>Show only in-stock</span>
          </div>
        )}
      </div> */}
    </aside>
  );

  // Mobile sidebar
  const mobileSidebar = (
    <>
      <button
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        onClick={() => setOpen(true)}
      >
        Filter
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex">
          <aside className="w-auto bg-white p-4 pt-6 h-full overflow-y-auto rounded-tr-lg rounded-br-lg shadow-lg animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-center">Filters</h2>
              <button
                className="text-2xl font-bold p-1 hover:bg-gray-100 rounded transition-colors"
                onClick={() => setOpen(false)}
              >
                &times;
              </button>
            </div>
            {/* Same filter content as desktop */}
            {/* Category */}
            <div className="mb-4">
              <button
                className="w-full flex justify-between items-center font-semibold mb-2"
                onClick={() => toggleCollapse("category")}
              >
                Category <span>{collapse.category ? "−" : "+"}</span>
              </button>
              {collapse.category && (
                <div className="pl-2 flex flex-col gap-1">
                  {loading ? (
                    <span>Loading...</span>
                  ) : categories.length === 0 ? (
                    <span>No categories</span>
                  ) : (
                    rootCategories
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((cat) => {
                        const children = categoryTree[cat.id];
                        const childIds = children
                          ? children.map((c) => c.id)
                          : [];
                        const allChildrenChecked =
                          childIds.length > 0 &&
                          childIds.every((id) =>
                            filters.categories.includes(id)
                          );
                        const isChecked =
                          childIds.length > 0
                            ? allChildrenChecked
                            : filters.categories.includes(cat.id);
                        return (
                          <div key={cat.id}>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  handleCategoryTreeChange(cat, isChecked)
                                }
                              />
                              {cat.name}
                            </label>
                            {children &&
                              children.length > 0 &&
                              renderCategoryTree(cat.id, 1)}
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
            {/* In Stock
            <div className="mb-4">
              <button
                className="w-full flex justify-between items-center font-semibold mb-2"
                onClick={() => toggleCollapse("stock")}
              >
                In Stock <span>{collapse.stock ? "−" : "+"}</span>
              </button>
              {collapse.stock && (
                <div className="pl-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.inStock}
                    onChange={handleInStockChange}
                  />
                  <span>Show only in-stock</span>
                </div>
              )}
            </div> */}
          </aside>
          <div className="flex-1" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block">{sidebar}</div>
      {/* Mobile sidebar */}
      <div className="md:hidden">{mobileSidebar}</div>
    </>
  );
}
