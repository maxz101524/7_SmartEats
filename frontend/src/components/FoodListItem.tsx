/**
 * FoodListItem — §5.2 of DESIGN_SYSTEM_SMARTEATS.md
 *
 * Uses FoodIcon for automatic icon resolution (keyword → category → letter pill).
 */

import { FoodIcon } from "./FoodIcon";
import type { FoodCategory } from "./FoodIcon";

interface FoodListItemProps {
  dishName: string;
  category?: FoodCategory | string;
  /** Shown in subtitle as "Category · Hall" */
  hallName?: string;
  calories?: number;
  protein?: number;
  onAdd?: () => void;
  added?: boolean;
}

export function FoodListItem({
  dishName,
  category,
  hallName,
  calories,
  protein,
  onAdd,
  added = false,
}: FoodListItemProps) {
  const subtitle = [category, hallName].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 min-h-[56px] py-2 border-b border-[var(--se-border)] last:border-b-0 hover:bg-[var(--se-bg-subtle)] transition-colors duration-100">

      {/* Icon container — 40×40 subtle rounded square */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-[var(--se-radius-md)] flex items-center justify-center"
        style={{ background: "var(--se-bg-subtle)" }}
      >
        <FoodIcon dishName={dishName} category={category as FoodCategory} size="md" />
      </div>

      {/* Name + subtitle */}
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
      </div>

      {/* Macro badges — max 2: calories + protein */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
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
