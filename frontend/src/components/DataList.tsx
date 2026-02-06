import { useEffect, useState, ReactNode } from "react";
import axios from "axios";
import "../pages/pages.css";

interface DataListProps<T> {
  endpoint: string;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyMessage: string;
  renderCard: (item: T) => ReactNode;
  getKey: (item: T) => string | number;
}

function DataList<T>({
  endpoint,
  title,
  subtitle,
  emptyTitle,
  emptyMessage,
  renderCard,
  getKey,
}: DataListProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(endpoint)
      .then((res) => setData(res.data))
      .catch((err) => console.error(`Error fetching from ${endpoint}:`, err))
      .finally(() => setLoading(false));
  }, [endpoint]);

  if (loading) {
    return <div className="page-loading">Loading {title.toLowerCase()}...</div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>

      {data.length === 0 ? (
        <div className="empty-state">
          <h2>{emptyTitle}</h2>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="card-grid">
          {data.map((item) => (
            <div key={getKey(item)} className="card">
              {renderCard(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DataList;
