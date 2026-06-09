import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const ACCESS_KEY = "mfj_access";
const REFRESH_KEY = "mfj_refresh";

export function setTokens(access, refresh) {
  try {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    /* ignore storage errors (private mode) */
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // also send cookies as fallback
});

// Attach Bearer token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
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
        const refreshToken = getRefreshToken();
        refreshPromise = api
          .post("/auth/refresh", { refresh_token: refreshToken })
          .then(({ data }) => {
            if (data?.access_token) setTokens(data.access_token, data.refresh_token);
            return data;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }
      await refreshPromise;
      return api(original);
    } catch (refreshErr) {
      clearTokens();
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
