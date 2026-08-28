"use client";

// Replaces the root layout when a render error escapes even error.tsx (e.g. an
// error thrown by the root layout itself). Must ship its own <html>/<body> and
// cannot rely on globals.css, so styles are inline.
export default function GlobalError({
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset ?? (() => window.location.reload());

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#F8FAFC",
          color: "#0f172a",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "48px 24px",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#64748b", maxWidth: 300, marginTop: 8, lineHeight: 1.5 }}>
          The app hit an unexpected error. Please try again.
        </p>
        <button
          onClick={() => retry()}
          style={{
            marginTop: 24,
            border: 0,
            background: "#235dc7",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            padding: "13px 28px",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
