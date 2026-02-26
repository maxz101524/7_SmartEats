import { useState, useEffect } from "react";

import { useNavigate } from "react-router-dom";
import axios from "axios";
import Empty from "../components/Empty";
import { API_BASE } from "../config";
import Logout from "../components/logout";

interface UserProfile {
  user_id: string;
  netID?: string;
  first_name: string;
  last_name: string;

  sex?: string;
  age?: number;

  height_cm?: string | number | null;
  weight_kg?: string | number | null;

  goal?: string;
  detail_url?: string; // from model's get_absolute_url()
}

interface Meal {
  meal_id: number;
  user: string;

  total_calories: number;
  total_protein: number;
  total_carbohydrates: number;
  total_fat: number;

  contain_dish: any; //fix later

  user_id: UserProfile | string;

  date: string;
}

function Profiles() {
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [mealData, setMealData] = useState<Meal[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("authToken");

    const config = {
      headers: {
        Authorization: `Token ${token}`,
      },
    };

    if (!token) {
      navigate("/login");
      return;
    }
    axios
      .get(`${API_BASE}/profile/`, config)
      .then((result) => setProfileData(result.data))
      .catch((err) => console.log(err));

    axios
      .get(`${API_BASE}/meals/`, config)
      .then((result) => setMealData(result.data))
      .catch((err) => console.log(err));
  }, [navigate]);

  return (
    <>
      <h1 className="text-center font-bold text-3xl text-blue-400">Profiles</h1>
      {!profileData ? (
        <Empty name="Profiles" />
      ) : (
        <div className="flex justify-center px-4 width-full mt-6 mb-10">
          <div
            key={profileData.netID}
            className="bg-white shadow-lg rounded-2xl p-5 border hover:shadow-xl transition w-full max-w-md"
          >
            <h3 className="text-lg font-bold text-blue-600">
              NetID: {profileData.netID}
            </h3>

            <h3 className="text-xl font-semibold">
              {profileData.first_name} {profileData.last_name}
            </h3>

            <div className="mt-3 space-y-1 text-sm text-gray-700">
              <p className="text-xl mb-2">Sex: {profileData.sex}</p>
              <p className="text-xl mb-2">Age: {profileData.age}</p>
              <p className="text-xl mb-2">Height: {profileData.height_cm} cm</p>
              <p className="text-xl mb-2">Weight: {profileData.weight_kg} kg</p>
              <p className="text-xl mb-2">Goal: {profileData.goal}</p>
            </div>

            <div className="mt-4 border-t pt-3">
              <h4 className="font-semibold text-gray-800 mb-2">Meals</h4>

              {mealData
                .filter((meal) => meal.user == profileData.user_id)
                .map((meal) => (
                  <div
                    key={meal.meal_id}
                    className="bg-gray-50 rounded-lg p-3 mb-3 text-sm"
                  >
                    <p className="font-medium">Meal ID: {meal.meal_id}</p>
                    <p>Calories: {meal.total_calories}</p>
                    <p>Protein: {meal.total_protein}</p>
                    <p>Carbs: {meal.total_carbohydrates}</p>
                    <p>Fat: {meal.total_fat}</p>
                    <p className="text-gray-500 text-xs">Date: {meal.date}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-center item-center">
        <Logout></Logout>
      </div>
    </>
  );
}

export default Profiles;
