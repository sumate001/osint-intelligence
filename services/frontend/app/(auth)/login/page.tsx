"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/lib/stores/auth";
import { apiLogin } from "@/lib/api/client";
import { useT } from "@/lib/hooks/useT";

type FormData = { email: string; password: string };

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const schema = z.object({
    email: z.string().email(t("login.email_invalid")),
    password: z.string().min(1, t("login.password_required")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      const result = await apiLogin(data.email, data.password);
      setAuth(result.access_token, result.user_id, result.role);
      router.push("/today");
    } catch {
      setError(t("login.error_invalid"));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--text)] font-mono tracking-wider">
            OSINT//DESK
          </h1>
          <p className="text-[var(--text-2)] mt-1 text-sm">{t("login.subtitle")}</p>
        </div>

        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--text-2)] mb-1">{t("login.email")}</label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
                placeholder="analyst@newsroom.com"
              />
              {errors.email && (
                <p className="text-[var(--red)] text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-[var(--text-2)] mb-1">{t("login.password")}</label>
              <input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="text-[var(--red)] text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="bg-[var(--red)]/10 border border-[var(--red)]/30 rounded px-3 py-2">
                <p className="text-[var(--red)] text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[var(--accent)] text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
