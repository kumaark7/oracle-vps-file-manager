import { useEffect, useState } from "react";
import { requestJson } from "../api/client.js";

export function useServers(authenticated, defaultServerId = "local") {
  const [servers, setServers] = useState([]);
  const [currentServerId, setCurrentServerId] = useState(defaultServerId);
  const [serversError, setServersError] = useState("");

  useEffect(() => {
    if (!authenticated) {
      setServers([]);
      return;
    }
    let cancelled = false;
    requestJson("/api/servers")
      .then((data) => {
        if (cancelled) return;
        const nextServers = data.servers || [];
        setServers(nextServers);
        setCurrentServerId((current) => nextServers.some((server) => server.id === current)
          ? current
          : data.defaultServerId || nextServers[0]?.id || "local");
        setServersError("");
      })
      .catch((error) => { if (!cancelled) setServersError(error.message); });
    return () => { cancelled = true; };
  }, [authenticated]);

  useEffect(() => {
    if (defaultServerId) setCurrentServerId((current) => current || defaultServerId);
  }, [defaultServerId]);

  return { servers, currentServerId, setCurrentServerId, serversError };
}
