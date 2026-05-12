export default function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div
        className="border-b py-3 sm:py-4"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="h-4 w-28 rounded animate-pulse"
            style={{ background: "var(--sidebar-border)" }}
            aria-hidden
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
          {/* Image skeleton */}
          <div
            className="aspect-[4/3] lg:aspect-square rounded-2xl animate-pulse"
            style={{ background: "var(--sidebar-bg)" }}
          />

          {/* Info skeleton */}
          <div className="flex flex-col gap-5">
            {/* Badge skeletons */}
            <div className="flex gap-2">
              <div
                className="h-6 w-20 rounded-full animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
              <div
                className="h-6 w-28 rounded-full animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
            </div>

            {/* Title skeletons */}
            <div className="space-y-2">
              <div
                className="h-8 w-full rounded-lg animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
              <div
                className="h-8 w-3/4 rounded-lg animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
            </div>

            {/* Price skeleton */}
            <div
              className="h-11 w-36 rounded-lg animate-pulse"
              style={{ background: "var(--sidebar-border)" }}
            />

            {/* Description skeletons */}
            <div className="space-y-2">
              {[100, 95, 88, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-4 rounded animate-pulse"
                  style={{
                    width: `${w}%`,
                    background: "var(--sidebar-border)",
                  }}
                />
              ))}
            </div>

            {/* Quantity skeleton */}
            <div className="flex items-center gap-3">
              <div
                className="h-4 w-16 rounded animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-full animate-pulse"
                  style={{ background: "var(--sidebar-border)" }}
                />
                <div
                  className="w-8 h-5 rounded animate-pulse"
                  style={{ background: "var(--sidebar-border)" }}
                />
                <div
                  className="w-9 h-9 rounded-full animate-pulse"
                  style={{ background: "var(--sidebar-border)" }}
                />
              </div>
            </div>

            {/* Button skeletons */}
            <div className="flex gap-3">
              <div
                className="h-12 flex-1 rounded-lg animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
              <div
                className="h-12 w-12 rounded-xl animate-pulse"
                style={{ background: "var(--sidebar-border)" }}
              />
            </div>

            {/* Trust block skeleton */}
            <div
              className="grid grid-cols-2 gap-3 pt-4"
              style={{ borderTop: "1px solid var(--sidebar-border)" }}
            >
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded animate-pulse flex-shrink-0"
                    style={{ background: "var(--sidebar-border)" }}
                  />
                  <div
                    className="h-3 w-24 rounded animate-pulse"
                    style={{ background: "var(--sidebar-border)" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Details skeleton */}
        <div className="mt-10 lg:mt-14">
          <div
            className="h-6 w-36 rounded-lg mb-4 animate-pulse"
            style={{ background: "var(--sidebar-border)" }}
          />
          <div
            className="rounded-xl p-6 animate-pulse"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
          >
            <div className="flex gap-6 pb-4 mb-4" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
              {[90, 80, 76, 76].map((w, i) => (
                <div
                  key={i}
                  className="h-4 rounded"
                  style={{ width: w, background: "var(--sidebar-border)" }}
                />
              ))}
            </div>
            <div className="space-y-3">
              {[100, 80, 90].map((w, i) => (
                <div
                  key={i}
                  className="h-4 rounded"
                  style={{
                    width: `${w}%`,
                    background: "var(--sidebar-border)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
