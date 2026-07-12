import { NextResponse } from "next/server";

import { recalculateMatchPrediction } from "@/lib/api";
import { toChineseDisplay } from "@/lib/chineseDisplay";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const redirectUrl = buildBrowserRedirectUrl(`/match/${encodeURIComponent(id)}`, request.url);

  try {
    const prediction = await recalculateMatchPrediction(id);
    const topScore = prediction?.topScores[0];
    redirectUrl.searchParams.set("manualPrediction", "success");

    if (topScore) {
      redirectUrl.searchParams.set("score", topScore.score);
      redirectUrl.searchParams.set("probability", String(Math.round(topScore.probability * 100)));
    }
  } catch (error) {
    redirectUrl.searchParams.set("manualPrediction", "error");
    redirectUrl.searchParams.set(
      "message",
      toChineseDisplay(error instanceof Error ? error.message : "重新推算失败，请稍后再试。", "重新推算失败，请稍后再试。")
    );
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

function buildBrowserRedirectUrl(pathname: string, requestUrl: string): URL {
  const redirectUrl = new URL(pathname, requestUrl);
  if (isUnspecifiedHost(redirectUrl.hostname)) {
    redirectUrl.hostname = "127.0.0.1";
  }
  return redirectUrl;
}

function isUnspecifiedHost(hostname: string): boolean {
  return hostname === "0.0.0.0" || hostname === "::" || hostname === "[::]";
}
