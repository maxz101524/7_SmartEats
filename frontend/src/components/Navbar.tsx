import { useLocation, Link, useNavigate } from "react-router-dom";
import Logout from "./logout";

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/halls", label: "Dining Halls" },
    { to: "/dishes", label: "Dishes" },
    { to: "/profile", label: "Profile" },
    { to: "/aimeals", label: "AIMeal" },
    { to: "/charts", label: "Charts" },
    { to: "/reports", label: "Reports" },
  ];

  const token = localStorage.getItem("authToken");

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b border-[#1e2540]"
      style={{
        background:
          "linear-gradient(135deg, #0f1a33 0%, #13294B 50%, #162040 100%)",
      }}
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          <Link to="/" className="flex items-center gap-2 group">
            <span
              className="text-lg font-black tracking-tight"
              style={{ color: "#E84A27" }}
            >
              Smart
            </span>
            <span
              className="text-lg font-black tracking-tight"
              style={{ color: "#f0f2f8" }}
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
                      color: isActive ? "#ffffff" : "#8b95b0",
                      backgroundColor: isActive
                        ? "rgba(232, 74, 39, 0.15)"
                        : "transparent",
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
                        className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                        style={{ backgroundColor: "#E84A27" }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {!token && location.pathname != "/login" && (
            <div className=" md:block">
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition"
                onClick={() => navigate("/login")}
              >
                Login
              </button>
            </div>
          )}
          {token && (
            <div className=" md:block">
              <Logout></Logout>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
