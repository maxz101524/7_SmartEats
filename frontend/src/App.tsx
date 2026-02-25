import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Base from "./Base";
import Dishes from "./pages/Dishes";
import DiningHalls from "./pages/DiningHalls";
import NotFound from "./pages/NotFound";
import Profiles from "./pages/Profiles";
import DishDetail from "./pages/DishDetail";
import AIMeals from "./pages/AIMeals";
import Charts from "./pages/Charts";
import Reports from "./pages/Reports";
import Showcase from "./pages/Showcase";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          {/* Design review — remove before final deploy */}
          <Route path="/showcase" element={<Showcase />} />

          <Route path="/" element={<Base />}>
            <Route index element={<Dishes />} />
            <Route path="dishes" element={<Dishes />}></Route>
            <Route path="halls" element={<DiningHalls />}></Route>
            <Route path="profile" element={<Profiles />}></Route>
            <Route path="aimeals" element={<AIMeals />}></Route>
            <Route path="charts" element={<Charts />}></Route>
            <Route path="reports" element={<Reports />}></Route>
            <Route path="dishes/:id" element={<DishDetail />}></Route>
            <Route path="*" element={<NotFound />}></Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
