import { useEffect, useRef } from "react";
import embed from "vega-embed";

const API_BASE = "http://localhost:8000/api";

const barSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  title: "Dishes by Category",
  width: "container",
  height: 350,
  data: { url: `${API_BASE}/dishes-by-category/` },
  mark: "bar",
  encoding: {
    x: { field: "category", type: "nominal" as const, sort: "-y", title: "Category" },
    y: { field: "count", type: "quantitative" as const, title: "Number of Dishes" },
    color: {
      field: "category",
      type: "nominal" as const,
      legend: null,
    },
  },
};

const lineSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  title: "Meals Logged Per Day",
  width: "container",
  height: 350,
  data: { url: `${API_BASE}/meals-per-day/` },
  mark: { type: "line" as const, point: true },
  encoding: {
    x: { field: "date", type: "temporal" as const, title: "Date" },
    y: { field: "count", type: "quantitative" as const, title: "Meals" },
  },
};

function VegaChart({ spec, id }: { spec: object; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const result = embed(containerRef.current, spec as never, {
      actions: { export: true, source: false, compiled: false, editor: true },
      theme: "dark",
    });
    return () => {
      result.then((r) => r.finalize());
    };
  }, [spec]);

  return <div id={id} ref={containerRef} className="w-full" />;
}

function Charts() {
  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
        Vega-Lite Charts
      </h1>
      <p className="text-gray-500 mb-8">
        Interactive charts powered by internal API data.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Bar Chart &mdash; Dishes by Category
          </h2>
          <VegaChart spec={barSpec} id="bar-chart" />
          <p className="text-xs text-gray-400 mt-3">
            Source: <code>/api/dishes-by-category/</code>
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Line Chart &mdash; Meals Per Day
          </h2>
          <VegaChart spec={lineSpec} id="line-chart" />
          <p className="text-xs text-gray-400 mt-3">
            Source: <code>/api/meals-per-day/</code>
          </p>
        </div>
      </div>

      <details className="mt-10 bg-white rounded-xl shadow-sm border p-6">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          Vega-Lite JSON Specifications
        </summary>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-2">Bar Chart Spec</h3>
            <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-auto max-h-64">
              {JSON.stringify(barSpec, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-2">Line Chart Spec</h3>
            <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-auto max-h-64">
              {JSON.stringify(lineSpec, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}

export default Charts;
