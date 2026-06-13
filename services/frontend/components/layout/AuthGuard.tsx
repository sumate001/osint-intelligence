"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, token } = useAuthStore();
  const router = useRouter();

  // Zustand's persist middleware rehydrates from localStorage asynchronously
  // after the first client render. We must wait for it before checking auth,
  // otherwise the initial render always sees isAuthenticated=false and redirects.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // This fires after the first paint AND after persist has rehydrated.
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && (!isAuthenticated || !token)) {
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, token, router]);

  // Before hydration: show a blank loading screen — do NOT redirect yet
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !token) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="text-[var(--text-3)] text-sm">กำลังตรวจสอบสิทธิ์...</div>
      </div>
    );
  }

  return <>{children}</>;
}
