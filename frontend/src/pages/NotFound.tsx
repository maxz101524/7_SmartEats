import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-9xl font-black text-gray-200">404</h1>

      <div className="absolute">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mt-4">
          Lost in the Dining Hall?
        </h2>
        <p className="text-gray-500 mt-2 mb-8">
          We couldn't find the page you're looking for.
        </p>

        <Link
          to="/"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-full transition-colors shadow-lg shadow-blue-200"
        >
          Back to Dishes
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
