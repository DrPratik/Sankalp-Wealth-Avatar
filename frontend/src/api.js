const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE === '/api') {
    return `/api${normalizedPath}`;
  }
  return `${API_BASE}${normalizedPath}`;
}
