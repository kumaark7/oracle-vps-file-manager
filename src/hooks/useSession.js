import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../api/client.js";

const initialSession = {
  loading: true,
  authenticated: false,
  passwordConfigured: true,
  username: "",
  defaultServerId: "local"
};

export function useSession() {
  const [session, setSession] = useState(initialSession);
  const [sessionError, setSessionError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await requestJson("/api/session");
      setSession({ loading: false, ...data });
      setSessionError("");
    } catch (error) {
      setSession((current) => ({ ...current, loading: false }));
      setSessionError(error.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password) => {
    const data = await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    setSession((current) => ({ ...current, loading: false, authenticated: true, username: data.username, passwordConfigured: true }));
  }, []);

  const logout = useCallback(async () => {
    await requestJson("/api/logout", { method: "POST", body: "{}" });
    setSession((current) => ({ ...current, authenticated: false }));
  }, []);

  return { session, sessionError, login, logout, refresh };
}
