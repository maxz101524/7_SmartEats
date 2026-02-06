import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./base";
import DiningHalls from "./pages/DiningHalls";
import Dishes from "./pages/Dishes";
import Profiles from "./pages/Profiles";
import Meals from "./pages/Meals";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DiningHalls />} />
          <Route path="/halls" element={<DiningHalls />} />
          <Route path="/dishes" element={<Dishes />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/meals" element={<Meals />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
