import { useGoogleLogin, type TokenResponse } from "@react-oauth/google";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { API_BASE } from "../config";

const GGLogin = () => {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const handleGoogleSuccess = async (tokenResponse: TokenResponse) => {
    try {
      setError("");
      if (!tokenResponse?.access_token) {
        throw new Error("Missing Google access token");
      }

      const res = await axios.post(`${API_BASE}/google-login/`, {
        access_token: tokenResponse.access_token,
      });

      const token = res.data?.key || res.data?.token;
      if (!token) {
        throw new Error("Missing auth token in backend response");
      }

      localStorage.setItem("authToken", token);

      navigate("/menu");
    } catch (err) {
      console.error("Error authenticating with backend", err);
      setError("Google login failed. Please try again.");
    }
  };

  const startGoogleLogin = useGoogleLogin({
    scope: "openid profile email",
    onSuccess: handleGoogleSuccess,
    onError: () => {
      setError("Google login popup was closed or failed.");
    },
  });

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => startGoogleLogin()}
        className="w-full border border-gray-300 bg-white text-gray-800 font-semibold py-2 px-4 rounded hover:bg-gray-50"
      >
        Continue with Google
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default GGLogin;
