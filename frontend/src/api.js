import { mockApi } from './mockApi';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const USE_MOCK_API = import.meta.env.VITE_API_MODE === 'mock';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', details = [], requestId = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function clearSession() {
  localStorage.removeItem('miroir_token');
  localStorage.removeItem('demo_strategy_version_id');
}

async function apiRequest(endpoint, { body, headers: extraHeaders, ...options } = {}) {
  const headers = new Headers(extraHeaders || {});
  headers.set('Accept', 'application/json');

  // Bodyless POSTs (notably /review) must not advertise an empty JSON body.
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const token = localStorage.getItem('miroir_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ApiError(error?.message || 'Could not reach the Miroir API.', {
      code: 'NETWORK_ERROR',
    });
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Keep the status-based error useful when a proxy returns non-JSON text.
  }

  if (!response.ok) {
    if (response.status === 401) clearSession();
    const apiError = data?.error || {};
    throw new ApiError(apiError.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: apiError.code || 'HTTP_ERROR',
      details: Array.isArray(apiError.details) ? apiError.details : [],
      requestId: apiError.request_id || null,
    });
  }

  return data;
}

async function withApiOrMock(realCall, mockCall) {
  return USE_MOCK_API ? mockCall() : realCall();
}

async function createDemoSession() {
  const data = await withApiOrMock(
    () => apiRequest('/v1/demo/session', {
      method: 'POST',
      body: { display_name: 'Demo trader' },
    }),
    () => mockApi.createDemoSession(),
  );
  localStorage.setItem('miroir_token', data.token);
  localStorage.setItem('demo_strategy_version_id', data.demo_data.strategy_version_id);
  return data;
}

export const api = {
  createDemoSession,
  getStrategies: () => withApiOrMock(
    () => apiRequest('/v1/strategies'),
    () => mockApi.getStrategies(),
  ),
  createTrade: (payload) => withApiOrMock(
    () => apiRequest('/v1/trades', { method: 'POST', body: payload }),
    () => mockApi.createTrade(payload),
  ),
  requestReview: (tradeId) => withApiOrMock(
    // Intentionally bodyless: Fastify rejects zero-byte JSON POSTs with a JSON content type.
    () => apiRequest(`/v1/trades/${encodeURIComponent(tradeId)}/review`, { method: 'POST' }),
    () => mockApi.requestReview(tradeId),
  ),
  getStats: (currency = 'USD') => withApiOrMock(
    () => apiRequest(`/v1/stats?${new URLSearchParams({ currency })}`),
    () => mockApi.getStats(currency),
  ),
  getProgress: () => withApiOrMock(
    () => apiRequest('/v1/progress'),
    () => mockApi.getProgress(),
  ),
  getTrades: (query = {}) => withApiOrMock(
    () => apiRequest(`/v1/trades?${new URLSearchParams(query)}`),
    () => mockApi.getTrades(query),
  ),
  previewTradeImport: (payload) => apiRequest('/v1/trade-imports/preview', {
    method: 'POST',
    body: payload,
  }),
  commitTradeImport: (importId) => apiRequest(
    `/v1/trade-imports/${encodeURIComponent(importId)}/commit`,
    { method: 'POST' },
  ),
  logout: async () => {
    try {
      await apiRequest('/v1/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  },
};
