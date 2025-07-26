import { useEffect, useRef } from "react";

interface PerformanceMetrics {
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
}

/**
 * Development hook to monitor DocumentGrid performance
 * Only active in development mode
 */
export const useDocumentGridPerformance = (
  itemCount: number,
  componentName = "DocumentGrid",
) => {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const startTime = useRef<number>(0);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      startTime.current = performance.now();
    }
  });

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const endTime = performance.now();
      const renderTime = endTime - startTime.current;

      renderCount.current += 1;
      renderTimes.current.push(renderTime);

      // Keep only last 10 render times for moving average
      if (renderTimes.current.length > 10) {
        renderTimes.current.shift();
      }

      const averageRenderTime = renderTimes.current.reduce((a, b) => a + b, 0) /
        renderTimes.current.length;

      // Log performance metrics for long render times
      if (renderTime > 16) { // More than one frame at 60fps
        console.warn(`${componentName}: Slow render detected`, {
          renderTime: `${renderTime.toFixed(2)}ms`,
          itemCount,
          renderCount: renderCount.current,
          averageRenderTime: `${averageRenderTime.toFixed(2)}ms`,
        });
      }
    }
  });

  const getMetrics = (): PerformanceMetrics => ({
    renderCount: renderCount.current,
    lastRenderTime: renderTimes.current[renderTimes.current.length - 1] || 0,
    averageRenderTime: renderTimes.current.reduce((a, b) => a + b, 0) /
        renderTimes.current.length || 0,
  });

  return { getMetrics };
};
