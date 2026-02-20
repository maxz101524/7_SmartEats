import { useEffect, useState } from "react";
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

  useEffect(() => {
    axios
      .get(`${API_BASE}/meal-reports/`)
      .then((res) => setReport(res.data))
      .catch(() => setError("Failed to load report data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500 text-lg">Loading reports...</p>
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
  const totalCalories =
    statistics.macros.values.reduce((a, b) => a + b, 0) > 0
      ? statistics.macros.values[0] * 4 +
        statistics.macros.values[1] * 4 +
        statistics.macros.values[2] * 9
      : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">
            Meal Reports
          </h1>
          <p className="text-gray-500 mt-1">
            Summary and export options for meal history.
          </p>
        </div>

        <div className="flex gap-3">
          <a
            href={`${API_BASE}/export-meals/?format=csv`}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
          >
            Download CSV
          </a>
          <a
            href={`${API_BASE}/export-meals/?format=json`}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
          >
            Download JSON
          </a>
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
            <p className="text-3xl font-bold text-gray-900">
              {statistics.macros.values[0]}g
            </p>
            <p className="text-sm text-gray-500">Total Protein</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {statistics.macros.values[1]}g
            </p>
            <p className="text-sm text-gray-500">Total Carbs</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {statistics.macros.values[2]}g
            </p>
            <p className="text-sm text-gray-500">Total Fat</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          Estimated total calories: <span className="font-semibold text-gray-600">{totalCalories} kcal</span>
        </p>
      </div>

      {/* Grouped Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Macronutrient Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Macronutrient Breakdown
          </h2>
          {statistics.macros.labels.length === 0 ? (
            <p className="text-gray-400 text-sm">No macronutrient data recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-gray-600">Nutrient</th>
                  <th className="text-right py-2 text-gray-600">Total (g)</th>
                </tr>
              </thead>
              <tbody>
                {statistics.macros.labels.map((label, i) => (
                  <tr key={label} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{label}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      {statistics.macros.values[i]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Category Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Meals by Category
          </h2>
          {statistics.categories.labels.length === 0 ? (
            <p className="text-gray-400 text-sm">No category data recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-gray-600">Category</th>
                  <th className="text-right py-2 text-gray-600">Count</th>
                </tr>
              </thead>
              <tbody>
                {statistics.categories.labels.map((label, i) => (
                  <tr key={label} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{label}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      {statistics.categories.values[i]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Chart Image */}
      {chart_base64 && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Distribution Charts
          </h2>
          <img
            src={chart_base64}
            alt="Meal distribution charts"
            className="w-full max-w-3xl mx-auto rounded-lg"
          />
        </div>
      )}

      {/* Export Section */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Export Data
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Download your meal history in CSV or JSON format. Files include
          timestamped filenames and all recorded meal data.
        </p>
        <div className="flex gap-3">
          <a
            href={`${API_BASE}/export-meals/?format=csv`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download CSV
          </a>
          <a
            href={`${API_BASE}/export-meals/?format=json`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download JSON
          </a>
        </div>
      </div>
    </div>
  );
}

export default Reports;
