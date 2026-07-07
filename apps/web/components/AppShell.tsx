"use client";

import clsx from "clsx";
import { BarChart3, LayoutDashboard, Radio, Rows3, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { VisibleTextSanitizer } from "@/components/VisibleTextSanitizer";

const navItems = [
  { href: "/dashboard", label: "总览", icon: LayoutDashboard },
  { href: "/live", label: "实时", icon: Radio },
  { href: "/analytics", label: "模型", icon: BarChart3 },
  { href: "/parlay", label: "三串一", icon: Rows3 },
  { href: "/simulation", label: "模拟", icon: Trophy }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen pitch-grid">
      <VisibleTextSanitizer />
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/88 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="group flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-900/18 transition group-hover:bg-field">
              <Trophy size={22} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-black tracking-tight text-ink">世界杯智能推算</span>
              <span className="block truncate text-xs font-semibold text-slate-500">实时比分、阵容、赛果推算</span>
            </span>
          </Link>

          <nav className="relative z-40 flex shrink-0 items-center gap-1 rounded-xl border border-slate-200/90 bg-white/86 p-1.5 shadow-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`top-nav-${item.label}`}
                  className={clsx(
                    "inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg px-3 text-sm font-bold transition",
                    active
                      ? "bg-field text-white shadow-sm ring-1 ring-field/30"
                      : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} aria-hidden />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
