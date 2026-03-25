import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import Base from "./Base";
import Home from "./pages/Home";
import Menu from "./pages/Menu";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import DishDetail from "./pages/DishDetail";
import AIMeals from "./pages/AIMeals";
import Dashboard from "./pages/Dashboard";
import Login from "./components/Login";
import Register from "./components/Register";
import GGLogin from "./components/GGLogin";
function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Base />}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<Dashboard />}></Route>
            <Route path="profile" element={<Profile />}></Route>
            <Route path="aimeals" element={<AIMeals />}></Route>
            <Route path="dishes/:id" element={<DishDetail />}></Route>
            <Route path="menu" element={<Menu />}></Route>
            <Route path="menu/:hallId" element={<Menu />}></Route>
            <Route path="login" element={<Login />}></Route>
            <Route path="register" element={<Register />}></Route>
            <Route path="gglogin" element={<GGLogin />}></Route>
            <Route path="*" element={<NotFound />}></Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <Analytics />
    </>
  );
}

export default App;
