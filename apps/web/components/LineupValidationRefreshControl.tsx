"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Clock3, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

import { refreshMatchLineupValidation } from "@/lib/api";
import type { LineupValidationProviderAttempt, MatchLineupValidation } from "@/lib/types";

export function LineupValidationRefreshControl({
  matchId,
  initialValidation
}: {
  matchId: string;
  initialValidation?: MatchLineupValidation;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [validation, setValidation] = useState(initialValidation);
  const [message, setMessage] = useState("");

  function handleRefresh() {
    setMessage("正在重新请求真实首发验证接口...");
    startTransition(async () => {
      try {
        const next = await refreshMatchLineupValidation(matchId);
        setValidation(next);
        setMessage(resultMessage(next));
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? `重新验证失败：${error.message}` : "重新验证失败：未知错误");
      }
    });
  }

  const attempts = validation?.providerAttempts ?? [];

  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-ink">真实首发验证接口</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">
            点击后会重新尝试公开赛事数据源、接口足球数据源和体育数据源；没有真实首发时只显示原因，不会用推算名单冒充验证。
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-field px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} className={isPending ? "animate-spin" : ""} aria-hidden />
          {isPending ? "正在验证" : "重新获取真实首发并验证"}
        </button>
      </div>

      {message ? (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700">{message}</div>
      ) : null}

      {attempts.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {attempts.map((attempt) => (
            <ProviderAttemptItem key={`${attempt.provider}-${attempt.verifiedAt}`} attempt={attempt} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
          暂无数据源尝试记录。点击重新验证后会显示每个数据源的具体结果。
        </div>
      )}
    </div>
  );
}

function ProviderAttemptItem({ attempt }: { attempt: LineupValidationProviderAttempt }) {
  const Icon = attempt.status === "success" ? CheckCircle2 : attempt.status === "skipped" ? Clock3 : attempt.status === "error" ? XCircle : ShieldAlert;
  const tone =
    attempt.status === "success"
      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
      : attempt.status === "skipped"
        ? "border-amber-100 bg-amber-50 text-amber-800"
        : "border-red-100 bg-red-50 text-red-800";

  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-center gap-2 font-semibold">
        <Icon size={15} aria-hidden />
        {attempt.label}
      </div>
      <div className="mt-1 text-xs leading-5">{statusLabel(attempt.status)}</div>
      <div className="mt-1 text-xs leading-5">{attempt.reason}</div>
    </div>
  );
}

function statusLabel(status: LineupValidationProviderAttempt["status"]): string {
  if (status === "success") return "已返回";
  if (status === "skipped") return "已跳过";
  if (status === "error") return "请求失败";
  return "未返回数据";
}

function resultMessage(validation: MatchLineupValidation): string {
  if (validation.status === "verified" || validation.status === "partial") return "验证完成：已接入真实首发，并已刷新页面数据。";
  if (validation.status === "unavailable") return "验证完成：数据源仍未返回可用真实首发，已显示具体原因。";
  return "验证完成：当前仍在等待真实首发数据。";
}
