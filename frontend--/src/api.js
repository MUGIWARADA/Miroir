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
  getStrategy: (id) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}`),
  createStrategy: (payload) => apiRequest('/v1/strategies', { method: 'POST', body: JSON.stringify(payload) }),
  updateStrategyDraft: (id, payload) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  confirmStrategyVersion: (id, payload = {}) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(payload) }),
  validateStrategy: (id) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/validation`),
  explainStrategyValidation: (id) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/explain-validation`, { method: 'POST' }),
  submitStrategyForReview: (id) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/submit-review`, { method: 'POST' }),
  archiveStrategy: (id) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
  getStrategyVersions: (id) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/versions`),
  getStrategyVersion: (id, versionId) => apiRequest(`/v1/strategies/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`),
  createConversation: (payload) => apiRequest('/v1/ai/conversations', { method: 'POST', body: JSON.stringify(payload) }),
  getConversations: (limit = 20) => apiRequest(`/v1/ai/conversations?limit=${encodeURIComponent(limit)}`),
  getConversation: (id) => apiRequest(`/v1/ai/conversations/${encodeURIComponent(id)}`),
  createConversationMessage: (conversationId, payload) => apiRequest(`/v1/ai/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify(payload) }),
  getConversationMessages: (conversationId, limit = 50) => apiRequest(`/v1/ai/conversations/${encodeURIComponent(conversationId)}/messages?limit=${encodeURIComponent(limit)}`),
  executeCompanionTurn: (conversationId, payload) => apiRequest(`/v1/ai/conversations/${encodeURIComponent(conversationId)}/companion-turn`, { method: 'POST', body: JSON.stringify(payload) }),
  executeProgressTurn: (conversationId, payload) => apiRequest(`/v1/ai/conversations/${encodeURIComponent(conversationId)}/progress-turn`, { method: 'POST', body: JSON.stringify(payload) }),
  getConversationStrategyState: (conversationId) => apiRequest(`/v1/ai/conversations/${encodeURIComponent(conversationId)}/strategy-state`),
  getTrades: () => apiRequest('/v1/trades'),
  createTrade: (payload) => apiRequest('/v1/trades', { method: 'POST', body: JSON.stringify(payload) }),
  requestReview: (tradeId, { re_evaluate = false } = {}) => {
    const q = re_evaluate ? '?re_evaluate=true' : '';
    return apiRequest(`/v1/trades/${encodeURIComponent(tradeId)}/review${q}`, {
      method: 'POST',
      body: JSON.stringify({ re_evaluate })
    });
  },
  getReview: (tradeId) => apiRequest(`/v1/trades/${encodeURIComponent(tradeId)}/review`),
  getStats: (currency = 'USD') => apiRequest(`/v1/stats?currency=${encodeURIComponent(currency)}`),
  getProgress: () => apiRequest('/v1/progress'),
  getPatterns: ({ startDate, endDate, strategyId, strategyVersionId, explain = false } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (strategyId) params.set('strategy_id', strategyId);
    if (strategyVersionId) params.set('strategy_version_id', strategyVersionId);
    if (explain) params.set('explain', 'true');
    const qs = params.toString();
    return apiRequest(`/v1/intelligence/patterns${qs ? `?${qs}` : ''}`);
  },
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
