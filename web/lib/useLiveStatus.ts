"use client";

import { useEffect, useRef, useState } from "react";

import { API_URL } from "./api";
import { PLATFORMS, type Platform, type SourceStatus } from "./types";

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

/** Platform status + "new stories" pushes from the server's event stream. */
export function useLiveStatus(onNew: (platform: Platform, added: number) => void) {
  const [statuses, setStatuses] = useState<Partial<Record<Platform, SourceStatus>>>({});
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const onNewRef = useRef(onNew);

  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/stream`);
    es.onopen = () => setConnection("live");
    es.onerror = () => setConnection("reconnecting"); // EventSource retries on its own
    es.addEventListener("status", (e) => {
      const data = JSON.parse((e as MessageEvent<string>).data) as { sources?: SourceStatus[] };
      const valid = (data.sources ?? []).filter((s) => PLATFORMS.includes(s.platform));
      setStatuses(Object.fromEntries(valid.map((s) => [s.platform, s])));
    });
    es.addEventListener("new", (e) => {
      const data = JSON.parse((e as MessageEvent<string>).data) as { platform?: Platform; added?: number };
      if (data.platform && PLATFORMS.includes(data.platform) && typeof data.added === "number") {
        onNewRef.current(data.platform, data.added);
      }
    });
    return () => es.close();
  }, []);

  return { statuses, connection };
}
