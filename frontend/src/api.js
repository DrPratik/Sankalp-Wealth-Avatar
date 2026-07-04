const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function buildBaseUrl() {
  if (!API_BASE || API_BASE === '/api') {
    return '/api';
  }

  const normalizedBase = API_BASE.replace(/\/$/, '');
  return normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
}

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = buildBaseUrl();
  return `${baseUrl}${normalizedPath}`;
}
