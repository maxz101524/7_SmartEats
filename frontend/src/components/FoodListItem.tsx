/**
 * FoodListItem — §5.2 of DESIGN_SYSTEM_SMARTEATS.md
 *
 * Uses FoodIcon for automatic icon resolution (keyword → category → letter pill).
 * Updated: shows 4 macro badges, dietary flags, and serving size.
 */

import { FoodIcon } from "./FoodIcon";
import type { FoodCategory } from "./FoodIcon";

interface FoodListItemProps {
  dishName: string;
  category?: FoodCategory | string;
  /** Shown in subtitle — station name */
  servingUnit?: string;
  /** Human-readable serving size, e.g. "1 piece (~170g)" */
  servingSize?: string;
  /** Fallback subtitle label (hall name or category) */
  hallName?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  dietaryFlags?: string[];
  onAdd?: () => void;
  added?: boolean;
}

const FLAG_COLORS: Record<string, { bg: string; text: string }> = {
  Vegetarian: { bg: "#dcfce7", text: "#16a34a" },
  Vegan: { bg: "#d1fae5", text: "#059669" },
  Halal: { bg: "#dbeafe", text: "#2563eb" },
  Jain: { bg: "#fef9c3", text: "#a16207" },
};

export function FoodListItem({
  dishName,
  category,
  servingUnit,
  servingSize,
  hallName,
  calories,
  protein,
  carbohydrates,
  fat,
  dietaryFlags,
  onAdd,
  added = false,
}: FoodListItemProps) {
  const subtitleParts = [servingUnit || category || hallName, servingSize].filter(Boolean);
  const subtitle = subtitleParts.join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 min-h-[56px] py-2 border-b border-[var(--se-border)] last:border-b-0 hover:bg-[var(--se-bg-subtle)] transition-colors duration-100">

      {/* Icon container — 40×40 subtle rounded square */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-[var(--se-radius-md)] flex items-center justify-center"
        style={{ background: "var(--se-bg-subtle)" }}
      >
        <FoodIcon dishName={dishName} category={category as FoodCategory} size="md" />
      </div>

      {/* Name + subtitle + dietary flags */}
      <div className="flex-1 min-w-0">
        <p
          className="text-base font-medium truncate leading-snug"
          style={{ color: "var(--se-text-main)" }}
        >
          {dishName}
        </p>
        {subtitle && (
          <p
            className="text-xs mt-0.5 leading-snug"
            style={{ color: "var(--se-text-muted)" }}
          >
            {subtitle}
          </p>
        )}
        {dietaryFlags && dietaryFlags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {dietaryFlags.map((flag) => {
              const colors = FLAG_COLORS[flag] || { bg: "var(--se-bg-subtle)", text: "var(--se-text-muted)" };
              return (
                <span
                  key={flag}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {flag}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Macro badges — up to 4: calories + protein + carbs + fat */}
      <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
        {calories !== undefined && (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{
              background: "var(--se-primary-dim)",
              color: "var(--se-macro-cal)",
            }}
          >
            {calories} kcal
          </span>
        )}
        {protein !== undefined && (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{
              background: "var(--se-info-dim)",
              color: "var(--se-macro-protein)",
            }}
          >
            {protein}g P
          </span>
        )}
        {carbohydrates !== undefined && (
          <span
            className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap hidden sm:inline"
            style={{
              background: "var(--se-warning-dim)",
              color: "var(--se-macro-carbs)",
            }}
          >
            {carbohydrates}g C
          </span>
        )}
        {fat !== undefined && (
          <span
            className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap hidden sm:inline"
            style={{
              background: "#fff1eb",
              color: "var(--se-macro-fat)",
            }}
          >
            {fat}g F
          </span>
        )}
      </div>

      {/* Add / added button */}
      {onAdd !== undefined && (
        <button
          onClick={onAdd}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-150 hover:bg-[var(--se-primary-dim)] focus-visible:outline-2 focus-visible:outline-[var(--se-primary)]"
          aria-label={added ? "Added to meal" : "Add to meal"}
        >
          {added ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 5" stroke="var(--se-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="var(--se-primary)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
