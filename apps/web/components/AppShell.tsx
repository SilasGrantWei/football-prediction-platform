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
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/[0.92] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="group flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a1a2b] text-white shadow-md transition group-hover:bg-field">
              <Trophy size={19} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-tight text-ink sm:text-base">世界杯智能推算</span>
              <span className="hidden truncate text-[11px] font-semibold text-slate-500 sm:block">赛程 · 比分 · 模型复盘</span>
            </span>
          </Link>

          <nav aria-label="主要导航" className="relative z-40 flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/[0.9] p-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`top-nav-${item.label}`}
                  aria-label={item.label}
                  className={clsx(
                    "inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 text-sm font-bold transition sm:px-3",
                    active ? "bg-[#0a1a2b] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-ink"
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
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>
    </div>
  );
}
