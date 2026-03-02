import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";

interface ReportData {
  user_info: { netID: string; name: string };
  statistics: {
    total_count: number;
    macros: { labels: string[]; values: number[] };
    categories: { labels: string[]; values: number[] };
  };
  chart_base64: string;
}

function Reports() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("authToken");

    if (!token) {
      navigate("/login");
      return;
    }

    const config = {
      headers: {
        Authorization: `Token ${token}`,
      },
    };

    axios
      .get(`${API_BASE}/meal-reports/`, config)
      .then((res) => setReport(res.data))
      .catch((err) => {
        const status = err.response?.status;
        const message =
          status === 401
            ? "Please log in again."
            : status
              ? `Failed to load report data (${status}). Check console for details.`
              : "Failed to load report data. Check your connection and that the backend URL is correct.";
        console.error("Meal reports fetch failed:", err.message, err.response?.data);
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // 2. Function to handle authenticated downloads
  const handleDownload = async (format: "csv" | "json") => {
    const token = localStorage.getItem("authToken");
    try {
      const response = await axios.get(
        `${API_BASE}/export-meals/?format=${format}`,
        {
          headers: { Authorization: `Token ${token}` },
          responseType: "blob", // Important for file downloads
        },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `meal_report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Failed to download file.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500 text-lg animate-pulse">
          Loading reports...
        </p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-red-500 text-lg">{error || "No data available."}</p>
      </div>
    );
  }

  const { statistics, chart_base64 } = report;

  // 3. Safe calculation for new users with 0 data
  const protein = statistics.macros.values[0] || 0;
  const carbs = statistics.macros.values[1] || 0;
  const fat = statistics.macros.values[2] || 0;
  const totalCalories = protein * 4 + carbs * 4 + fat * 9;

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">
            Meal Reports
          </h1>
          <p className="text-gray-500 mt-1">
            Nutritional insights for {report.user_info.name || "your account"}.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleDownload("csv")}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
          >
            Download CSV
          </button>
          <button
            onClick={() => handleDownload("json")}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
          >
            Download JSON
          </button>
        </div>
      </div>

      {/* Totals Line */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Overall Totals
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {statistics.total_count}
            </p>
            <p className="text-sm text-gray-500">Total Meals</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{protein}g</p>
            <p className="text-sm text-gray-500">Total Protein</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{carbs}g</p>
            <p className="text-sm text-gray-500">Total Carbs</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{fat}g</p>
            <p className="text-sm text-gray-500">Total Fat</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          Estimated total calories:{" "}
          <span className="font-semibold text-gray-600">
            {totalCalories.toFixed(0)} kcal
          </span>
        </p>
      </div>

      {/* Charts and Tables grid... (Same as your previous UI code) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Macronutrient Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Macronutrient Breakdown
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Nutrient</th>
                <th className="text-right py-2">Total (g)</th>
              </tr>
            </thead>
            <tbody>
              {statistics.macros.labels.map((label, i) => (
                <tr key={label} className="border-b border-gray-50">
                  <td className="py-2">{label}</td>
                  <td className="py-2 text-right font-semibold">
                    {statistics.macros.values[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Category Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Meals by Category
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Category</th>
                <th className="text-right py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {statistics.categories.labels.map((label, i) => (
                <tr key={label} className="border-b border-gray-50">
                  <td className="py-2">{label}</td>
                  <td className="py-2 text-right font-semibold">
                    {statistics.categories.values[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {chart_base64 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Visual Distribution
          </h2>
          <img
            src={chart_base64}
            alt="Chart"
            className="w-full max-w-2xl mx-auto"
          />
        </div>
      )}
    </div>
  );
}

export default Reports;
