import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useToast } from "./useToast";

const GGLogin = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    try {
      const res = await axios.post(`${API_BASE}/google-login/`, {
        id_token: credentialResponse.credential,
      });

      localStorage.setItem("authToken", res.data.key);
      localStorage.setItem("userFirstName", res.data.user?.first_name || "");

      toast.success("Logged in with Google.");
      navigate("/menu");
    } catch {
      toast.error("Google login failed. Please try again.");
    }
  };

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={() => {
          toast.error("Google login failed. Please try again.");
        }}
      />
    </div>
  );
};

export default GGLogin;
