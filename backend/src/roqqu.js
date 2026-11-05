import { DEMO_ROQQU_BALANCES, DEMO_ROQQU_HISTORY } from './fixtures.js';

const BASE_URL = 'https://service.roqqu.com/v1';

export class RoqquClient {
  constructor({ stagingApiKey, accountEmail, fetchImpl = fetch }) {
    this.stagingApiKey = stagingApiKey;
    this.accountEmail = accountEmail;
    this.fetchImpl = fetchImpl;
  }

  async request(path, fields) {
    if (!this.stagingApiKey || !this.accountEmail) {
      const error = new Error('Roqqu staging is not configured on the backend.');
      error.code = 'ROQQU_NOT_CONFIGURED'; error.statusCode = 503; throw error;
    }
    const body = new URLSearchParams({ email: this.accountEmail, ...fields });
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-staging-api-key': this.stagingApiKey
      },
      body
    });
    if (!response.ok) {
      const error = new Error('Roqqu staging returned an unsuccessful response.');
      error.code = 'ROQQU_UPSTREAM_ERROR'; error.statusCode = 502; throw error;
    }
    let data;
    try { data = await response.json(); } catch {
      const error = new Error('Roqqu staging returned an invalid response.');
      error.code = 'ROQQU_INVALID_RESPONSE'; error.statusCode = 502; throw error;
    }
    if (data?.status !== 'success' || !data.data) {
      const error = new Error('Roqqu staging did not confirm the read request.');
      error.code = 'ROQQU_UPSTREAM_ERROR'; error.statusCode = 502; throw error;
    }
    return data.data;
  }

  async getBalances() { return this.request('/balances', {}); }
  async getHistory(filters = {}) {
    const allowed = ['token', 'network', 'direction', 'timestamp', 'status'];
    const fields = Object.fromEntries(allowed.filter((key) => filters[key] !== undefined).map((key) => [key, String(filters[key])]));
    return this.request('/history', fields);
  }
}

export function roqquMockData() {
  return { balances: structuredClone(DEMO_ROQQU_BALANCES), history: structuredClone(DEMO_ROQQU_HISTORY) };
}
