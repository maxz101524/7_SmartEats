import { useLocation, Link } from "react-router-dom";

function Navbar() {
  const location = useLocation();

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/halls", label: "Dining Halls" },
    { to: "/dishes", label: "Dishes" },
    { to: "/profile", label: "Profile" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="w-full bg-[#13294B]  mx-auto px-4 sm:px-6 lg:px-8 background-cl">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link
              to="/"
              className="text-xl font-black text-white tracking-tighter uppercase"
            >
              SmartEats
            </Link>
          </div>

          <ul className="hidden md:flex space-x-8 h-full items-center">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;

              return (
                <li key={link.to} className="h-full flex items-center">
                  <Link
                    to={link.to}
                    className={`relative text-sm font-semibold transition-all duration-300 py-2 px-1 ${
                      isActive
                        ? "text-white"
                        : "text-gray-500 hover:text-blue-500"
                    }`}
                  >
                    {link.label}
                    {/* Animated Active Indicator */}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* <div className="flex items-center">
            <button className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors">
              Log In
            </button>
          </div> */}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
