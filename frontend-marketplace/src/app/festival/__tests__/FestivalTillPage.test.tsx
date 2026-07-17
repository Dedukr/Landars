import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FestivalTillPage from "../page";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockAuth = {
  user: {
    id: 1,
    name: "Staff",
    email: "staff@example.com",
    is_staff: true,
    can_use_festival: true,
  } as {
    id: number;
    name: string;
    email: string;
    is_staff?: boolean;
    can_use_festival?: boolean;
  } | null,
  loading: false,
};

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

const products = [
  {
    id: 1,
    name: "Varenyky",
    image: "",
    price: "8.50",
    vat_rate: "0",
  },
  {
    id: 2,
    name: "Kvas",
    image: "https://example.com/kvas.jpg",
    price: "3.00",
    vat_rate: "20",
  },
];

const fetchProducts = jest.fn();
const fetchStatus = jest.fn();
const placeOrder = jest.fn();

jest.mock("@/lib/festivalApi", () => ({
  fetchFestivalProducts: (...args: unknown[]) => fetchProducts(...args),
  fetchFestivalStatus: (...args: unknown[]) => fetchStatus(...args),
  placeFestivalOrder: (...args: unknown[]) => placeOrder(...args),
  formatFestivalMoney: (v: number | string) => {
    const n = typeof v === "string" ? Number(v) : v;
    return `£${n.toFixed(2)}`;
  },
}));

describe("FestivalTillPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.user = {
      id: 1,
      name: "Staff",
      email: "staff@example.com",
      is_staff: true,
      can_use_festival: true,
    };
    mockAuth.loading = false;
    fetchProducts.mockResolvedValue(products);
    fetchStatus.mockResolvedValue({
      enabled: true,
      mode: "disabled",
      online: true,
      last_seen_at: null,
      queued_jobs: 0,
      can_accept_orders: true,
    });
    placeOrder.mockResolvedValue({
      id: 10,
      order_number: "7",
      total_price: "8.50",
      paid_at: "2026-07-13T12:00:00Z",
      invoice_number: "FINV-000001",
      print_status: "queued",
      replayed: false,
      status: "PAID",
    });
  });

  it("loads products and calculates total", async () => {
    render(<FestivalTillPage />);
    expect(await screen.findByText("Varenyky")).toBeInTheDocument();
    expect(screen.getByText("Kvas")).toBeInTheDocument();
    const input = screen.getByLabelText("Quantity for Varenyky");
    fireEvent.change(input, { target: { value: "2" } });
    expect(input).toHaveValue(2);
    expect(
      screen.getByRole("button", { name: /Place paid order for £17.00/i })
    ).toBeEnabled();
  });

  it("guards permission", async () => {
    mockAuth.user = {
      id: 2,
      name: "No",
      email: "n@example.com",
      is_staff: true,
      can_use_festival: false,
    };
    render(<FestivalTillPage />);
    expect(
      await screen.findByText(/do not have permission/i)
    ).toBeInTheDocument();
  });

  it("disables empty basket submit", async () => {
    render(<FestivalTillPage />);
    await screen.findByText("Varenyky");
    expect(
      screen.getByRole("button", { name: /Place paid order/i })
    ).toBeDisabled();
  });

  it("clamps max quantity", async () => {
    render(<FestivalTillPage />);
    await screen.findByText("Varenyky");
    const input = screen.getByLabelText("Quantity for Varenyky");
    fireEvent.change(input, { target: { value: "150" } });
    expect(input).toHaveValue(99);
  });

  it("submits and resets quantities, then uses new uuid", async () => {
    render(<FestivalTillPage />);
    await screen.findByText("Varenyky");
    fireEvent.click(screen.getAllByLabelText(/Increase/)[0]);
    fireEvent.click(screen.getByRole("button", { name: /Place paid order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    const firstId = placeOrder.mock.calls[0][0].client_request_id as string;
    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(placeOrder.mock.calls[0][0].items).toEqual([
      { product_id: 1, quantity: 1 },
    ]);
    await screen.findByText("#7");
    expect(screen.getByLabelText("Quantity for Varenyky")).toHaveValue(0);

    fireEvent.click(screen.getAllByLabelText(/Increase/)[0]);
    fireEvent.click(screen.getByRole("button", { name: /Place paid order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    expect(placeOrder.mock.calls[1][0].client_request_id).not.toBe(firstId);
  });

  it("preserves basket and uuid after network failure", async () => {
    placeOrder.mockRejectedValueOnce(new Error("Network down"));
    render(<FestivalTillPage />);
    await screen.findByText("Varenyky");
    fireEvent.click(screen.getAllByLabelText(/Increase/)[0]);
    fireEvent.click(screen.getByRole("button", { name: /Place paid order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    const firstId = placeOrder.mock.calls[0][0].client_request_id;
    expect(screen.getByLabelText("Quantity for Varenyky")).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: /Place paid order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    expect(placeOrder.mock.calls[1][0].client_request_id).toBe(firstId);
  });

  it("shows branded fallback when image missing", async () => {
    render(<FestivalTillPage />);
    expect(await screen.findAllByText(/Landar's Food/)).not.toHaveLength(0);
  });

  it("disables place when printer offline and required", async () => {
    fetchStatus.mockResolvedValue({
      enabled: true,
      mode: "cloudprnt",
      online: false,
      last_seen_at: null,
      queued_jobs: 2,
      can_accept_orders: false,
    });
    render(<FestivalTillPage />);
    await screen.findByText(/Printer offline/i);
    fireEvent.click(screen.getAllByLabelText(/Increase/)[0]);
    expect(
      screen.getByRole("button", { name: /Place paid order/i })
    ).toBeDisabled();
  });
});
