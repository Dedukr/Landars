import React from "react";

interface CheckoutProgressProps {
  currentStep: number;
  steps: string[];
}

export default function CheckoutProgress({
  currentStep,
  steps,
}: CheckoutProgressProps) {
  return (
    <div
      className="rounded-lg shadow-sm p-6 mb-8"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div key={step} className="flex items-center">
              <div className="flex items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{
                    background: isCompleted
                      ? "var(--success)"
                      : isCurrent
                      ? "var(--primary)"
                      : "var(--sidebar-bg)",
                    color:
                      isCompleted || isCurrent
                        ? "white"
                        : "var(--muted-foreground)",
                  }}
                >
                  {isCompleted ? (
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </div>
                <div className="ml-3">
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: isCurrent
                        ? "var(--primary)"
                        : isCompleted
                        ? "var(--success)"
                        : "var(--muted-foreground)",
                    }}
                  >
                    {step}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className="hidden sm:block w-16 h-0.5 mx-4"
                  style={{
                    background: isCompleted
                      ? "var(--success)"
                      : "var(--sidebar-border)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
