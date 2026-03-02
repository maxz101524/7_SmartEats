import { useState } from "react";
import ShowData from "../components/ShowData";
import { API_BASE } from "../config";

import { useNavigate } from "react-router-dom";

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

interface DiningHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
  dishes: Dish[];
}

function DiningHalls() {
  const navigate = useNavigate();
  const [selectedHall, setSelectedHall] = useState<DiningHall | null>(null);

  return (
    <div className="relative">
      <ShowData<DiningHall>
        api={`${API_BASE}/halls/`}
        getKey={(hall) => hall.Dining_Hall_ID}
        title="Dining Halls"
        renderCard={(hall) => (
          <div
            onClick={() => setSelectedHall(hall)}
            className="p-6 border rounded-xl bg-white shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
          >
            <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-600">
              {hall.name}
            </h3>
            <p className="text-gray-500">{hall.location}</p>
            <p className="text-blue-500 text-sm mt-4 font-medium">
              View Menu →
            </p>
          </div>
        )}
      />

      {selectedHall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={() => setSelectedHall(null)}
          ></div>

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-2xl font-bold text-blue-700">
                  {selectedHall.name}
                </h2>
                <p className="text-sm text-gray-500">{selectedHall.location}</p>
              </div>
              <button
                onClick={() => setSelectedHall(null)}
                className="text-gray-400 hover:text-gray-600 p-2 cursor-pointer"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Available Dishes
              </h4>

              {selectedHall.dishes && selectedHall.dishes.length > 0 ? (
                selectedHall.dishes.map((dish) => (
                  <div
                    key={dish.dish_id}
                    className="p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="font-bold text-gray-800">
                        {dish.dish_name}
                      </h5>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">
                        {dish.calories} kcal
                      </span>
                    </div>

                    <div className="flex gap-4 text-xs font-semibold text-gray-500">
                      <div className="flex flex-col">
                        <span>Protein</span>
                        <span className="text-gray-900">{dish.protein}g</span>
                      </div>
                      <div className="flex flex-col">
                        <span>Carbs</span>
                        <span className="text-gray-900">
                          {dish.carbohydrates}g
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span>Fat</span>
                        <span className="text-gray-900">{dish.fat}g</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <p>No dishes found for this location.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setSelectedHall(null)}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DiningHalls;
