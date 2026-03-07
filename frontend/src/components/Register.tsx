import axios from "axios";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../config";
import { Button } from "./Button";
import { Card } from "./Card";
import { useToast } from "./Toast";

const inputStyle: React.CSSProperties = {
  background: "var(--se-bg-input)",
  border: "1px solid var(--se-border)",
  borderRadius: "var(--se-radius-md)",
  padding: "10px 14px",
  fontSize: "var(--se-text-base)",
  color: "var(--se-text-main)",
  width: "100%",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  color: "var(--se-text-secondary)",
  fontWeight: 500,
  fontSize: "var(--se-text-sm)",
  display: "block",
  marginBottom: 4,
};

const fieldWrap: React.CSSProperties = { marginBottom: 16 };

const Register = () => {
  const [netID, setNetID] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState("");

  const navigate = useNavigate();
  const toast = useToast();

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--se-border-strong)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--se-border)";
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await axios.post(`${API_BASE}/register/`, {
        netID: netID,
        email: email,
        password: password,
        first_name: firstName,
        last_name: lastName,
        sex: sex,
        age: age ? parseInt(age) : null,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        goal: goal,
      });

      localStorage.setItem("authToken", response.data.token);
      toast.success("Account created successfully!");
      navigate("/menu");
    } catch (err: any) {
      if (err.response) {
        toast.error(err.response.data.error || "Registration failed");
      } else {
        toast.error("Something went wrong");
      }
    }
  };

  return (
    <div style={{ background: "var(--se-bg-base)", minHeight: "100vh", padding: "40px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <Card padding="lg">
          <h2
            style={{
              color: "var(--se-text-main)",
              fontSize: "var(--se-text-h2)",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 32,
            }}
          >
            SmartEats Register
          </h2>

          <form onSubmit={handleRegister}>
            <div style={fieldWrap}>
              <label style={labelStyle}>NetID</label>
              <input
                type="text"
                value={netID}
                onChange={(e) => setNetID(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Email</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Biological Sex</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min="1"
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Height (cm)</label>
              <input
                type="number"
                step="0.01"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Weight (kg)</label>
              <input
                type="number"
                step="0.01"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Fitness Goal</label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputStyle}
              >
                <option value="">Select...</option>
                <option value="fat_loss">Fat Loss</option>
                <option value="muscle_gain">Muscle Gain</option>
              </select>
            </div>

            <Button variant="primary" size="lg" type="submit" style={{ width: "100%" }}>
              Register
            </Button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: 20,
              fontSize: "var(--se-text-sm)",
              color: "var(--se-text-secondary)",
            }}
          >
            Already have an account?{" "}
            <Link
              to="/login"
              style={{
                color: "var(--se-text-accent)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          </p>
      </Card>
      </div>
    </div>
  );
};

export default Register;
