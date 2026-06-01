import { httpClient } from "@/utils/httpClient";

export type DashboardSummary = {
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_products: number;
  active_products: number;
  total_customers: number;
  total_shipments: number;
  unreconciled_bank_transactions: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return httpClient.get<DashboardSummary>("/api/dashboard/summary/");
}
