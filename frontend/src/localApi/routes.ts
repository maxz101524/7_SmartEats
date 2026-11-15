/** Route table mirroring backend/mealPlanning/urls.py. */
import type { Handler } from "./http";
import * as account from "./handlers/account";
import * as ai from "./handlers/ai";
import * as analytics from "./handlers/analytics";
import * as catalog from "./handlers/catalog";
import * as meals from "./handlers/meals";
import { semanticSearch } from "./handlers/search";

type Route = [method: string, pattern: RegExp, handler: Handler];

export const routes: Route[] = [
  ["GET", /^\/halls\/$/, catalog.listHalls],
  ["GET", /^\/hall-status\/$/, catalog.hallStatus],
  ["GET", /^\/dishes\/$/, catalog.listDishes],
  ["GET", /^\/dishes\/(\d+)\/?$/, catalog.dishDetail],
  ["GET", /^\/dish-stats\/$/, catalog.dishStats],
  ["GET", /^\/dishes-by-category\/$/, catalog.dishesByCategory],
  ["GET", /^\/dishes-manage\/$/, catalog.manageDishesList],
  ["POST", /^\/dishes-manage\/$/, catalog.manageDishesCreate],

  ["POST", /^\/login\/$/, account.login],
  ["POST", /^\/register\/$/, account.register],
  ["POST", /^\/google-login\/$/, account.googleLogin],
  ["POST", /^\/demo-login\/$/, account.demoLogin],
  ["GET", /^\/profile\/$/, account.getProfile],
  ["PUT", /^\/profile\/$/, account.updateProfile],
  ["PATCH", /^\/profile\/$/, account.updateProfile],
  ["GET", /^\/profiles\/$/, account.listProfiles],
  ["GET", /^\/daily-intake\/$/, account.dailyIntake],
  ["GET", /^\/daily-history\/$/, account.dailyHistory],

  ["GET", /^\/meals\/$/, meals.listMeals],
  ["POST", /^\/meals\/$/, meals.createMeal],
  ["GET", /^\/meals-per-day\/$/, meals.mealsPerDay],
  ["GET", /^\/meal-reports\/$/, meals.mealReports],
  ["GET", /^\/export-meals\/$/, meals.exportMeals],

  ["POST", /^\/ai-chat\/$/, ai.aiChat],
  ["GET", /^\/conversations\/$/, ai.listConversations],
  ["POST", /^\/conversations\/$/, ai.createConversation],
  ["GET", /^\/conversations\/(\d+)\/$/, ai.getConversation],
  ["PATCH", /^\/conversations\/(\d+)\/$/, ai.renameConversation],
  ["DELETE", /^\/conversations\/(\d+)\/$/, ai.deleteConversation],
  ["POST", /^\/ai-recommend\/$/, ai.aiRecommend],
  ["POST", /^\/nutrition-estimate\/$/, ai.nutritionEstimate],
  ["POST", /^\/analytics\/event\/$/, ai.analyticsEvent],
  ["GET", /^\/semantic-search\/$/, semanticSearch],

  ["GET", /^\/analytics\/performance\/latency-by-bucket\/$/, analytics.latencyByBucket],
  ["GET", /^\/analytics\/performance\/latency-distribution\/$/, analytics.latencyDistribution],
  ["GET", /^\/analytics\/performance\/latency-trend\/$/, analytics.latencyTrend],
  ["GET", /^\/analytics\/behavior\/dau\/$/, analytics.behaviorDau],
  ["GET", /^\/analytics\/behavior\/intents\/$/, analytics.behaviorIntents],
  ["GET", /^\/analytics\/behavior\/conversion\/$/, analytics.behaviorConversion],
  ["GET", /^\/analytics\/cost\/summary\/$/, analytics.costSummary],
  ["GET", /^\/analytics\/cost\/top-queries\/$/, analytics.costTopQueries],
  ["GET", /^\/analytics\/cost\/input-vs-tokens\/$/, analytics.costInputVsTokens],
];

export function matchRoute(method: string, path: string): { handler: Handler; params: string[] } | null {
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const match = pattern.exec(path);
    if (match) return { handler, params: match.slice(1) };
  }
  return null;
}
