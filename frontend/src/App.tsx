import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Base from "./Base";
import Home from "./pages/Home";
import Menu from "./pages/Menu";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import DishDetail from "./pages/DishDetail";
import AIMeals from "./pages/AIMeals";
import Login from "./components/Login";
import Register from "./components/Register";
import GGLogin from "./components/GGLogin";
import Showcase from "./pages/Showcase";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          {/* Design review — remove before final deploy */}
          <Route path="/showcase" element={<Showcase />} />

          <Route path="/" element={<Base />}>
            <Route index element={<Home />} />
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
    </>
  );
}

export default App;
