import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import GGLogin from "./GGLogin";
import { Button } from "./Button";
import { Card } from "./Card";
import { useToast } from "./Toast";
import { API_BASE } from "../config";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--se-bg-input)",
  border: "1px solid var(--se-border)",
  borderRadius: "var(--se-radius-md)",
  padding: "10px 14px",
  fontSize: "var(--se-text-base)",
  color: "var(--se-text-main)",
  outline: "none",
  transition: "border-color 150ms ease",
};

const labelStyle: React.CSSProperties = {
  color: "var(--se-text-secondary)",
  fontWeight: 500,
  fontSize: "var(--se-text-sm)",
  display: "block",
  marginBottom: 6,
};

const Login = () => {
  const [netID, setNetID] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const toast = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE}/login/`, {
        netID: netID,
        password: password,
      });

      localStorage.setItem("authToken", response.data.token);
      localStorage.setItem("userFirstName", response.data.first_name);

      toast.success("Logged in successfully!");
      navigate("/menu");
    } catch (err: any) {
      if (err.response && err.response.data) {
        toast.error(
          err.response.data.error ||
            "Login failed. Please check your credentials.",
        );
      } else {
        toast.error("Network error. Is the server running?");
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--se-bg-base)",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%", padding: "0 16px" }}>
        <Card padding="lg">
          <h2
            style={{
              color: "var(--se-text-main)",
              fontSize: "var(--se-text-h2)",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            SmartEats Login
          </h2>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>NetID</label>
              <input
                type="text"
                value={netID}
                onChange={(e) => setNetID(e.target.value)}
                required
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor =
                    "var(--se-border-strong)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--se-border)")
                }
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor =
                    "var(--se-border-strong)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--se-border)")
                }
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
              >
                Log In
              </Button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <GGLogin />
            </div>

            <p
              style={{
                textAlign: "center",
                fontSize: "var(--se-text-sm)",
                color: "var(--se-text-secondary)",
              }}
            >
              Don't have an account?{" "}
              <Link
                to="/register"
                style={{
                  color: "var(--se-text-accent)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Register
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Login;
