import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FestivalTillPage from "../page";

const mockReplace = jest.fn();
// Stable router identity (like the real Next.js router) so effects that
// depend on `router` don't re-run on every render.
const mockRouter = { replace: mockReplace, push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { alt, src, onError } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
      <img
        alt={typeof alt === "string" ? alt : ""}
        src={typeof src === "string" ? src : ""}
        onError={onError as React.ReactEventHandler<HTMLImageElement> | undefined}
      />
    );
  },
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
    category_id: 1,
    category: "Mains",
    addition_class_id: 1,
    addition_class: "Soft drinks",
    additions: [
      { id: 10, name: "Cola", price: "1.50" },
      { id: 11, name: "Water", price: "0.00" },
    ],
    fillings: [],
    image: "",
    price: "8.50",
    vat_rate: "0",
  },
  {
    id: 2,
    name: "Kvas",
    category_id: 2,
    category: "Drinks",
    addition_class_id: null,
    addition_class: null,
    additions: [],
    fillings: [],
    image: "https://example.com/kvas.jpg",
    price: "3.00",
    vat_rate: "20",
  },
  {
    id: 3,
    name: "Pyrizhky",
    category_id: 1,
    category: "Mains",
    addition_class_id: null,
    addition_class: null,
    additions: [],
    fillings: [
      { id: 31, name: "Potato" },
      { id: 32, name: "Cabbage" },
    ],
    image: "",
    price: "4.00",
    vat_rate: "0",
  },
  {
    id: 4,
    name: "Mlyntsi",
    category_id: 1,
    category: "Mains",
    addition_class_id: 1,
    addition_class: "Soft drinks",
    additions: [{ id: 10, name: "Cola", price: "1.50" }],
    fillings: [{ id: 41, name: "Cherry" }],
    image: "",
    price: "5.00",
    vat_rate: "0",
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

async function addVarenykyWithCola(qty = 1) {
  fireEvent.click(await screen.findByRole("button", { name: "Order Varenyky" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: /Cola/i }));
  if (qty !== 1) {
    fireEvent.change(screen.getByLabelText("Quantity for Varenyky"), {
      target: { value: String(qty) },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: /Add to cart/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

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
      oldest_queued_seconds: null,
      can_accept_orders: true,
    });
    placeOrder.mockResolvedValue({
      id: 10,
      order_number: "7",
      total_price: "10.00",
      created_at: "2026-07-13T12:00:00Z",
      invoice_number: "FINV-000001",
      print_status: "queued",
      replayed: false,
      status: "PAID",
    });
  });

  it("groups products by category", async () => {
    render(<FestivalTillPage />);
    expect(await screen.findByRole("heading", { name: "Mains" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Drinks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Varenyky" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kvas" })).toBeInTheDocument();
  });

  it("adds product without addition class straight to cart", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Kvas" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Festival cart")).toHaveTextContent(/Kvas/);
    expect(screen.getByLabelText("Quantity for Kvas")).toHaveTextContent("1");
    expect(
      screen.getByRole("button", { name: /Place order for £3.00/i })
    ).toBeEnabled();
  });

  it("opens modal only when product has addition class", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Varenyky" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^None$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Add to cart/i })).toBeEnabled();
  });

  it("hides price on free additions in the modal", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Varenyky" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: /^Cola/i })).toHaveTextContent("£1.50");
    expect(screen.getByRole("button", { name: /^Water/i })).not.toHaveTextContent(
      "£0.00"
    );
    expect(screen.getByRole("button", { name: /^Water/i })).toHaveTextContent("Water");
  });

  it("adds to cart with None addition", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Varenyky" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /^None$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add to cart/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("Festival cart")).toHaveTextContent(/^Varenyky/);
    expect(screen.getByLabelText("Quantity for Varenyky")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    expect(placeOrder.mock.calls[0][0].items).toEqual([
      { product_id: 1, quantity: 1 },
    ]);
  });

  it("adds to cart with addition and updates total", async () => {
    render(<FestivalTillPage />);
    await addVarenykyWithCola(2);
    expect(screen.getByLabelText("Festival cart")).toHaveTextContent(
      /Varenyky \+ Cola/
    );
    expect(
      screen.getByLabelText("Quantity for Varenyky + Cola")
    ).toHaveTextContent("2");
    expect(
      screen.getByRole("button", { name: /Place order for £20.00/i })
    ).toBeEnabled();
  });

  it("expands cart on panel click and collapses on outside click", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Kvas" }));
    const cart = screen.getByLabelText("Festival cart");
    expect(cart.className).toMatch(/max-h-28/);
    fireEvent.click(cart);
    expect(cart.className).toMatch(/max-h-\[min\(60dvh,28rem\)\]/);
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Festival Orders" }));
    expect(cart.className).toMatch(/max-h-28/);
  });

  it("shrinks cart after placing order", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Kvas" }));
    const cart = screen.getByLabelText("Festival cart");
    fireEvent.click(cart);
    expect(cart.className).toMatch(/max-h-\[min\(60dvh,28rem\)\]/);
    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    await screen.findByText("#7");
    expect(screen.queryByLabelText("Festival cart")).not.toBeInTheDocument();
  });

  it("does not toggle cart when pressing plus or minus", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Kvas" }));
    const cart = screen.getByLabelText("Festival cart");
    fireEvent.click(cart);
    expect(cart.className).toMatch(/max-h-\[min\(60dvh,28rem\)\]/);
    fireEvent.click(screen.getByRole("button", { name: "Increase Kvas" }));
    expect(cart.className).toMatch(/max-h-\[min\(60dvh,28rem\)\]/);
  });

  it("adjusts cart quantity with plus and minus", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Kvas" }));
    expect(screen.getByLabelText("Quantity for Kvas")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Increase Kvas" }));
    expect(screen.getByLabelText("Quantity for Kvas")).toHaveTextContent("2");
    expect(
      screen.getByRole("button", { name: /Place order for £6.00/i })
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Kvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease Kvas" }));
    expect(screen.queryByLabelText("Festival cart")).not.toBeInTheDocument();
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

  it("defaults addition choice to None", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Varenyky" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: /^None$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: /Add to cart/i })
    ).toBeEnabled();
  });

  it("disables empty cart submit", async () => {
    render(<FestivalTillPage />);
    await screen.findByRole("heading", { name: "Varenyky" });
    expect(
      screen.getByRole("button", { name: /Place order/i })
    ).toBeDisabled();
  });

  it("clamps max quantity in modal", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Varenyky" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Cola/i }));
    const input = screen.getByLabelText("Quantity for Varenyky");
    fireEvent.change(input, { target: { value: "150" } });
    expect(input).toHaveValue(99);
  });

  it("places multi-item order and resets cart with new uuid", async () => {
    render(<FestivalTillPage />);
    await addVarenykyWithCola(1);
    fireEvent.click(screen.getByRole("button", { name: "Order Kvas" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    const firstId = placeOrder.mock.calls[0][0].client_request_id as string;
    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(placeOrder.mock.calls[0][0].items).toEqual([
      { product_id: 1, quantity: 1, addition_id: 10 },
      { product_id: 2, quantity: 1 },
    ]);
    await screen.findByText("#7");
    expect(screen.queryByLabelText("Festival cart")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Order Kvas" }));
    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    expect(placeOrder.mock.calls[1][0].client_request_id).not.toBe(firstId);
  });

  it("preserves cart and uuid after network failure", async () => {
    placeOrder.mockRejectedValueOnce(new Error("Network down"));
    render(<FestivalTillPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Order Kvas" }));
    expect(screen.getByLabelText("Festival cart")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    const firstId = placeOrder.mock.calls[0][0].client_request_id;
    expect(screen.getByLabelText("Festival cart")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    expect(placeOrder.mock.calls[1][0].client_request_id).toBe(firstId);
  });

  it("shows product name fallback when image missing", async () => {
    render(<FestivalTillPage />);
    await screen.findByRole("heading", { name: "Varenyky" });
    expect(screen.queryByText(/Landar's Food/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Varenyky").length).toBeGreaterThanOrEqual(2);
  });

  it("shows product name when image fails to load", async () => {
    const { container } = render(<FestivalTillPage />);
    await screen.findByRole("heading", { name: "Kvas" });
    const kvasImg = container.querySelector(
      'img[src="https://example.com/kvas.jpg"]'
    ) as HTMLImageElement | null;
    expect(kvasImg).toBeTruthy();
    fireEvent.error(kvasImg!);
    await waitFor(() => {
      expect(
        container.querySelector('img[src="https://example.com/kvas.jpg"]')
      ).toBeNull();
    });
    expect(screen.queryByText(/Landar's Food/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Kvas").length).toBeGreaterThanOrEqual(2);
  });

  it("renders filling group with title and one card per filling", async () => {
    render(<FestivalTillPage />);
    expect(
      await screen.findByRole("heading", { name: "Pyrizhky" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Order Pyrizhky — Potato" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Order Pyrizhky — Cabbage" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pyrizhky fillings")).toBeInTheDocument();
  });

  it("adds filling card straight to cart and sends filling_id", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Order Pyrizhky — Potato" })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Festival cart")).toHaveTextContent(
      /Pyrizhky \(Potato\)/
    );
    expect(
      screen.getByLabelText("Quantity for Pyrizhky (Potato)")
    ).toHaveTextContent("1");

    fireEvent.click(
      screen.getByRole("button", { name: "Order Pyrizhky — Cabbage" })
    );
    expect(screen.getByLabelText("Festival cart")).toHaveTextContent(
      /Pyrizhky \(Cabbage\)/
    );

    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    expect(placeOrder.mock.calls[0][0].items).toEqual([
      { product_id: 3, quantity: 1, filling_id: 31 },
      { product_id: 3, quantity: 1, filling_id: 32 },
    ]);
  });

  it("keeps different fillings as separate cart lines", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Order Pyrizhky — Potato" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Order Pyrizhky — Potato" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Order Pyrizhky — Cabbage" })
    );
    expect(
      screen.getByLabelText("Quantity for Pyrizhky (Potato)")
    ).toHaveTextContent("2");
    expect(
      screen.getByLabelText("Quantity for Pyrizhky (Cabbage)")
    ).toHaveTextContent("1");
  });

  it("opens modal for filling card when product has addition class", async () => {
    render(<FestivalTillPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Order Mlyntsi — Cherry" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mlyntsi — Cherry");
    fireEvent.click(screen.getByRole("button", { name: /Cola/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add to cart/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("Festival cart")).toHaveTextContent(
      /Mlyntsi \(Cherry\) \+ Cola/
    );

    fireEvent.click(screen.getByRole("button", { name: /Place order/i }));
    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    expect(placeOrder.mock.calls[0][0].items).toEqual([
      { product_id: 4, quantity: 1, filling_id: 41, addition_id: 10 },
    ]);
  });

  it("disables place when printer offline and required", async () => {
    fetchStatus.mockResolvedValue({
      enabled: true,
      mode: "cloudprnt",
      online: false,
      last_seen_at: null,
      queued_jobs: 2,
      oldest_queued_seconds: 90,
      can_accept_orders: false,
    });
    render(<FestivalTillPage />);
    expect(
      await screen.findByText(/Printer offline — orders paused/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Order Kvas" }));
    expect(screen.getByLabelText("Festival cart")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Place order/i })
    ).toBeDisabled();
  });

  it("shows oldest queue age when tickets are waiting", async () => {
    fetchStatus.mockResolvedValue({
      enabled: true,
      mode: "cloudprnt",
      online: true,
      last_seen_at: new Date().toISOString(),
      queued_jobs: 2,
      oldest_queued_seconds: 45,
      can_accept_orders: true,
    });
    render(<FestivalTillPage />);
    expect(
      await screen.findByText(/Printer online · 2 queued · oldest 45s/i)
    ).toBeInTheDocument();
  });
});
