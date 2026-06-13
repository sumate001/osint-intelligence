import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  setAuth: (token: string, userId: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      role: null,
      isAuthenticated: false,
      setAuth: (token, userId, role) =>
        set({ token, userId, role, isAuthenticated: true }),
      logout: () =>
        set({ token: null, userId: null, role: null, isAuthenticated: false }),
    }),
    {
      name: "osintdesk-auth",
      partialize: (state) => ({ token: state.token, userId: state.userId, role: state.role }),
    }
  )
);
