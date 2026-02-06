import { Outlet, Link, useLocation } from "react-router-dom";
import "./base.css";

function Layout() {
  const location = useLocation();

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/halls", label: "Dining Halls" },
    { to: "/dishes", label: "Dishes" },
    { to: "/profiles", label: "Profiles" },
    { to: "/meals", label: "Meals" },
  ];

  return (
    <div className="layout">
      <header className="header">
        <nav className="nav">
          <Link to="/" className="nav-brand">
            SmartEats
          </Link>
          <ul className="nav-links">
            {navLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={`nav-link ${location.pathname === link.to ? "active" : ""}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} SmartEats &mdash; UIUC Dining Nutrition Tracker</p>
      </footer>
    </div>
  );
}

export default Layout;
