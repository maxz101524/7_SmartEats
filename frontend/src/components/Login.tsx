import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import GGLogin from "./GGLogin";
import { API_BASE } from "../config";

`${API_BASE}/halls/`;
const Login = () => {
  const [netID, setNetID] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setError("");
    try {
      const response = await axios.post(`${API_BASE}/login/`, {
        netID: netID,
        password: password,
      });

      localStorage.setItem("authToken", response.data.token);
      localStorage.setItem("userFirstName", response.data.first_name);

      navigate("/dishes");
    } catch (err: any) {
      if (err.response && err.response.data) {
        setError(
          err.response.data.error ||
            "Login failed. Please check your credentials.",
        );
      } else {
        setError("Network error. Is the server running?");
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="max-w-md w-full bg-white p-10 rounded-2xl shadow-lg border border-gray-100">
        <h2 className="text-2xl font-bold text-center mb-6">SmartEats Login</h2>

        {error && <p style={{ color: "red", fontWeight: "bold" }}>{error}</p>}

        <form onSubmit={handleLogin}>
          <div className="mb-4 p-3 ">
            <div className="mb-3">
              <label className="text-xl font-bold">NetID:</label>
            </div>
            <input
              type="text"
              value={netID}
              onChange={(e) => setNetID(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="mb-4 p-3">
            <div className="mb-3">
              <label className="text-xl font-bold">Password:</label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="  mb-5 w-full ">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white-900 font-bold py-2 px-4 rounded w-full"
            >
              Log In
            </button>
          </div>
          <div className="w-full  mb-4 ">
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white-900 font-bold py-2 px-4 rounded w-full"
              type="button"
              onClick={() => navigate("/register")}
            >
              Sign Up
            </button>
          </div>
          <div className="w-full">
            <GGLogin />
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
