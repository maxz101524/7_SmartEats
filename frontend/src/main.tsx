import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google"; // 1. Import the provider
import "./index.css";
import "./static/css/custom.css";
import App from "./App.tsx";

const GOOGLE_CLIENT_ID =
  "518876283778-otj1d5k32s2fb3inlh03ehn0ijh1olhh.apps.googleusercontent.com";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);
