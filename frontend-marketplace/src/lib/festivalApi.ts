import { httpClient } from "@/utils/httpClient";

export type FestivalAddition = {
  id: number;
  name: string;
  price: string;
};

export type FestivalFilling = {
  id: number;
  name: string;
};

export type FestivalProduct = {
  id: number;
  name: string;
  category_id: number | null;
  category: string | null;
  addition_class_id: number | null;
  addition_class: string | null;
  additions: FestivalAddition[];
  fillings: FestivalFilling[];
  image: string;
  price: string;
  vat_rate: string;
};

export type FestivalStatus = {
  enabled: boolean;
  mode: string;
  online: boolean;
  last_seen_at: string | null;
  queued_jobs: number;
  can_accept_orders: boolean;
};

export type FestivalOrderResponse = {
  id: number;
  order_number: string;
  total_price: string;
  created_at: string;
  invoice_number: string;
  print_status: string;
  replayed: boolean;
  status: string;
};

export type FestivalOrderItemInput = {
  product_id: number;
  quantity: number;
  filling_id?: number | null;
  addition_id?: number | null;
};

export async function fetchFestivalProducts(): Promise<FestivalProduct[]> {
  const data = await httpClient.get<{ results: FestivalProduct[] }>(
    "/api/festival/products/"
  );
  return data.results ?? [];
}

export async function fetchFestivalStatus(): Promise<FestivalStatus> {
  return httpClient.get<FestivalStatus>("/api/festival/status/");
}

export async function placeFestivalOrder(payload: {
  client_request_id: string;
  items: FestivalOrderItemInput[];
}): Promise<FestivalOrderResponse> {
  return httpClient.post<FestivalOrderResponse>("/api/festival/orders/", payload);
}

export function formatFestivalMoney(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "£0.00";
  return `£${num.toFixed(2)}`;
}
