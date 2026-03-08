import { Link } from "react-router-dom";
import { Button } from "../components/Button";

function IconTray({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="var(--se-border-strong)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginBottom: 8 }}
    >
      <rect x="8" y="20" width="48" height="32" rx="4" />
      <path d="M12 20V16a4 4 0 014-4h32a4 4 0 014 4v4" />
      <path d="M20 36h24" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div
      className="page-enter"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "var(--se-space-8)",
        animation: "fadeIn 400ms ease-out",
      }}
    >
      <IconTray size={56} />
      <p
        style={{
          fontSize: "8rem",
          fontWeight: 800,
          color: "var(--se-border-muted)",
          lineHeight: 1,
          margin: 0,
        }}
      >
        404
      </p>
      <h1
        style={{
          fontSize: "var(--se-text-h2)",
          fontWeight: 700,
          color: "var(--se-text-main)",
          marginTop: "var(--se-space-4)",
        }}
      >
        Lost in the Dining Hall?
      </h1>
      <p
        style={{
          fontSize: "var(--se-text-base)",
          color: "var(--se-text-muted)",
          marginTop: "var(--se-space-2)",
          marginBottom: "var(--se-space-8)",
        }}
      >
        The page you're looking for doesn't exist.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg">Back to Home</Button>
      </Link>
    </div>
  );
}
