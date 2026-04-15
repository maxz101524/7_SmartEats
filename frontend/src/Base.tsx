import { Link, Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import FloatingMealTray from "./components/FloatingMealTray";

function Base() {
  const location = useLocation();
  const hideTrayOn = ["/login", "/register", "/gglogin"];
  const showTray = !hideTrayOn.some((p) => location.pathname.startsWith(p));

  return (
    <div
      className="min-h-screen flex flex-col w-full"
      style={{ background: "var(--se-bg-base)", fontFamily: "var(--se-font-sans)" }}
    >
      <Navbar />
      {showTray && <FloatingMealTray />}

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
            <div style={{ flex: "1 1 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ color: "var(--se-primary)", fontWeight: 900, fontSize: "1.1rem" }}>Smart</span>
                <span style={{ color: "var(--se-text-main)", fontWeight: 900, fontSize: "1.1rem" }}>Eats</span>
              </div>
              <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "4px 0 0" }}>
                Smart dining at UIUC
              </p>
            </div>

            {/* Center: Quick links */}
            <div
              style={{
                display: "flex",
                gap: "clamp(10px, 2.2vw, 18px)",
                justifyContent: "center",
                flex: "1 1 0",
                minWidth: 0,
                flexWrap: "nowrap",
                whiteSpace: "nowrap",
              }}
            >
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
                    fontSize: "clamp(12px, 1.7vw, 14px)",
                    color: "var(--se-text-muted)",
                    textDecoration: "none",
                    fontWeight: 500,
                    flexShrink: 1,
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right spacer (balances centered links on wide screens) */}
            <div style={{ flex: "1 1 0" }} />

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
