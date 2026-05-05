import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useEffect, useState } from "react";
import { api, type Company, type User } from "./api";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Home from "./pages/Home";
import Capture from "./pages/Capture";
import Contacts from "./pages/Contacts";
import ContactDetail from "./pages/ContactDetail";
import Tasks from "./pages/Tasks";
import SettingsPage from "./pages/Settings";
import ExportPage from "./pages/Export";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthChecked(true);
      return;
    }
    api
      .get<{ user: User; company: Company }>("/api/auth/me")
      .then((r) => {
        setUser(r.data.user);
        setCompany(r.data.company);
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home user={user} company={company} />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/settings" element={<SettingsPage user={user} company={company} />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
