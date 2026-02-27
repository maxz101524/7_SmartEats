import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
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

  const navigate = useNavigate();

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
      navigate("/dishes");
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
      {error && <p>{error}</p>}
      <div className="bg-gray-100 min-h-screen p-10 w-full border border-gray-200 rounded-lg">
        <div className="justify-center flex mb-10">
          <h2 className="font-bold text-2xl">Smarteats Register</h2>
        </div>
        <div className="flex justify-center items-center">
          <form onSubmit={handleRegister}>
            <label className="text-xl font-bold p-1">NetID:</label>
            <input
              type="text"
              value={netID}
              onChange={(e) => setNetID(e.target.value)}
              className="w-full mb-4 px-4 py-2"
            ></input>

            <label className="text-xl font-bold p-1">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mb-4 px-4 py-2"
            ></input>

            <label className="text-xl font-bold p-1">Email:</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-4 px-4 py-2"
            ></input>

            <label className="text-xl font-bold p-1">First Name:</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full mb-4 px-4 py-2"
            ></input>

            <label className="text-xl font-bold p-1">Last Name:</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full mb-4 px-4 py-2"
            ></input>

            <div>
              <label className="text-xl font-bold p-1">Biological Sex:</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="w-full mb-4 px-4 py-2"
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="text-xl font-bold p-1">Age:</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min="1"
                className="w-full mb-4 px-4 py-2"
              />
            </div>
            <div>
              <label className="text-xl font-bold p-1">Height (cm):</label>
              <input
                type="number"
                step="0.01"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full mb-4 px-4 py-2"
              />
            </div>
            <div>
              <label className="text-xl font-bold p-1">Weight (kg):</label>
              <input
                type="number"
                step="0.01"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full mb-4 px-4 py-2"
              />
            </div>
            <div className="mb-5">
              <label className="text-xl font-bold p-1">Fitness Goal:</label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full mb-4 px-4 py-2"
              >
                <option value="">Select...</option>
                <option value="fat_loss">Fat Loss</option>
                <option value="muscle_gain">Muscle Gain</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
            >
              Register
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default Register;
