import DataList from "../components/DataList";

interface UserProfile {
  netID: string;
  name: string;
  lastName: string;
  sex: string | null;
  age: number | null;
  height_cm: string | null;
  weight_kg: string | null;
  goal: string | null;
}

const goalLabels: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
};

function Profiles() {
  return (
    <DataList<UserProfile>
      endpoint="http://localhost:8000/api/profiles/"
      title="User Profiles"
      subtitle="Registered SmartEats users"
      emptyTitle="No profiles yet"
      emptyMessage="No users have registered for SmartEats. Be the first to sign up!"
      getKey={(profile) => profile.netID}
      renderCard={(profile) => (
        <>
          <h3 className="card-title">
            {profile.name} {profile.lastName}
          </h3>
          <p className="card-detail">
            <span className="card-label">NetID:</span> {profile.netID}
          </p>
          {profile.age && (
            <p className="card-detail">
              <span className="card-label">Age:</span> {profile.age}
            </p>
          )}
          {profile.height_cm && (
            <p className="card-detail">
              <span className="card-label">Height:</span> {profile.height_cm} cm
            </p>
          )}
          {profile.weight_kg && (
            <p className="card-detail">
              <span className="card-label">Weight:</span> {profile.weight_kg} kg
            </p>
          )}
          {profile.goal && (
            <p className="card-detail">
              <span className="card-label">Goal:</span>{" "}
              {goalLabels[profile.goal] || profile.goal}
            </p>
          )}
        </>
      )}
    />
  );
}

export default Profiles;
