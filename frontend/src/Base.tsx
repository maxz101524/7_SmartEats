import { Link, Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";

function Base() {
  const location = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col w-full"
      style={{ background: "var(--se-bg-base)", fontFamily: "var(--se-font-sans)" }}
    >
      <Navbar />

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6" style={{ paddingTop: "76px" }}>
        <div key={location.pathname} className="page-enter" style={{ animation: "fadeIn 200ms ease-out" }}>
          <Outlet />
        </div>
      </main>

      <footer
        style={{
          background: "var(--se-bg-surface)",
          borderTop: "1px solid var(--se-border)",
          padding: "32px 0 24px",
          marginTop: "auto",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
            {/* Left: Logo + tagline */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ color: "var(--se-primary)", fontWeight: 900, fontSize: "1.1rem" }}>Smart</span>
                <span style={{ color: "var(--se-text-main)", fontWeight: 900, fontSize: "1.1rem" }}>Eats</span>
              </div>
              <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "4px 0 0" }}>
                Smart dining at UIUC
              </p>
            </div>

            {/* Center: Quick links */}
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { to: "/menu", label: "Menu" },
                { to: "/dashboard", label: "Dashboard" },
                { to: "/aimeals", label: "AI Meals" },
                { to: "/profile", label: "Profile" },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    fontSize: "var(--se-text-sm)",
                    color: "var(--se-text-muted)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right: Credit */}
            <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-faint)", margin: 0 }}>
              Built with React + Django
            </p>
          </div>

          {/* Bottom divider + copyright */}
          <div
            style={{
              borderTop: "1px solid var(--se-border-muted)",
              marginTop: 20,
              paddingTop: 16,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-faint)", margin: 0 }}>
              &copy; {new Date().getFullYear()} SmartEats &mdash; UIUC INFO 490
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Base;
