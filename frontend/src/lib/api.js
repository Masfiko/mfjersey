import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const ACCESS_KEY = "mfj_access";
const REFRESH_KEY = "mfj_refresh";
const SKEW_SECONDS = 30; // refresh proactively if token expires within this window

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

// Decode JWT payload without verifying signature — only used to read `exp`.
function decodeJwtExp(token) {
  if (!token) return 0;
  try {
    const part = token.split(".")[1];
    if (!part) return 0;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    return Number(payload.exp || 0);
  } catch {
    return 0;
  }
}

function isExpiringSoon(token) {
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec <= SKEW_SECONDS;
}

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // also send cookies as fallback
});

// ---- Proactive refresh: before each request, if access token is about to
// expire, refresh first (uses single-flight promise so concurrent calls share
// the same refresh round-trip).
let refreshPromise = null;

function isAuthCheckEndpoint(url = "") {
  return (
    url.endsWith("/auth/me") ||
    url.endsWith("/auth/login") ||
    url.endsWith("/auth/register") ||
    url.endsWith("/auth/refresh") ||
    url.endsWith("/auth/logout")
  );
}

async function doRefresh() {
  if (!refreshPromise) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return Promise.reject(new Error("no_refresh_token"));
    }
    refreshPromise = axios
      .post(
        `${API_BASE}/auth/refresh`,
        { refresh_token: refreshToken },
        { withCredentials: true },
      )
      .then(({ data }) => {
        if (data?.access_token) setTokens(data.access_token, data.refresh_token);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};

  // Skip auth-check endpoints (login/register/refresh/etc.)
  if (!isAuthCheckEndpoint(config.url || "")) {
    const token = getAccessToken();
    if (token && isExpiringSoon(token)) {
      try {
        await doRefresh();
      } catch {
        /* fall through — response interceptor will handle the 401 */
      }
    }
  }

  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- Reactive refresh: if a request still gets 401 (e.g., token rotated by
// another tab or revoked), try refresh once and retry.
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
      await doRefresh();
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
