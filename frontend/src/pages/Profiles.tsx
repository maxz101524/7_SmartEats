import { useState, useEffect } from "react";
import axios from "axios";
import Empty from "../components/Empty";
import { API_BASE } from "../config";

interface UserProfile {
  netID: string;
  name: string;
  lastName: string;

  sex?: string;
  age?: number;

  height_cm?: string | number | null;
  weight_kg?: string | number | null;

  goal?: string;
  detail_url: string; // from model's get_absolute_url()
}

interface Meal {
  meal_id: number;

  total_calories: number;
  total_protein: number;
  total_carbohydrates: number;
  total_fat: number;

  contain_dish: any; //fix later

  user_id: UserProfile | string;

  date: string;
}

function Profiles() {
  const [profileData, setProfileData] = useState<UserProfile[]>([]);
  const [mealData, setMealData] = useState<Meal[]>([]);

  useEffect(() => {
    axios
      .get(`${API_BASE}/profiles/`)
      .then((result) => setProfileData(result.data))
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
    axios
      .get(`${API_BASE}/meals/`)
      .then((result) => setMealData(result.data))
      .catch((err) => console.log(err));
  }, []);

  return (
    <>
      <h1 className="text-center font-bold text-3xl text-blue-400">Profiles</h1>

      {profileData.length === 0 ? (
        <Empty name="Profiles" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {profileData.map((profile) => (
            <div
              key={profile.netID}
              className="bg-white shadow-lg rounded-2xl p-5 border hover:shadow-xl transition"
            >
              <h3 className="text-lg font-bold text-blue-600">
                NetID: {profile.netID}
              </h3>

              <h3 className="text-xl font-semibold">
                {profile.name} {profile.lastName}
              </h3>

              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <p>Sex: {profile.sex}</p>
                <p>Age: {profile.age}</p>
                <p>Height: {profile.height_cm} cm</p>
                <p>Weight: {profile.weight_kg} kg</p>
                <p>Goal: {profile.goal}</p>
              </div>

              {/* Uses model-driven URL from get_absolute_url() instead of manually building the path */}
              {/* <a
                href={`${BACKEND_BASE}${profile.detail_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                View Profile Details
              </a> */}

              <div className="mt-4 border-t pt-3">
                <h4 className="font-semibold text-gray-800 mb-2">Meals</h4>

                {mealData
                  .filter((meal) => meal.user_id == profile.netID)
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
          ))}
        </div>
      )}
    </>
  );
}

export default Profiles;
