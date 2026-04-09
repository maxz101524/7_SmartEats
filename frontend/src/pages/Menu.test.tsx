import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Menu from "./Menu.tsx";

vi.mock("axios");
vi.mock("../components/AddDish", () => ({
  default: () => <div data-testid="add-dish" />,
}));

const halls = [
  {
    Dining_Hall_ID: 1,
    name: "Ikenberry Dining Center",
    location: "301 E Gregory Dr",
    dishes: [
      {
        dish_id: 101,
        dish_name: "Herb Focaccia Bread",
        calories: 160,
        protein: 4,
        carbohydrates: 24,
        fat: 2,
        serving_unit: "Baked Expectations",
        meal_period: "Lunch",
        dietary_flags: ["Vegan"],
        allergens: ["Wheat"],
      },
      {
        dish_id: 102,
        dish_name: "Grilled Lemon Chicken",
        calories: 240,
        protein: 28,
        carbohydrates: 2,
        fat: 12,
        serving_unit: "Griddle Station",
        meal_period: "Lunch",
        dietary_flags: ["Halal"],
        allergens: [],
      },
      {
        dish_id: 103,
        dish_name: "Garlic Mashed Potatoes",
        calories: 180,
        protein: 3,
        carbohydrates: 22,
        fat: 9,
        serving_unit: "Home Cooking",
        meal_period: "Dinner",
        dietary_flags: ["Vegetarian"],
        allergens: ["Milk"],
      },
    ],
  },
  {
    Dining_Hall_ID: 2,
    name: "ISR Dining Center",
    location: "1410 W Gregory Dr",
    dishes: [
      {
        dish_id: 201,
        dish_name: "Caffeine Lab Cold Brew",
        calories: 15,
        protein: 1,
        carbohydrates: 1,
        fat: 0,
        serving_unit: "Caffeine Lab",
        meal_period: "Breakfast",
        dietary_flags: ["Vegan"],
        allergens: [],
      },
    ],
  },
];

function renderMenu(initialEntry = "/menu/1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteControls />
      <Routes>
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:hallId" element={<Menu />} />
        <Route path="/dishes/:id" element={<div>Dish detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function RouteControls() {
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate("/menu/999")}>
      Go invalid hall
    </button>
  );
}

beforeEach(() => {
  vi.mocked(axios.get).mockResolvedValue({ data: halls });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Menu redesign", () => {
  it("renders station jump links for the visible station groups", async () => {
    renderMenu();

    await screen.findByRole("heading", { name: "Ikenberry Dining Center" });

    expect(
      screen.getByRole("link", { name: "Baked Expectations" }),
    ).toHaveAttribute("href", "#baked-expectations");
    expect(
      screen.getByRole("link", { name: "Griddle Station" }),
    ).toHaveAttribute("href", "#griddle-station");
  });

  it("updates station jump links when search narrows the visible dishes", async () => {
    const user = userEvent.setup();
    renderMenu();

    await screen.findByRole("heading", { name: "Ikenberry Dining Center" });
    await user.type(
      screen.getByRole("textbox", { name: /search dishes/i }),
      "chicken",
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: "Baked Expectations" }),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: "Griddle Station" }),
    ).toBeInTheDocument();
  });

  it("lets users switch halls from the compact hall chooser", async () => {
    const user = userEvent.setup();
    renderMenu();

    await screen.findByRole("heading", { name: "Ikenberry Dining Center" });
    await user.click(screen.getByRole("button", { name: /change hall/i }));
    await user.click(screen.getByRole("button", { name: "ISR Dining Center" }));

    await screen.findByRole("heading", { name: "ISR Dining Center" });
    expect(screen.getByText("Caffeine Lab Cold Brew")).toBeInTheDocument();
  });

  it("creates unique station jump anchors for similarly named stations", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        {
          Dining_Hall_ID: 3,
          name: "Collision Hall",
          location: "999 Test Ave",
          dishes: [
            {
              dish_id: 301,
              dish_name: "Dish One",
              calories: 100,
              protein: 5,
              carbohydrates: 10,
              fat: 2,
              serving_unit: "Foo Bar",
              meal_period: "Lunch",
              dietary_flags: [],
              allergens: [],
            },
            {
              dish_id: 302,
              dish_name: "Dish Two",
              calories: 120,
              protein: 6,
              carbohydrates: 12,
              fat: 3,
              serving_unit: "Foo-Bar",
              meal_period: "Lunch",
              dietary_flags: [],
              allergens: [],
            },
          ],
        },
      ],
    });

    renderMenu("/menu/3");

    await screen.findByRole("heading", { name: "Collision Hall" });

    const firstLink = screen.getByRole("link", { name: "Foo Bar" });
    const secondLink = screen.getByRole("link", { name: "Foo-Bar" });

    expect(firstLink).not.toHaveAttribute(
      "href",
      secondLink.getAttribute("href"),
    );
  });

  it("clears the selected hall when the route changes to an invalid hall id", async () => {
    const user = userEvent.setup();
    renderMenu();

    await screen.findByRole("heading", { name: "Ikenberry Dining Center" });
    await user.click(screen.getByRole("button", { name: "Go invalid hall" }));

    await screen.findByRole("heading", { name: /pick a dining hall/i });
    expect(
      screen.queryByRole("heading", { name: "Ikenberry Dining Center" }),
    ).not.toBeInTheDocument();
  });

  it("keeps dietary filters applied after AI results load", async () => {
    const user = userEvent.setup();

    vi.mocked(axios.get).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/semantic-search/")) {
        return Promise.resolve({
          data: {
            results: [halls[0].dishes[1], halls[0].dishes[2]],
          },
        });
      }

      return Promise.resolve({ data: halls });
    });

    renderMenu();

    await screen.findByRole("heading", { name: "Ikenberry Dining Center" });
    await user.click(screen.getByRole("button", { name: "Vegetarian" }));
    await user.click(screen.getByRole("button", { name: "✦ AI" }));
    await user.type(
      screen.getByRole("textbox", { name: /ai semantic search/i }),
      "protein",
    );

    await waitFor(() => {
      expect(screen.getByText("Garlic Mashed Potatoes")).toBeInTheDocument();
      expect(screen.queryByText("Grilled Lemon Chicken")).not.toBeInTheDocument();
    }, { timeout: 2000 });

  });

  it("surfaces backend validation errors in AI mode", async () => {
    const user = userEvent.setup();

    vi.mocked(axios.isAxiosError).mockImplementation(
      (error) => Boolean((error as { response?: unknown })?.response),
    );
    vi.mocked(axios.get).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/semantic-search/")) {
        return Promise.reject({
          response: {
            status: 400,
            data: { error: "Query must be 200 characters or fewer." },
          },
        });
      }

      return Promise.resolve({ data: halls });
    });

    renderMenu();

    await screen.findByRole("heading", { name: "Ikenberry Dining Center" });
    await user.click(screen.getByRole("button", { name: "✦ AI" }));
    await user.type(
      screen.getByRole("textbox", { name: /ai semantic search/i }),
      "way too long",
    );

    await screen.findByText("Query must be 200 characters or fewer.", {}, { timeout: 2000 });
  });
});
