// src/api.js
import { mockApi } from './mockApi';

// const BASE_URL = 'http://localhost:8080';
// const getToken = () => localStorage.getItem('miroir_token');

// async function apiRequest(endpoint, options = {}) {
//   const token = getToken();
//   const headers = { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }), ...options.headers };
//   const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
//   let data; try { data = await response.json(); } catch (e) { data = null; }
//   if (!response.ok) { throw data?.error || { message: "Unknown error" }; }
//   return data;
// }

export const api = {
  // --- MOCK ROUTES (Currently Active) ---
  createDemoSession: async () => {
    const data = await mockApi.createDemoSession();
    localStorage.setItem('miroir_token', data.token);
    localStorage.setItem('demo_strategy_version_id', data.demo_data.strategy_version_id);
    return data;
  },
  getStrategies: () => mockApi.getStrategies(),
  createTrade: (payload) => mockApi.createTrade(payload),
  requestReview: (tradeId) => mockApi.requestReview(tradeId),
  getStats: (currency) => mockApi.getStats(currency),
  getProgress: () => mockApi.getProgress(),

  // --- REAL ROUTES (Commented out for Demo) ---
  // createDemoSession: async () => {
  //   const data = await apiRequest('/v1/demo/session', { method: 'POST', body: JSON.stringify({ display_name: "Demo Trader" }) });
  //   localStorage.setItem('miroir_token', data.token);
  //   localStorage.setItem('demo_strategy_version_id', data.demo_data.strategy_version_id);
  //   return data;
  // },
  // getStrategies: () => apiRequest('/v1/strategies'),
  // createTrade: (payload) => apiRequest('/v1/trades', { method: 'POST', body: JSON.stringify(payload) }),
  // requestReview: (tradeId) => apiRequest(`/v1/trades/${tradeId}/review`, { method: 'POST' }),
  // getStats: (currency) => apiRequest(`/v1/stats?currency=${currency}`),
  // getProgress: () => apiRequest('/v1/progress'),
};