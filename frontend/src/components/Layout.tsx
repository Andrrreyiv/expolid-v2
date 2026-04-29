import { NavLink, Outlet } from "react-router-dom";
import { Home, Users, ListChecks, Settings } from "lucide-react";
import SyncIndicator from "@/components/SyncIndicator";

const tabs = [
  { to: "/", icon: Home, label: "Главная", end: true },
  { to: "/contacts", icon: Users, label: "Контакты" },
  { to: "/tasks", icon: ListChecks, label: "Задачи" },
  { to: "/settings", icon: Settings, label: "Настройки" },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-2 right-2 z-40">
        <SyncIndicator />
      </div>
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur z-30">
        <div className="max-w-md mx-auto grid grid-cols-4">
          {tabs.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 text-xs gap-0.5 ${
                  isActive ? "text-brand" : "text-slate-500"
                }`
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
