import { Link, useLocation } from "react-router-dom";
import { IconGrid, IconHome, IconSparkle, IconUtensils } from "./Icons";

function Navbar() {
  const { pathname } = useLocation();
  const isLoggedIn = Boolean(localStorage.getItem("authToken"));
  const firstName = localStorage.getItem("userFirstName") ?? "";
  const userInitial = firstName ? firstName.charAt(0).toUpperCase() : "U";

  const links = [
    { to: "/", label: "Home", icon: IconHome, active: pathname === "/" },
    { to: "/menu", label: "Menu", icon: IconUtensils, active: pathname.startsWith("/menu") || pathname.startsWith("/dishes") },
    { to: "/aimeals", label: "AI Meals", icon: IconSparkle, active: pathname.startsWith("/aimeals") },
  ];

  return (
    <nav className="se-nav" aria-label="Main">
      <div className="se-nav__group">
        {links.map(({ to, label, icon: Icon, active }) => (
          <Link
            key={to}
            to={to}
            className={`se-nav__link${to === "/" ? " se-nav__link--home" : ""}`}
            aria-current={active ? "page" : undefined}
            title={label}
          >
            <Icon size={16} />
            <span className="se-nav__label">{label}</span>
          </Link>
        ))}
      </div>

      <Link to="/" className="se-nav__brand" aria-label="SmartEats home">
        <em>Smart</em>Eats
      </Link>

      <div className="se-nav__group se-nav__group--end">
        {isLoggedIn ? (
          <>
            <Link
              to="/dashboard"
              className="se-nav__link"
              aria-current={pathname === "/dashboard" ? "page" : undefined}
              title="Dashboard"
            >
              <IconGrid size={16} />
              <span className="se-nav__label">Dashboard</span>
            </Link>
            <Link
              to="/profile"
              className="se-nav__link se-nav__link--profile"
              aria-current={pathname === "/profile" ? "page" : undefined}
              title="Profile"
            >
              <span className="se-nav__avatar" aria-hidden="true">
                {userInitial}
              </span>
              <span className="se-nav__label">Profile</span>
            </Link>
          </>
        ) : (
          <Link to="/login" className="se-nav__link se-nav__signin">
            <span className="se-nav__label">Sign in</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
