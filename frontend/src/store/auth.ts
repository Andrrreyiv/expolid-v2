import { create } from "zustand";
import { fetchMe, type User } from "@/api/auth";
import { clearToken, getToken, setToken } from "@/api/auth-storage";

interface AuthState {
  user: User | null;
  initializing: boolean;
  setUserFromToken: (token: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  initializing: true,
  setUserFromToken: async (token: string) => {
    setToken(token);
    const me = await fetchMe();
    set({ user: me });
  },
  refreshMe: async () => {
    try {
      const me = await fetchMe();
      set({ user: me });
    } catch {
      set({ user: null });
    }
  },
  logout: () => {
    clearToken();
    set({ user: null });
  },
  bootstrap: async () => {
    set({ initializing: true });
    if (!getToken()) {
      set({ user: null, initializing: false });
      return;
    }
    try {
      const me = await fetchMe();
      set({ user: me, initializing: false });
    } catch {
      clearToken();
      set({ user: null, initializing: false });
    }
  },
}));
