import React from "react";
import { render, screen } from "@testing-library/react";
import AuthWrapper from "@/components/AuthWrapper";

const mockPathname = jest.fn(() => "/shop/");

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ loading: true }),
}));

jest.mock("@/components/LoadingSpinner", () => ({
  __esModule: true,
  default: ({ text }: { text?: string }) => <div>{text}</div>,
}));

describe("AuthWrapper", () => {
  it("renders children on public catalog routes while auth is loading", () => {
    mockPathname.mockReturnValue("/shop/");
    render(
      <AuthWrapper>
        <p>Shop catalogue</p>
      </AuthWrapper>
    );
    expect(screen.getByText("Shop catalogue")).toBeInTheDocument();
    expect(screen.queryByText(/Restoring your session/i)).not.toBeInTheDocument();
  });

  it("blocks protected routes until auth restore completes", () => {
    mockPathname.mockReturnValue("/checkout/");
    render(
      <AuthWrapper>
        <p>Checkout</p>
      </AuthWrapper>
    );
    expect(screen.getByText(/Restoring your session/i)).toBeInTheDocument();
    expect(screen.queryByText("Checkout")).not.toBeInTheDocument();
  });
});
