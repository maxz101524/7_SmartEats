/**
 * FoodIcon — §4 of DESIGN_SYSTEM_SMARTEATS.md
 *
 * Resolution order:
 *  1. Keyword match  → specific OpenMoji SVG (dish name contains a known keyword)
 *  2. Category match → category's representative OpenMoji SVG
 *  3. Letter pill    → first letter of dish name, deterministic accent color
 *
 * SVGs live in /public/icons/food/{unicode}.svg, served statically by Vite.
 */

export type FoodCategory =
  | "fruit"
  | "vegetable"
  | "grain"
  | "protein"
  | "dairy"
  | "dessert"
  | "drink"
  | "soup"
  | "other";

interface FoodIconProps {
  dishName: string;
  category?: FoodCategory | string;
  /** sm = 20px · md = 28px · lg = 40px */
  size?: "sm" | "md" | "lg";
  className?: string;
}

// ─── Category → SVG code ──────────────────────────────────────────────────────

const categoryIconMap: Record<string, string> = {
  fruit:     "1F34E", // 🍎
  vegetable: "1F966", // 🥦
  grain:     "1F35E", // 🍞
  protein:   "1F357", // 🍗
  dairy:     "1F9C0", // 🧀
  dessert:   "1F370", // 🍰
  drink:     "1F95B", // 🥛
  soup:      "1F372", // 🍲
  other:     "1F37D", // 🍽
};

// ─── Keyword → SVG code ───────────────────────────────────────────────────────
// Checked in order — first match wins. Keep more-specific patterns first.

const keywordIconMap: [RegExp, string][] = [
  // Proteins
  [/\b(egg|eggs|scrambled|fried egg|omelette|omelet|frittata)\b/i,  "1F95A"], // 🥚
  [/\b(shrimp|prawn|scallop|lobster|crab)\b/i,                      "1F990"], // 🦐
  [/\b(salmon|tuna|tilapia|cod|halibut|mahi|trout|catfish|fish)\b/i,"1F41F"], // 🐟
  [/\b(sushi|sashimi|nigiri|maki)\b/i,                              "1F363"], // 🍣
  [/\b(bacon|ham|prosciutto)\b/i,                                   "1F953"], // 🥓
  [/\b(beef|steak|burger|brisket|meatball|meatloaf|ground beef)\b/i,"1F969"], // 🥩
  [/\b(rib|ribs|pork chop|pulled pork|pork)\b/i,                   "1F356"], // 🍖
  [/\b(chicken|turkey|poultry|hen|wing|nugget)\b/i,                 "1F357"], // 🍗

  // Grains & bread
  [/\b(pizza)\b/i,                                                  "1F355"], // 🍕
  [/\b(spaghetti|linguine|fettuccine|penne|rigatoni|lasagna|pasta)\b/i, "1F35D"], // 🍝
  [/\b(ramen|lo mein|chow mein|pad thai|noodle|udon|soba)\b/i,     "1F35C"], // 🍜
  [/\b(curry|tikka|masala|biryani|korma)\b/i,                      "1F35B"], // 🍛
  [/\b(fried rice|rice)\b/i,                                        "1F35A"], // 🍚
  [/\b(taco|tacos)\b/i,                                             "1F32E"], // 🌮
  [/\b(burrito|quesadilla|enchilada|wrap|fajita)\b/i,               "1F32F"], // 🌯
  [/\b(hot dog|hotdog|corndog)\b/i,                                 "1F32D"], // 🌭
  [/\b(sandwich|sub|hoagie|panini|club|blt|reuben)\b/i,             "1F96A"], // 🥪
  [/\b(waffle)\b/i,                                                 "1F9C7"], // 🧇
  [/\b(pancake|flapjack)\b/i,                                       "1F95E"], // 🥞
  [/\b(croissant)\b/i,                                              "1F950"], // 🥐
  [/\b(bagel)\b/i,                                                  "1F96F"], // 🥯
  [/\b(toast|bread|roll|bun|biscuit|muffin|focaccia|ciabatta)\b/i, "1F35E"], // 🍞
  [/\b(oat|oatmeal|granola|cereal|porridge)\b/i,                   "1F963"], // 🥣

  // Vegetables
  [/\b(salad|coleslaw|slaw)\b/i,                                    "1F957"], // 🥗
  [/\b(broccoli)\b/i,                                               "1F966"], // 🥦
  [/\b(corn|maize)\b/i,                                             "1F33D"], // 🌽
  [/\b(carrot)\b/i,                                                 "1F955"], // 🥕
  [/\b(tomato)\b/i,                                                 "1F345"], // 🍅
  [/\b(lettuce|spinach|kale|arugula|chard|greens)\b/i,              "1F96C"], // 🥬
  [/\b(pepper|bell pepper|capsicum)\b/i,                            "1FAD1"], // 🫑
  [/\b(onion|scallion|shallot)\b/i,                                 "1F9C5"], // 🧅
  [/\b(mushroom|fungi)\b/i,                                         "1F344"], // 🍄

  // Fruits
  [/\b(blueberry|blueberries)\b/i,                                  "1FAD0"], // 🫐
  [/\b(strawberry|strawberries)\b/i,                                "1F353"], // 🍓
  [/\b(apple)\b/i,                                                  "1F34E"], // 🍎
  [/\b(banana)\b/i,                                                 "1F34C"], // 🍌
  [/\b(orange|clementine|mandarin|tangerine)\b/i,                   "1F34A"], // 🍊
  [/\b(grape|grapes)\b/i,                                           "1F347"], // 🍇
  [/\b(watermelon)\b/i,                                             "1F349"], // 🍉
  [/\b(peach)\b/i,                                                  "1F351"], // 🍑

  // Dairy
  [/\b(ice cream|gelato|sorbet|frozen yogurt|froyo)\b/i,            "1F366"], // 🍦
  [/\b(cheese|cheddar|mozzarella|parmesan|brie|gouda)\b/i,          "1F9C0"], // 🧀
  [/\b(butter|margarine)\b/i,                                       "1F9C8"], // 🧈
  [/\b(yogurt|yoghurt)\b/i,                                         "1F95B"], // 🥛
  [/\b(milk|dairy)\b/i,                                             "1F95B"], // 🥛

  // Desserts
  [/\b(cookie|cookies|biscotti)\b/i,                                "1F36A"], // 🍪
  [/\b(donut|doughnut)\b/i,                                         "1F369"], // 🍩
  [/\b(cupcake)\b/i,                                                "1F9C1"], // 🧁
  [/\b(pie|cobbler|crumble|tart)\b/i,                               "1F967"], // 🥧
  [/\b(birthday cake|layer cake)\b/i,                               "1F382"], // 🎂
  [/\b(cake|brownie|cheesecake)\b/i,                                "1F370"], // 🍰
  [/\b(chocolate|fudge|truffle)\b/i,                                "1F36B"], // 🍫

  // Drinks
  [/\b(coffee|espresso|latte|cappuccino|mocha|americano)\b/i,       "2615"],  // ☕
  [/\b(tea|chai|matcha|herbal)\b/i,                                 "1F375"], // 🍵
  [/\b(juice|lemonade|cider|smoothie)\b/i,                          "1F9C3"], // 🧃
  [/\b(soda|pop|cola|limeade|agua fresca)\b/i,                      "1F964"], // 🥤

  // Soups & stews
  [/\b(soup|stew|chili|chowder|bisque|broth|gumbo|minestrone|ramen)\b/i, "1F372"], // 🍲
];

// ─── Letter pill accent colors ─────────────────────────────────────────────────

const pillColors = [
  { bg: "var(--se-info-dim)",    text: "var(--se-macro-protein)" },
  { bg: "var(--se-warning-dim)", text: "var(--se-macro-carbs)"  },
  { bg: "#FEF3EE",               text: "var(--se-macro-fat)"    },
  { bg: "var(--se-success-dim)", text: "var(--se-success)"      },
  { bg: "var(--se-primary-dim)", text: "var(--se-primary)"      },
];

function pillColorFor(name: string) {
  const sum = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return pillColors[sum % pillColors.length];
}

// ─── Resolve SVG code ──────────────────────────────────────────────────────────

function resolveIconCode(dishName: string, category?: string): string | null {
  // Tier 1: keyword match
  for (const [pattern, code] of keywordIconMap) {
    if (pattern.test(dishName)) return code;
  }
  // Tier 2: category match
  if (category) {
    const normalized = category.toLowerCase();
    if (categoryIconMap[normalized]) return categoryIconMap[normalized];
  }
  return null;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const sizeMap = { sm: 20, md: 28, lg: 40 } as const;

export function FoodIcon({ dishName, category, size = "md", className = "" }: FoodIconProps) {
  const px = sizeMap[size];
  const code = resolveIconCode(dishName, category);

  if (code) {
    return (
      <img
        src={`/icons/food/${code}.svg`}
        alt=""
        aria-hidden="true"
        width={px}
        height={px}
        className={className}
        style={{ display: "block", flexShrink: 0 }}
        // If SVG fails to load (e.g. newer emoji not downloaded), hide it
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }

  // Tier 3: letter pill
  const letter = dishName.trim().charAt(0).toUpperCase();
  const { bg, text } = pillColorFor(dishName);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold select-none flex-shrink-0 ${className}`}
      aria-hidden="true"
      style={{
        width: px,
        height: px,
        fontSize: px * 0.42,
        background: bg,
        color: text,
      }}
    >
      {letter}
    </span>
  );
}
