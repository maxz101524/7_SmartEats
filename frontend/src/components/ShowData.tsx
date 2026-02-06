import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import axios from "axios";

interface DataListProps<T> {
  api: string;
  title: string;
  renderCard: (item: T) => ReactNode;
  getKey: (item: T) => string | number;
}

function ShowData<T>({ api, title, renderCard, getKey }: DataListProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(api)
      .then((res) => setData(res.data))
      .catch((err) => console.error(`Error fetching from ${api}:`, err))
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium animate-pulse">
          Loading {title.toLowerCase()}...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 border-b pb-4">
        {title}
      </h1>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <h2 className="text-xl font-semibold text-gray-400">
            No {title.toLowerCase()} found
          </h2>
          <p className="text-gray-500">Check back later for updates!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map((item) => (
            <div
              key={getKey(item)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-300 overflow-hidden"
            >
              {renderCard(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ShowData;
