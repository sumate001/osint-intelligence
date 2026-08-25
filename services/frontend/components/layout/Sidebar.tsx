"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarStore } from "@/lib/stores/sidebar";
import { useLocaleStore } from "@/lib/stores/locale";
import { useT } from "@/lib/hooks/useT";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Map,
  Newspaper,
  Search,
  ShieldCheck,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Target,
  Zap,
  Globe,
  Radar,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { useSignalCount } from "@/lib/hooks/useSignals";

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();
  const { logout } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const router = useRouter();
  const t = useT();
  // Badge counter is the notification mechanism for incoming signals.
  const { data: signalCount } = useSignalCount();

  const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: t("nav.today"), href: "/today", icon: Newspaper },
    { label: t("nav.investigation"), href: "/investigation", icon: Search },
    {
      label: t("signals.title"),
      href: "/investigation/signals",
      icon: Radar,
      badge: signalCount?.pending_review || 0,
    },
    // Next to the signals it draws from: the map is a second way of reading the
    // same inbound stream, not a separate module.
    { label: t("map.title"), href: "/map", icon: Map },
    { label: t("nav.verify"), href: "/verify", icon: ShieldCheck },
    { label: t("nav.brief"), href: "/brief", icon: FileText },
    { label: t("nav.intelligence"), href: "/intelligence", icon: Target },
    { label: t("nav.simulation"), href: "/simulation", icon: Zap },
    { label: t("nav.darkweb"), href: "/darkweb", icon: Globe },
  ];

  const ADMIN_ITEMS = [
    { label: t("nav.settings"), href: "/admin/settings", icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "flex flex-col bg-[var(--surface)] border-r border-[var(--border)] transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-52"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b border-[var(--border)]">
        {!collapsed && (
          <span className="font-mono font-bold text-[var(--text)] tracking-widest text-sm flex-1">
            OSINT//DESK
          </span>
        )}
        <button
          onClick={toggle}
          className="ml-auto p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-2)]"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-1.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon, badge }: any) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2 rounded text-sm transition-colors",
                active
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
              {badge > 0 && (
                <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="my-3 border-t border-[var(--border)]" />

        {ADMIN_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2 rounded text-sm transition-colors",
                active
                  ? "bg-[var(--purple)]/15 text-[var(--purple)]"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Language switcher */}
      {!collapsed && (
        <div className="px-2.5 pb-2">
          <div className="flex rounded overflow-hidden border border-[var(--border)]">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={cn(
                  "flex-1 py-1 text-xs font-medium transition-colors",
                  locale === l
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                )}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-1.5 border-t border-[var(--border)]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-2.5 py-2 rounded text-sm text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--red)] transition-colors"
          title={collapsed ? t("nav.logout") : undefined}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
