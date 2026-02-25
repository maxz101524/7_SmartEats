import { useNavigate } from "react-router-dom";

const Logout = () => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("authToken");

    localStorage.removeItem("userFirstName");

    navigate("/login");
  };
  return (
    <button
      onClick={handleLogout}
      className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition"
    >
      Log Out
    </button>
  );
};

export default Logout;
