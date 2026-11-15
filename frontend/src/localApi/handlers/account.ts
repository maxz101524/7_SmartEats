/** Accounts, profile and daily intake — stored only in this browser. */
import {
  emptyProfile,
  hashPassword,
  localDate,
  mutate,
  newToken,
  readDb,
  type LocalDB,
  type LocalProfile,
  type LocalUser,
} from "../db";
import { getCatalog } from "../staticData";
import { bodyObject, fail, isResponse, ok, requireUser, type Handler } from "../http";

const NUMERIC_PROFILE_FIELDS = new Set([
  "age", "height_cm", "weight_kg", "daily_cal_goal", "daily_protein_goal", "daily_carbs_goal", "daily_fat_goal",
]);
const PROFILE_FIELDS: (keyof LocalProfile)[] = [
  "netID", "sex", "age", "height_cm", "weight_kg", "goal", "activity_level", "daily_cal_goal",
  "daily_protein_goal", "daily_carbs_goal", "daily_fat_goal", "goals_source",
];

function coerce(field: string, value: unknown): string | number | null {
  if (value === "" || value === null || value === undefined) return null;
  if (NUMERIC_PROFILE_FIELDS.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return String(value);
}

function issueToken(db: LocalDB, user: LocalUser): string {
  const token = newToken();
  db.tokens[token] = user.id;
  return token;
}

function createUser(db: LocalDB, fields: Partial<LocalUser> & { username: string }): LocalUser {
  db.seq.user += 1;
  const user: LocalUser = {
    id: db.seq.user,
    email: "",
    first_name: "",
    last_name: "",
    password_hash: "",
    date_joined: new Date().toISOString(),
    profile: emptyProfile(fields.username.includes("@") ? null : fields.username),
    ...fields,
  };
  db.users.push(user);
  return user;
}

export const register: Handler = async (req) => {
  const body = bodyObject(req);
  const netID = String(body.netID ?? "").trim();
  const password = String(body.password ?? "");
  if (!netID || !password) return fail(400, "NetID and password are required.");
  if (readDb().users.some((u) => u.username.toLowerCase() === netID.toLowerCase())) {
    return fail(400, "A user with this NetID already exists.");
  }
  const passwordHash = await hashPassword(netID, password);
  const token = mutate((db) => {
    const user = createUser(db, {
      username: netID,
      email: String(body.email ?? ""),
      first_name: String(body.first_name ?? ""),
      last_name: String(body.last_name ?? ""),
      password_hash: passwordHash,
    });
    for (const field of ["sex", "age", "height_cm", "weight_kg", "goal"] as const) {
      (user.profile as unknown as Record<string, unknown>)[field] = coerce(field, body[field]);
    }
    return issueToken(db, user);
  });
  return ok({ token, message: "User created successfully!" }, 201);
};

export const login: Handler = async (req) => {
  const body = bodyObject(req);
  const netID = String(body.netID ?? "").trim();
  const passwordHash = await hashPassword(netID, String(body.password ?? ""));
  const user = readDb().users.find(
    (u) => u.username.toLowerCase() === netID.toLowerCase() && u.password_hash === passwordHash,
  );
  if (!user) return fail(400, "Invalid NetID or Password");
  const token = mutate((db) => issueToken(db, user));
  return ok({
    token,
    first_name: user.first_name,
    last_name: user.last_name,
    netID: user.profile.netID,
    goal: user.profile.goal,
  });
};

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.from(atob(part), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Google sign-in without a server: the ID token from Google Identity Services
 * is decoded (not verified) only to create a browser-local profile.
 */
export const googleLogin: Handler = (req) => {
  const idToken = String(bodyObject(req).id_token ?? "");
  const claims = idToken ? decodeJwtPayload(idToken) : null;
  const email = claims?.email ? String(claims.email) : "";
  if (!email) return fail(400, "Email not found in token");
  const result = mutate((db) => {
    let user = db.users.find((u) => u.email === email);
    if (!user) {
      user = createUser(db, {
        username: email,
        email,
        first_name: String(claims?.given_name ?? ""),
        last_name: String(claims?.family_name ?? ""),
      });
    }
    return { user, token: issueToken(db, user) };
  });
  const { user, token } = result;
  return ok({
    key: token,
    user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
  });
};

/* ── Demo account: a pre-filled profile so visitors can try everything in one click ── */

const DEMO_USERNAME = "demo";

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export const demoLogin: Handler = async () => {
  const { menu, hallsById } = await getCatalog();
  const result = mutate((db) => {
    let user = db.users.find((u) => u.username === DEMO_USERNAME);
    if (!user) {
      user = createUser(db, { username: DEMO_USERNAME, first_name: "Demo", last_name: "Student" });
      user.profile = {
        ...user.profile,
        sex: "male",
        age: 20,
        height_cm: 178,
        weight_kg: 72,
        goal: "muscle_gain",
        activity_level: "moderate",
        daily_cal_goal: 2800,
        daily_protein_goal: 150,
        daily_carbs_goal: 350,
        daily_fat_goal: 85,
        goals_source: "ai",
      };

      const withNutrition = menu.dishes.filter((d) => d.calories > 0 && d.protein > 0);
      const byPeriod = (period: string) =>
        withNutrition.filter((d) => d.meal_period.toLowerCase().includes(period));
      const pools: [string, typeof withNutrition][] = [
        ["Breakfast", byPeriod("breakfast")],
        ["Lunch", byPeriod("lunch")],
        ["Dinner", byPeriod("dinner")],
      ];
      const rand = seededRandom(42);
      const today = new Date();
      for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
        const day = new Date(today);
        day.setDate(today.getDate() - daysAgo);
        const meals = daysAgo === 0 ? pools.slice(0, 1) : pools.filter(() => rand() > 0.15);
        for (const [category, pool] of meals) {
          const source = pool.length ? pool : withNutrition;
          const dishes = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => source[Math.floor(rand() * source.length)]);
          const unique = [...new Map(dishes.map((d) => [d.dish_id, d])).values()];
          db.seq.meal += 1;
          db.meals.push({
            meal_id: db.seq.meal,
            user: user.id,
            category,
            total_calories: dishes.reduce((s, d) => s + d.calories, 0),
            total_protein: dishes.reduce((s, d) => s + d.protein, 0),
            total_carbohydrates: dishes.reduce((s, d) => s + d.carbohydrates, 0),
            total_fat: dishes.reduce((s, d) => s + d.fat, 0),
            date: localDate(day),
            dishes: unique.map((d) => ({
              dish_id: d.dish_id,
              dish_name: d.dish_name,
              hall_name: hallsById.get(d.dining_hall)?.name ?? "",
            })),
          });
        }
      }
    }
    return { user, token: issueToken(db, user) };
  });
  return ok({ token: result.token, first_name: result.user.first_name, netID: DEMO_USERNAME });
};

/* ── Profile ── */

export const getProfile: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  return ok({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    ...user.profile,
    date_joined: user.date_joined,
  });
};

export const updateProfile: Handler = (req) => {
  const current = requireUser(req);
  if (isResponse(current)) return current;
  const data = bodyObject(req);
  mutate((db) => {
    const user = db.users.find((u) => u.id === current.id);
    if (!user) return;
    if ("first_name" in data) user.first_name = String(data.first_name ?? "");
    if ("last_name" in data) user.last_name = String(data.last_name ?? "");
    for (const field of PROFILE_FIELDS) {
      if (field in data) (user.profile as unknown as Record<string, unknown>)[field] = coerce(field, data[field]);
    }
  });
  return ok({ message: "Profile updated" });
};

export const listProfiles: Handler = () => ok([]);

/* ── Daily intake / history ── */

export const dailyIntake: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  const today = localDate();
  const meals = readDb().meals.filter((m) => m.user === user.id && m.date === today);
  const p = user.profile;
  const goalsSet = p.daily_cal_goal !== null && p.daily_cal_goal !== undefined;
  return ok({
    consumed: {
      calories: meals.reduce((s, m) => s + m.total_calories, 0),
      protein: meals.reduce((s, m) => s + m.total_protein, 0),
      carbs: meals.reduce((s, m) => s + m.total_carbohydrates, 0),
      fat: meals.reduce((s, m) => s + m.total_fat, 0),
    },
    goals: goalsSet
      ? { calories: p.daily_cal_goal, protein: p.daily_protein_goal, carbs: p.daily_carbs_goal, fat: p.daily_fat_goal }
      : null,
    goals_set: goalsSet,
  });
};

export const dailyHistory: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  const days = Math.min(Math.max(Number(req.query.get("days") ?? 7) || 7, 1), 365);
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = localDate(start);
  const byDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const meal of readDb().meals) {
    if (meal.user !== user.id || meal.date < startDate) continue;
    const row = byDay.get(meal.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    row.calories += meal.total_calories;
    row.protein += meal.total_protein;
    row.carbs += meal.total_carbohydrates;
    row.fat += meal.total_fat;
    byDay.set(meal.date, row);
  }
  return ok([...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, ...row })));
};
