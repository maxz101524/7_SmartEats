export type MessageRole = "user" | "ai";

export interface RecommendedDish {
  dish_id: number;
  dish_name: string;
  reason: string;
  dining_hall_name?: string;
  hall_name?: string;
  serving_unit?: string;
  serving_size?: string;
  meal_period?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  quantity?: number;
}

export interface MealPlan {
  title: string;
  summary?: string;
  note?: string;
  action_label?: string;
  items: RecommendedDish[];
  totals?: { calories: number; protein: number; carbohydrates: number; fat: number };
  remaining_after?: { calories: number; protein: number; carbohydrates: number; fat: number };
}

export interface Message {
  id: number;
  role: MessageRole;
  text: string;
  recommendedDishes?: RecommendedDish[];
  mealPlan?: MealPlan;
  followUpSuggestions?: string[];
  error?: boolean;
  aborted?: boolean;
}

export interface ConvoSummary {
  id: number;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface ConvoDetail {
  id: number;
  title: string;
  updated_at: string;
  messages: ServerMessage[];
}

export interface ServerMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  metadata: {
    recommended_dishes?: RecommendedDish[];
    meal_plan?: MealPlan;
    follow_up_suggestions?: string[];
  };
  created_at: string;
}

export interface AiChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  tray_context?: unknown;
  conversation_id?: number | null;
  regenerate?: boolean;
  session_id?: string;
  request_id?: string;
}

export interface AiChatResponse {
  response: string;
  recommended_dishes?: RecommendedDish[];
  meal_plan?: MealPlan;
  follow_up_suggestions?: string[];
  conversation_id?: number;
  title?: string;
  error?: string;
}
