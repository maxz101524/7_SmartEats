import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";

function Base() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent w-full">
      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto p-6">
        <Outlet />
      </main>

      <footer className="w-full py-8 border-t border-[#1e2540]"
              style={{ background: "linear-gradient(135deg, #0f1a33 0%, #13294B 100%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black" style={{ color: "#E84A27" }}>Smart</span>
              <span className="text-lg font-black" style={{ color: "#f0f2f8" }}>Eats</span>
            </div>
            <p className="text-xs" style={{ color: "#5a6380" }}>
              UIUC Dining &mdash; INFO 490
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Base;
