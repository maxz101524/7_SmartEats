import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config";

const GGLogin = () => {
  const navigate = useNavigate();
  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      const res = await axios.post(`${API_BASE}/google-login/`, {
        id_token: credentialResponse.credential,

        access_token: credentialResponse.credential,
      });

      console.log("Login Success! Backend response:", res.data);

      localStorage.setItem("authToken", res.data.key);

      navigate("/dishes");
    } catch (error) {
      console.error("Error authenticating with backend", error);
    }
  };

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={() => {
          console.log("Google Login Failed");
        }}
      />
    </div>
  );
};

export default GGLogin;
