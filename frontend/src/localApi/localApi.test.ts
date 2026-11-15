import { describe, expect, it } from "vitest";
import {
  buildGoalMealPlan,
  buildMenuContext,
  buildOfflineResponse,
  parseModelResponse,
  type MenuDish,
  type MenuFile,
} from "../lib/chatCore";
import { parseQueryIntent } from "./handlers/search";
import { matchRoute } from "./routes";

function dish(overrides: Partial<MenuDish>): MenuDish {
  return {
    dish_id: 1, dish_name: "Dish", dining_hall: 1, category: "", calories: 300, protein: 10,
    carbohydrates: 30, fat: 10, fiber: null, sodium: null, allergens: [], dietary_flags: [],
    nutrition_source: "ai_generated", ai_confidence: "high", meal_period: "Dinner", course: "",
    serving_unit: "", serving_size: "1 piece", uiuc_item_id: null, last_seen: "2026-11-15",
    ...overrides,
  };
}

const menu: MenuFile = {
  generated_at: "2026-11-15T10:00:00Z",
  menu_date: "2026-11-15",
  halls: [{ Dining_Hall_ID: 1, name: "Ikenberry Dining Center", location: "", option_id: 1 }],
  dishes: [
    dish({ dish_id: 1, dish_name: "Grilled Chicken Breast", calories: 310, protein: 52, carbohydrates: 1, fat: 8 }),
    dish({ dish_id: 2, dish_name: "Chocolate Muffin", calories: 480, protein: 6, carbohydrates: 65, fat: 21 }),
    dish({ dish_id: 3, dish_name: "Old Menu Tofu", protein: 30, last_seen: "2026-04-01" }),
  ],
};

describe("chatCore", () => {
  it("only uses today's menu and ranks protein first for protein requests", () => {
    const ctx = buildMenuContext(menu, "high protein dinner");
    expect([...ctx.dishLookup.keys()]).toEqual([1, 2]);
    expect(ctx.dishListText.split("\n")[0]).toContain("Grilled Chicken Breast");
  });

  it("builds a grounded meal plan for remaining-goal requests", () => {
    const userContext = { name: "Sam Lee", today_remaining_goals: { calories: 800, protein: 90, carbohydrates: 60, fat: 30 } };
    const ctx = buildMenuContext(menu, "help me hit my remaining protein goal", userContext);
    const plan = buildGoalMealPlan("help me hit my remaining protein goal", userContext, ctx);
    expect(plan?.meal_plan?.items[0]).toMatchObject({ dish_id: 1, quantity: 2 });
    expect(plan?.meal_plan?.totals.protein).toBe(104);
    expect(plan?.response.startsWith("Sam,")).toBe(true);
  });

  it("drops model recommendations that are not on the menu", () => {
    const ctx = buildMenuContext(menu, "dinner");
    const text = JSON.stringify({
      response: "Try these.",
      recommended_dishes: [
        { dish_id: 1, dish_name: "Grilled Chicken Breast", reason: "lean" },
        { dish_id: 99, dish_name: "Invented Steak", reason: "made up" },
      ],
      follow_up_suggestions: ["Show vegan lunches", "Can you tell me more?"],
    });
    const result = parseModelResponse(text, ctx, { model_name: "m", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, token_source: "x" });
    expect(result?.recommended_dishes.map((d) => d.dish_id)).toEqual([1]);
    expect(result?.follow_up_suggestions).toEqual(["Show vegan lunches"]);
  });

  it("answers from menu data when the model is unavailable", () => {
    const result = buildOfflineResponse("protein", undefined, buildMenuContext(menu, "protein"));
    expect(result._meta.model_name).toBe("offline_ranker");
    expect(result.recommended_dishes[0].dish_id).toBe(1);
  });
});

describe("semantic search intent parsing", () => {
  it("extracts hard filters and soft preferences", () => {
    const intent = parseQueryIntent("vegan dinner under 500 calories without nuts");
    expect([...intent.required_flags]).toEqual(["vegan"]);
    expect(intent.meal_period).toBe("dinner");
    expect(intent.max_calories).toBe(500);
    expect([...intent.excluded_allergens].sort()).toEqual(["peanuts", "tree nuts"]);
    expect(intent.soft_preferences.has("low_calorie")).toBe(true);
    expect(intent.semantic_query).not.toMatch(/500|nuts/);
  });
});

describe("local API routes", () => {
  it("matches the Django URL patterns", () => {
    expect(matchRoute("GET", "/dishes/42")?.params).toEqual(["42"]);
    expect(matchRoute("PATCH", "/conversations/7/")?.params).toEqual(["7"]);
    expect(matchRoute("GET", "/chat")).toBeNull();
  });
});
