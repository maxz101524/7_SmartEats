import axios from "axios";
import { useState } from "react";

const Register = () => {
  const [netID, setNetID] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");

  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState("");

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await axios.post("http://localhost:8000/api/register/", {
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
    } catch (err: any) {
      if (err.response) {
        setError(err.response.data.error);
      } else {
        setError("Something wrong");
      }
    }
  };

  return (
    <>
      <div>
        <h2>Smarteats Register</h2>
      </div>
      {error && <p>{error}</p>}
      <form onSubmit={handleRegister}>
        <label>NetID:</label>
        <input
          type="text"
          value={netID}
          onChange={(e) => setNetID(e.target.value)}
        ></input>

        <label>Password:</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        ></input>

        <label>Email:</label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        ></input>

        <label>First Name:</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        ></input>

        <label>Last Name:</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        ></input>

        <div>
          <label>Biological Sex:</label>
          <select value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label>Age:</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            min="1"
          />
        </div>
        <div>
          <label>Height (cm):</label>
          <input
            type="number"
            step="0.01"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
          />
        </div>
        <div>
          <label>Weight (kg):</label>
          <input
            type="number"
            step="0.01"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </div>
        <div>
          <label>Fitness Goal:</label>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">Select...</option>
            <option value="fat_loss">Fat Loss</option>
            <option value="muscle_gain">Muscle Gain</option>
          </select>
        </div>

        <button type="submit">Register</button>
      </form>
    </>
  );
};

export default Register;
