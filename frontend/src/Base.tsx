import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";

function Base() {
  return (
    <div
      className="min-h-screen flex flex-col w-full"
      style={{ background: "var(--se-bg-base)", fontFamily: "var(--se-font-sans)" }}
    >
      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer
        className="w-full border-t py-6"
        style={{
          background: "var(--se-bg-surface)",
          borderColor: "var(--se-border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-0.5">
              <span
                className="text-sm font-extrabold"
                style={{ color: "var(--se-primary)" }}
              >
                Smart
              </span>
              <span
                className="text-sm font-extrabold"
                style={{ color: "var(--se-text-main)" }}
              >
                Eats
              </span>
            </div>
            <p
              className="text-xs"
              style={{ color: "var(--se-text-faint)" }}
            >
              UIUC Dining &mdash; INFO 490
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Base;
