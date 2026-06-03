const TOKEN_KEY = 'dambrock.session';

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

export async function apiFetch(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'request-failed');
    error.status = response.status;
    error.code = data.error || String(response.status);
    throw error;
  }

  return response.json();
}

export function subscribe(path, params, onValue, options = {}) {
  let active = true;
  let timer = null;
  const interval = options.interval || 1200;
  const map = options.map || ((data) => data.items ?? data);

  async function load() {
    try {
      const data = await apiFetch(`${path}${queryString(params)}`);
      if (active) onValue(map(data));
    } catch (error) {
      if (active && options.onError) options.onError(error);
    } finally {
      if (active) timer = window.setTimeout(load, interval);
    }
  }

  load();
  return () => {
    active = false;
    if (timer) window.clearTimeout(timer);
  };
}
