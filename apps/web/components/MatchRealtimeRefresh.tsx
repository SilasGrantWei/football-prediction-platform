"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { publicWsUrl } from "@/lib/api";

interface LivePayload {
  type: string;
}

export function MatchRealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;

    const refresh = () => {
      if (!disposed) router.refresh();
    };

    const timer = window.setInterval(refresh, 15_000);
    const socket = new WebSocket(publicWsUrl());

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as LivePayload;
        if (payload.type === "live_snapshot") refresh();
      } catch {
        refresh();
      }
    });
    socket.addEventListener("close", refresh);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      socket.close();
    };
  }, [router]);

  return null;
}
