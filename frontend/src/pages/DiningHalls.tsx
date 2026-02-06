import DataList from "../components/DataList";

interface DiningHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
}

function DiningHalls() {
  return (
    <DataList<DiningHall>
      endpoint="http://localhost:8000/api/halls/"
      title="Dining Halls"
      subtitle="Browse UIUC campus dining locations"
      emptyTitle="No dining halls available"
      emptyMessage="Dining hall information has not been added yet. Check back later."
      getKey={(hall) => hall.Dining_Hall_ID}
      renderCard={(hall) => (
        <>
          <h3 className="card-title">{hall.name}</h3>
          <p className="card-detail">
            <span className="card-label">Location:</span> {hall.location}
          </p>
        </>
      )}
    />
  );
}

export default DiningHalls;
