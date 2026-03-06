import { useEffect, useState } from "react";

// Define an interface for your Hall data based on your API structure
interface Hall {
  id: number;
  name: string;
  // add other fields here
}

export const HallMonitor = () => {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHalls = async () => {
    try {
      // Note: Cleaned up the double slash to /api/halls/
      const response = await fetch(
        "https://seven-smarteats.onrender.com/api/halls/",
      );
      const data = await response.json();
      setHalls(data);
      setLoading(false);
      console.log("Halls updated:", new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Error fetching halls:", error);
    }
  };

  useEffect(() => {
    // 1. Fetch immediately on mount
    fetchHalls();

    // 2. Set up the 2-minute interval
    const intervalId = setInterval(fetchHalls, 120_000);

    // 3. CLEANUP: This is crucial. It stops the timer if the user
    // navigates away or the component unmounts.
    return () => clearInterval(intervalId);
  }, []);

  if (loading) return <p>Loading SmartEats data...</p>;

  return (
    <div>
      <h2>Dining Halls</h2>
      <ul>
        {halls.map((hall) => (
          <li key={hall.id}>{hall.name}</li>
        ))}
      </ul>
    </div>
  );
};
