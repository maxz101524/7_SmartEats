import ShowData from "../components/ShowData";
import { API_BASE } from "../config";

interface DiningHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
}

function DiningHalls() {
  return (
    <ShowData<DiningHall>
      api={`${API_BASE}/halls/`}
      getKey={(hall) => hall.Dining_Hall_ID}
      title="Dining Halls"
      renderCard={(hall) => (
        <div className="p-6 border-1 ">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold text-gray-800 leading-tight">
              {hall.name}
            </h3>
          </div>
          <div>
            <h4>{hall.location}</h4>
          </div>
        </div>
      )}
    />
  );
}

export default DiningHalls;
