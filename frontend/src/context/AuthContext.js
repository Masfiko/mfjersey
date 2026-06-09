import { createContext, useContext, useEffect, useRef, useState } from "react";
import api, { setTokens, clearTokens, getAccessToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    let active = true;
    const token = getAccessToken();
    if (!token) {
      Promise.resolve().then(() => {
        if (!active) return;
        setUser(false);
        setLoading(false);
      });
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => active && setUser(data))
      .catch(() => active && setUser(false))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data?.access_token) setTokens(data.access_token, data.refresh_token);
    setUser(data);
    return data;
  };

  const register = async (email, password, name) => {
    const { data } = await api.post("/auth/register", { email, password, name });
    if (data?.access_token) setTokens(data.access_token, data.refresh_token);
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore network errors */
    }
    clearTokens();
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
