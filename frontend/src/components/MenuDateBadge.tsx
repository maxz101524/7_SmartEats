import { useEffect, useState } from "react";
import { DATA_MODE } from "../config";
import { getCatalog } from "../localApi/staticData";

function centralToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * "Live dining menus" pill. In static mode it reflects the date of the last
 * scraped menu, so a stale snapshot (e.g. during breaks) is labelled honestly.
 */
export default function MenuDateBadge() {
  const [menuDate, setMenuDate] = useState<string | null | undefined>(
    DATA_MODE === "static" ? undefined : null,
  );

  useEffect(() => {
    if (DATA_MODE !== "static") return;
    getCatalog()
      .then(({ menu }) => setMenuDate(menu.menu_date))
      .catch(() => setMenuDate(null));
  }, []);

  const isToday = !menuDate || menuDate === centralToday();
  const label =
    menuDate === undefined ? "Dining menus" : isToday ? "Live dining menus" : `Menu from ${formatDate(menuDate!)}`;

  return (
    <div
      title={isToday ? "Refreshed daily from UIUC Dining" : "Showing the most recent menu UIUC Dining published"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: "var(--se-radius-full)",
        background: "var(--se-bg-elevated)",
        color: "var(--se-text-secondary)",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        border: "1px solid var(--se-border)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isToday ? "var(--se-success)" : "var(--se-warning)",
          marginRight: 8,
        }}
      />
      {label}
    </div>
  );
}
