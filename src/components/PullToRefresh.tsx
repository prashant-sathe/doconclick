"use client";
import { useCallback, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 64; // px of pull before a release triggers a refresh
const MAX_PULL = 96; // visual cap so the indicator doesn't stretch forever

/**
 * A minimal hand-rolled pull-to-refresh gesture — no extra dependency, since
 * this is only ever used inside the native WebView / a touch browser.
 *
 * Pass `selfScrolls` when `className` itself makes this component's root the
 * scrollable element (e.g. `overflow-y-auto` inside a flex column) — the
 * gesture then gates on that element's own `scrollTop`. Omit it for plain
 * page content that scrolls with the document instead (gates on
 * `window.scrollY`) — either way the indicator + children render the same.
 */
export default function PullToRefresh({
  onRefresh,
  children,
  selfScrolls = false,
  className,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
  selfScrolls?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const scrollTop = useCallback(
    () => (selfScrolls ? (rootRef.current?.scrollTop ?? 0) : window.scrollY),
    [selfScrolls]
  );

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (refreshing || scrollTop() > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      setDragging(true);
    },
    [refreshing, scrollTop]
  );

  const onTouchMove = useCallback((e: ReactTouchEvent) => {
    if (startY.current == null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Damped so it feels resistive rather than 1:1 with the finger.
    setPull(Math.min(MAX_PULL, delta * 0.5));
  }, []);

  const onTouchEnd = useCallback(async () => {
    setDragging(false);
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(PULL_THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }, [pull, refreshing, onRefresh]);

  return (
    <div
      ref={rootRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={className}
    >
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height: pull, transition: dragging ? "none" : "height 150ms ease-out" }}
      >
        {(pull > 0 || refreshing) && (
          <Loader2
            className={cn("w-5 h-5 text-blue-500", refreshing && "animate-spin")}
            style={!refreshing ? { transform: `rotate(${Math.min(pull / PULL_THRESHOLD, 1) * 360}deg)` } : undefined}
          />
        )}
      </div>
      {children}
    </div>
  );
}
