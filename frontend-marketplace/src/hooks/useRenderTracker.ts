"use client";
import { useEffect, useRef } from "react";

/**
 * Hook to track component re-renders for performance monitoring
 * Only active in development mode
 */
export const useRenderTracker = (componentName: string) => {
  const renderCount = useRef(0);
  const prevProps = useRef<Record<string, unknown>>({});

  useEffect(() => {
    renderCount.current += 1;

    if (process.env.NODE_ENV === "development") {
      console.log(`🔄 ${componentName} rendered ${renderCount.current} times`);
    }
  });

  const trackProps = (props: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") {
      const changedProps = Object.keys(props).filter(
        (key) => prevProps.current[key] !== props[key]
      );

      if (changedProps.length > 0) {
        console.log(`📊 ${componentName} props changed:`, changedProps);
      }

      prevProps.current = props;
    }
  };

  return {
    renderCount: renderCount.current,
    trackProps,
  };
};

/**
 * Hook to measure performance of cart/wishlist operations
 */
export const usePerformanceTracker = () => {
  const trackOperation = (operationName: string, startTime: number) => {
    if (process.env.NODE_ENV === "development") {
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`⚡ ${operationName} took ${duration.toFixed(2)}ms`);

      if (duration > 100) {
        console.warn(
          `⚠️ Slow operation detected: ${operationName} took ${duration.toFixed(
            2
          )}ms`
        );
      }
    }
  };

  const startTimer = () => {
    return performance.now();
  };

  return {
    trackOperation,
    startTimer,
  };
};
