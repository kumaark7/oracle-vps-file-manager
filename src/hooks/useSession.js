import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../api/client.js";

const initialSession = {
  loading: true,
  authenticated: false,
  passwordConfigured: true,
  username: "",
  defaultServerId: "local",
  uploadLimitBytes: 2 * 1024 * 1024 * 1024,
  largeUploadMaxBytes: 10 * 1024 * 1024 * 1024
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

  const login = useCallback(async (username, credential) => {
    const data = await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password: credential })
    });
    setSession((current) => ({ ...current, ...data, loading: false, authenticated: true, passwordConfigured: true }));
  }, []);

  const loginWithRecovery = useCallback(async (code) => {
    const data = await requestJson("/api/login/recovery", {
      method: "POST",
      body: JSON.stringify({ code })
    });
    setSession((current) => ({
      ...current,
      loading: false,
      authenticated: true,
      ...data,
      username: data.username
    }));
  }, []);

  const logout = useCallback(async () => {
    await requestJson("/api/logout", { method: "POST", body: "{}" });
    setSession((current) => ({ ...current, authenticated: false }));
  }, []);

  return {
    session,
    sessionError,
    login,
    loginWithRecovery,
    logout,
    refresh
  };
}
