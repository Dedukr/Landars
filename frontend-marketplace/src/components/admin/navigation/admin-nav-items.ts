import type { ComponentType } from "react";
import {
  BarChart3,
  Bell,
  FileText,
  Hash,
  Heart,
  LayoutDashboard,
  Layers,
  Package,
  Receipt,
  RefreshCcw,
  ShoppingCart,
  Star,
  Tags,
  Truck,
  Users,
} from "lucide-react";

export type AdminPermission = "staff" | "superuser";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
  permission?: AdminPermission;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: "staff",
      },
    ],
  },
  {
    label: "Sales & Orders",
    items: [
      {
        label: "Orders",
        href: "/dashboard/orders",
        icon: ShoppingCart,
        permission: "staff",
      },
      {
        label: "Invoices",
        href: "/dashboard/invoices",
        icon: FileText,
        permission: "staff",
      },
      {
        label: "Credit Notes",
        href: "/dashboard/credit-notes",
        icon: Receipt,
        permission: "staff",
      },
      {
        label: "Reconciliation",
        href: "/dashboard/reconciliation",
        icon: RefreshCcw,
        permission: "staff",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        label: "Products",
        href: "/dashboard/products",
        icon: Package,
        permission: "staff",
      },
      {
        label: "Categories",
        href: "/dashboard/categories",
        icon: Tags,
        permission: "staff",
      },
      {
        label: "Category Groups",
        href: "/dashboard/category-groups",
        icon: Layers,
        permission: "staff",
      },
      {
        label: "Reviews",
        href: "/dashboard/reviews",
        icon: Star,
        permission: "staff",
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        label: "Customers",
        href: "/dashboard/customers",
        icon: Users,
        permission: "staff",
      },
      {
        label: "Carts",
        href: "/dashboard/carts",
        icon: ShoppingCart,
        permission: "staff",
      },
      {
        label: "Wishlists",
        href: "/dashboard/wishlists",
        icon: Heart,
        permission: "staff",
      },
    ],
  },
  {
    label: "Fulfilment",
    items: [
      {
        label: "Shipments",
        href: "/dashboard/shipments",
        icon: Truck,
        permission: "staff",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Notifications",
        href: "/dashboard/notifications",
        icon: Bell,
        permission: "staff",
      },
      {
        label: "Document Sequences",
        href: "/dashboard/document-sequences",
        icon: Hash,
        permission: "superuser",
      },
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: BarChart3,
        permission: "staff",
      },
    ],
  },
];
