import { Link } from "react-router-dom";
import { Button } from "../components/Button";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "var(--se-space-8)",
      }}
    >
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
