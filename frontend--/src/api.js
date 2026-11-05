const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'miroir_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);

async function apiRequest(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    // Keep a namespaced fallback for preview proxies that remove Authorization headers.
    headers.set('X-Miroir-Session', token);
  }
  if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  } catch {
    throw new Error('Could not reach the Miroir API. Check that the backend is running.');
  }

  let data = null;
  try { data = await response.json(); } catch { /* Empty response is valid for some future endpoints. */ }
  if (!response.ok) {
    if (response.status === 401) localStorage.removeItem(TOKEN_KEY);
    const error = new Error(data?.error?.message || data?.message || `Request failed (${response.status}).`);
    error.code = data?.error?.code || 'API_ERROR';
    error.status = response.status;
    throw error;
  }
  return data;
}

function storeSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token);
  if (data.demo_data?.strategy_version_id) localStorage.setItem('demo_strategy_version_id', data.demo_data.strategy_version_id);
  if (data.identity) localStorage.setItem('miroir_identity', JSON.stringify(data.identity));
  return data;
}

export const api = {
  createDemoSession: async () => storeSession(await apiRequest('/v1/demo/session', {
    method: 'POST',
    body: JSON.stringify({ display_name: 'Demo Trader' })
  })),
  registerAccount: (payload) => apiRequest('/v1/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: async (payload) => storeSession(await apiRequest('/v1/auth/login', { method: 'POST', body: JSON.stringify(payload) })),
  verifyEmail: async (token) => storeSession(await apiRequest('/v1/auth/verify', { method: 'POST', body: JSON.stringify({ token }) })),
  resendVerification: (email) => apiRequest('/v1/auth/verification/resend', { method: 'POST', body: JSON.stringify({ email }) }),
  logout: async () => {
    try { await apiRequest('/v1/auth/logout', { method: 'POST' }); } finally { api.clearSession(); }
  },
  getIdentity: () => apiRequest('/v1/me'),
  getStrategies: () => apiRequest('/v1/strategies'),
  getTrades: () => apiRequest('/v1/trades'),
  createTrade: (payload) => apiRequest('/v1/trades', { method: 'POST', body: JSON.stringify(payload) }),
  requestReview: (tradeId) => apiRequest(`/v1/trades/${encodeURIComponent(tradeId)}/review`, { method: 'POST' }),
  getStats: (currency = 'USD') => apiRequest(`/v1/stats?currency=${encodeURIComponent(currency)}`),
  getProgress: () => apiRequest('/v1/progress'),
  getRoqquStatus: () => apiRequest('/v1/roqqu/status'),
  connectRoqqu: () => apiRequest('/v1/roqqu/connect', { method: 'POST' }),
  disconnectRoqqu: () => apiRequest('/v1/roqqu/disconnect', { method: 'POST' }),
  getRoqquBalances: () => apiRequest('/v1/roqqu/balances'),
  getRoqquHistory: () => apiRequest('/v1/roqqu/history'),
  clearSession: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('demo_strategy_version_id');
    localStorage.removeItem('miroir_identity');
  }
};
