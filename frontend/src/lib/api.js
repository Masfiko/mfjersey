import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// ---- Auto-refresh on 401 ----------------------------------------------------
// On any 401, try POST /auth/refresh once (uses refresh_token cookie). If it
// succeeds, retry the original request. If refresh also fails, redirect to login
// (except for /auth/me and /auth/login which are expected to 401 sometimes).
let refreshPromise = null;

function isAuthCheckEndpoint(url = "") {
  return (
    url.endsWith("/auth/me") ||
    url.endsWith("/auth/login") ||
    url.endsWith("/auth/register") ||
    url.endsWith("/auth/refresh")
  );
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    if (isAuthCheckEndpoint(original.url || "")) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      if (!refreshPromise) {
        refreshPromise = api.post("/auth/refresh").finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return api(original);
    } catch (refreshErr) {
      // Refresh failed → bounce to login
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
      return Promise.reject(refreshErr);
    }
  }
);

export default api;

export function formatApiError(detail) {
  if (detail == null) return "Terjadi kesalahan. Silakan coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
