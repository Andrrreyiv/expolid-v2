import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import HomePage from "@/pages/HomePage";
import ContactsPage from "@/pages/ContactsPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import TasksPage from "@/pages/TasksPage";
import SettingsPage from "@/pages/SettingsPage";
import CapturePage from "@/pages/CapturePage";
import { useAuth } from "@/store/auth";
import { useRealtime } from "@/lib/realtime";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) {
    return <div className="p-8 text-center text-slate-500">Загрузка...</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) {
    return <div className="p-8 text-center text-slate-500">Загрузка...</div>;
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  useRealtime();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="capture" element={<CapturePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
