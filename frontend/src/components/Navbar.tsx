import { useLocation, Link } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/halls", label: "Dining Halls" },
  { to: "/dishes", label: "Dishes" },
  { to: "/profile", label: "Profile" },
  { to: "/aimeals", label: "AIMeal" },
  { to: "/charts", label: "Charts" },
  { to: "/reports", label: "Reports" },
];

function Navbar() {
  const location = useLocation();

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: "var(--se-bg-surface)",
        borderColor: "var(--se-border)",
        boxShadow: "var(--se-shadow-sm)",
      }}
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">

          {/* Wordmark */}
          <Link to="/" className="flex items-center gap-0.5 flex-shrink-0">
            <span
              className="text-lg font-extrabold tracking-tight"
              style={{ color: "var(--se-primary)", fontFamily: "var(--se-font-sans)" }}
            >
              Smart
            </span>
            <span
              className="text-lg font-extrabold tracking-tight"
              style={{ color: "var(--se-text-main)", fontFamily: "var(--se-font-sans)" }}
            >
              Eats
            </span>
          </Link>

          {/* Nav links — desktop */}
          <ul className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="relative px-3 py-1.5 rounded-[var(--se-radius-md)] text-sm font-medium transition-colors duration-150"
                    style={{
                      color: isActive ? "var(--se-primary)" : "var(--se-text-muted)",
                      fontFamily: "var(--se-font-sans)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.color = "var(--se-text-main)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.color = "var(--se-text-muted)";
                    }}
                  >
                    {link.label}
                    {/* Active indicator dot */}
                    {isActive && (
                      <span
                        className="absolute -bottom-[17px] left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                        style={{ background: "var(--se-primary)" }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

        </div>
      </div>
    </nav>
  );
}

export default Navbar;
