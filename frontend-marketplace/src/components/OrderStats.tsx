"use client";
import React from "react";

interface OrderStatsProps {
  stats: {
    total_orders: number;
    pending_orders: number;
    paid_orders: number;
    cancelled_orders: number;
    total_spent: number;
    average_order_value: number;
  };
}

export default function OrderStats({ stats }: OrderStatsProps) {
  const formatCurrency = (amount: number) => {
    return `£${amount.toFixed(2)}`;
  };

  const statCards = [
    {
      title: "Total Orders",
      value: stats.total_orders,
      icon: "📦",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
    {
      title: "Pending",
      value: stats.pending_orders,
      icon: "⏳",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
    },
    {
      title: "Completed",
      value: stats.paid_orders,
      icon: "✅",
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
    },
    {
      title: "Cancelled",
      value: stats.cancelled_orders,
      icon: "❌",
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
    },
    {
      title: "Total Spent",
      value: formatCurrency(stats.total_spent),
      icon: "💰",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
    },
    {
      title: "Average Order",
      value: formatCurrency(stats.average_order_value),
      icon: "📊",
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      borderColor: "border-indigo-200",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className={`p-4 rounded-lg border ${stat.bgColor} ${stat.borderColor} ${stat.color}`}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                {stat.title}
              </p>
              <p
                className="text-2xl font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {stat.value}
              </p>
            </div>
            <div className="text-2xl">{stat.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
