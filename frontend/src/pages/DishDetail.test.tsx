import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/Toast.tsx";
import DishDetail from "./DishDetail.tsx";

vi.mock("axios");
vi.mock("vega-embed", () => ({
  default: vi.fn(() => Promise.resolve()),
}));

const dish = {
  dish_id: 101,
  dish_name: "Herb Focaccia Bread",
  calories: 160,
  category: "Bread",
  dining_hall__name: "Ikenberry Dining Center",
  protein: 4,
  carbohydrates: 24,
  fat: 2,
  dietary_flags: ["Vegan"],
  allergens: ["Wheat"],
  serving_size: "1 slice",
  serving_unit: "Baked Expectations",
};

function renderDishDetail() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/dishes/101"]}>
        <Routes>
          <Route path="/dishes/:id" element={<DishDetail />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(axios.get).mockResolvedValue({ data: dish });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DishDetail tray flow", () => {
  it("adds the dish to the shared tray and reflects existing tray state", async () => {
    const user = userEvent.setup();
    renderDishDetail();

    await screen.findByRole("heading", { name: "Herb Focaccia Bread" });
    await user.click(screen.getByRole("button", { name: "Add to Meal Tray" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Already in Tray" })).toBeDisabled();
    });

    expect(screen.getByText("1 item ready to log")).toBeInTheDocument();
    expect(screen.getAllByText("Herb Focaccia Bread").length).toBeGreaterThan(1);
  });
});
