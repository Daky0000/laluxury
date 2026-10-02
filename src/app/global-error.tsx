"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#FBF9F5",
          color: "#1A1A18",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: 32,
            textAlign: "center",
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
            border: "1px solid #E4E1DA",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              backgroundColor: "#F4EAEC",
              color: "#7A2E3C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 24,
            }}
          >
            &#9888;
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#7A2E3C",
              margin: "0 0 8px",
              fontFamily: "serif",
              letterSpacing: 1,
            }}
          >
            Nobel Enclave Atelier &amp; Living
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#56544E",
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}
          >
            The service is temporarily reconnecting. Please click retry below.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              backgroundColor: "#7A2E3C",
              color: "#FFFFFF",
              border: "none",
              padding: "12px 28px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            RETRY
          </button>
        </div>
      </body>
    </html>
  );
}
