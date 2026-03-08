import { useLocation, Link } from "react-router-dom";
import { IconHome, IconUtensils, IconSparkle } from "./Icons";

function Navbar() {
  const location = useLocation();
  const token = localStorage.getItem("authToken");

  const leftLinks = [
    { to: "/", label: "Home", icon: IconHome, isActive: () => location.pathname === "/" },
    { to: "/menu", label: "Menu", icon: IconUtensils, isActive: () => location.pathname.startsWith("/menu") },
    { to: "/aimeals", label: "AI Meals", icon: IconSparkle, isActive: () => location.pathname.startsWith("/aimeals") },
  ];

  const userInitial = (() => {
    const name = localStorage.getItem("userFirstName");
    return name && name.length > 0 ? name.charAt(0).toUpperCase() : "U";
  })();

  return (
    <nav
      style={{
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(800px, calc(100% - 48px))",
        height: "52px",
        background: "var(--se-bg-surface)",
        borderRadius: "9999px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
      }}
    >
      {/* Left column — nav links */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "2px" }}>
        {leftLinks.map((link) => {
          const active = link.isActive();
          return (
            <Link
              key={link.to}
              to={link.to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "9999px",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
                whiteSpace: "nowrap",
                color: active ? "var(--se-text-inverted)" : "var(--se-text-secondary)",
                background: active ? "var(--se-primary)" : "transparent",
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "var(--se-text-main)";
                  e.currentTarget.style.background = "var(--se-bg-subtle)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "var(--se-text-secondary)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <link.icon size={15} />
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Center column — logo */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
          <span
            style={{
              color: "var(--se-primary)",
              fontWeight: 900,
              fontSize: "1.1rem",
              letterSpacing: "-0.02em",
            }}
          >
            Smart
          </span>
          <span
            style={{
              color: "var(--se-text-main)",
              fontWeight: 900,
              fontSize: "1.1rem",
              letterSpacing: "-0.02em",
            }}
          >
            Eats
          </span>
        </Link>
      </div>

      {/* Right column — auth */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        {!token ? (
          <Link
            to="/login"
            style={{
              padding: "6px 12px",
              borderRadius: "9999px",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
              color: "var(--se-text-secondary)",
              background: "transparent",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--se-text-main)";
              e.currentTarget.style.background = "var(--se-bg-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--se-text-secondary)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            Sign In
          </Link>
        ) : (
          <Link
            to="/profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              textDecoration: "none",
              padding: "4px 10px 4px 4px",
              borderRadius: "9999px",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--se-bg-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "9999px",
                background: "var(--se-primary-dim)",
                color: "var(--se-primary)",
                fontSize: "11px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "2px solid var(--se-primary)",
              }}
            >
              {userInitial}
            </span>
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--se-text-secondary)",
              }}
            >
              Profile
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
