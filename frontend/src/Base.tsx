import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";

function Base() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 w-full">
      <Navbar />

      <main className="flex-grow w-full max-w-7xl mx-auto p-6">
        <Outlet />
      </main>

      <footer className="w-full bg-[#13294B] py-12">
        <div className=" max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-white">
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold text-[#E84A27] ">SmartEats</h2>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Base;
