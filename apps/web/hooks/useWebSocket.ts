"use client";

import { useEffect, useRef, useState } from "react";

export type WebSocketState = "connecting" | "open" | "closed";

export function useWebSocket<T>(url: string, options: { enabled?: boolean; reconnectMs?: number } = {}) {
  const enabled = options.enabled ?? true;
  const reconnectMs = options.reconnectMs ?? 3000;
  const [state, setState] = useState<WebSocketState>("connecting");
  const [message, setMessage] = useState<T | null>(null);
  const retryRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setState("connecting");
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener("open", () => setState("open"));
      socket.addEventListener("message", (event) => {
        try {
          setMessage(JSON.parse(event.data as string) as T);
        } catch {
          setMessage(null);
        }
      });
      socket.addEventListener("close", () => {
        setState("closed");
        if (!disposed) retryRef.current = window.setTimeout(connect, reconnectMs);
      });
      socket.addEventListener("error", () => setState("closed"));
    };

    connect();

    return () => {
      disposed = true;
      if (retryRef.current) window.clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, [enabled, reconnectMs, url]);

  return { state, message };
}
