import { Link, Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import FloatingMealTray from "./components/FloatingMealTray";
import "./styles/shell.css";

const REPO_URL = "https://github.com/maxz101524/7_SmartEats";

function Base() {
  const location = useLocation();
  const hideTrayOn = ["/login", "/register", "/gglogin"];
  const showTray = !hideTrayOn.some((p) => location.pathname.startsWith(p));

  return (
    <div
      className="se-app min-h-screen flex flex-col w-full"
      style={{ background: "var(--se-bg-base)", fontFamily: "var(--se-font-sans)" }}
    >
      <Navbar />
      {showTray && <FloatingMealTray />}

      <main className="se-main">
        <div key={location.pathname} className="page-enter" style={{ animation: "fadeIn 200ms ease-out" }}>
          <Outlet />
        </div>
      </main>

      <footer className="se-footer">
        <div className="se-footer__inner">
          <div>
            <div className="se-footer__brand">
              <em>Smart</em>Eats
            </div>
            <p className="se-footer__tagline">
              Daily menus for UIUC dining halls with nutrition estimates for each dish, a meal planner
              that works from those menus, and a meal log.
            </p>
          </div>

          <div>
            <p className="se-eyebrow se-footer__heading">Explore</p>
            <ul className="se-footer__links">
              <li><Link to="/menu">Today&apos;s menus</Link></li>
              <li><Link to="/aimeals">AI meal planner</Link></li>
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><Link to="/profile">Profile &amp; meal log</Link></li>
            </ul>
          </div>

          <div>
            <p className="se-eyebrow se-footer__heading">Project</p>
            <ul className="se-footer__links">
              <li><a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a></li>
              <li><Link to="/analytics">AI analytics</Link></li>
              <li><a href="https://web.housing.illinois.edu/diningmenus" target="_blank" rel="noreferrer">UIUC Dining menus</a></li>
            </ul>
          </div>
        </div>

        <div className="se-footer__base">
          <span>&copy; {new Date().getFullYear()} SmartEats &middot; Built at UIUC</span>
          <span>Independent student project. Not affiliated with University Housing. Nutrition values are estimates.</span>
        </div>
      </footer>
    </div>
  );
}

export default Base;
