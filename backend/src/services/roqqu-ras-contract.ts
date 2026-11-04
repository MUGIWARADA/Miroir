export type RasEncoding = 'none' | 'query' | 'form' | 'json' | 'undocumented';
export type RasAuth = 'required' | 'unspecified' | 'public';
export type RasEffect =
  | 'read'
  | 'ledger-write'
  | 'wallet-write'
  | 'onchain-write'
  | 'account-write'
  | 'webhook-action'
  | 'payment-link-write';
export type RasDataKind = 'object' | 'array' | 'null' | 'unknown';

export interface RasEndpointContract {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  auth: RasAuth;
  encoding: RasEncoding;
  pathParams?: readonly string[];
  queryFields?: readonly string[];
  bodyFields?: readonly string[];
  requiredFields?: readonly string[];
  responseData: RasDataKind;
  responseFields?: readonly string[];
  responseItemFields?: readonly string[];
  effect: RasEffect;
  docs: string;
  note?: string;
}

const doc = (path: string) => `https://roqqu-api-services.gitbook.io/ras/${path}.md`;

/**
 * Contract inventory transcribed from the published RAS docs. `unspecified`
 * and `undocumented` are deliberate: those pages omit or contradict details.
 * This registry is not wired to a frontend route and does not make sandbox calls.
 */
export const RAS_ENDPOINTS = [
  {
    id: 'tokens.list',
    method: 'GET',
    path: '/tokens',
    auth: 'public',
    encoding: 'none',
    responseData: 'object',
    responseFields: ['tokens', 'tokenConfigs'],
    effect: 'read',
    docs: doc('trade/get-tokens'),
  },
  {
    id: 'balances.get',
    method: 'POST',
    path: '/balances',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['email', 'token'],
    responseData: 'object',
    responseFields: ['balance'],
    effect: 'read',
    docs: doc('balances/get-crypto-balances'),
    note: 'Both request fields are optional in the docs.',
  },
  {
    id: 'history.list',
    method: 'POST',
    path: '/history',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['token', 'email', 'network', 'direction', 'timestamp', 'status'],
    requiredFields: ['email'],
    responseData: 'object',
    responseFields: ['history'],
    effect: 'read',
    docs: doc('history/get-transaction-history'),
    note: 'Page example omits auth; top-level auth policy is not stated.',
  },
  {
    id: 'trade.buy',
    method: 'POST',
    path: '/trade/buy',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['amount', 'token'],
    requiredFields: ['amount', 'token'],
    responseData: 'null',
    effect: 'ledger-write',
    docs: doc('trade/buy'),
    note: 'Ledger operation; response data is null and no webhook is emitted.',
  },
  {
    id: 'trade.sell',
    method: 'POST',
    path: '/trade/sell',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['amount', 'token'],
    requiredFields: ['amount', 'token'],
    responseData: 'null',
    effect: 'ledger-write',
    docs: doc('trade/sell'),
    note: 'Auth prose requires a key, but the example request omits it.',
  },
  {
    id: 'trade.swap',
    method: 'POST',
    path: '/trade/swap',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['amount', 'from', 'to'],
    requiredFields: ['amount', 'from', 'to'],
    responseData: 'null',
    effect: 'ledger-write',
    docs: doc('trade/swap'),
    note: 'Amount is documented as integer although token quantities may be fractional; auth omitted.',
  },
  {
    id: 'transaction.fee',
    method: 'GET',
    path: '/transaction/fee',
    auth: 'required',
    encoding: 'query',
    queryFields: ['token', 'amount'],
    responseData: 'object',
    responseFields: ['percentage', 'symbol'],
    effect: 'read',
    docs: doc('transaction/get-transaction-fees'),
  },

  {
    id: 'wallet.get-by-token',
    method: 'POST',
    path: '/wallets/get-wallet',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['token'],
    requiredFields: ['token'],
    responseData: 'object',
    responseFields: ['token', 'send', 'receive'],
    effect: 'read',
    docs: doc('wallets/get-wallet-by-token'),
  },
  {
    id: 'wallet.addresses',
    method: 'POST',
    path: '/wallets/get-addresses',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['network'],
    requiredFields: ['network'],
    responseData: 'array',
    responseItemFields: [
      'address',
      'network',
      'total_received',
      'genesis',
      'customer',
      'created_at',
      'updated_at',
    ],
    effect: 'read',
    docs: doc('wallets/get-addresses'),
  },
  {
    id: 'wallet.generate-customer',
    method: 'POST',
    path: '/wallets/generate-wallet',
    auth: 'required',
    encoding: 'json',
    bodyFields: ['network', 'customer'],
    requiredFields: ['network', 'customer'],
    responseData: 'object',
    responseFields: ['address'],
    effect: 'wallet-write',
    docs: doc('wallets/generate-wallet'),
  },
  {
    id: 'wallet.send',
    method: 'POST',
    path: '/wallets/send',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['amount', 'network', 'to', 'token'],
    requiredFields: ['amount', 'network', 'to', 'token'],
    responseData: 'object',
    responseFields: ['refid'],
    effect: 'onchain-write',
    docs: doc('wallets/send-coin'),
  },
  {
    id: 'wallet.delete',
    method: 'DELETE',
    path: '/wallets/delete',
    auth: 'required',
    encoding: 'undocumented',
    bodyFields: ['network', 'address'],
    requiredFields: ['network', 'address'],
    responseData: 'null',
    effect: 'wallet-write',
    docs: doc('wallets/delete-wallet'),
    note: 'Request encoding/body placement is not documented.',
  },
  {
    id: 'wallet.what-network',
    method: 'POST',
    path: '/wallets/what-network',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['address'],
    requiredFields: ['address'],
    responseData: 'array',
    effect: 'read',
    docs: doc('wallets/what-network'),
  },
  {
    id: 'wallet.networks',
    method: 'POST',
    path: '/wallets/get-all-networks',
    auth: 'unspecified',
    encoding: 'form',
    responseData: 'array',
    effect: 'read',
    docs: doc('wallets/get-all-networks'),
  },
  {
    id: 'wallet.network',
    method: 'POST',
    path: '/wallets/get-network',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['network'],
    requiredFields: ['network'],
    responseData: 'object',
    effect: 'read',
    docs: doc('wallets/get-a-network'),
  },
  {
    id: 'wallet.generate-merchant',
    method: 'POST',
    path: '/wallets/generate-merchant-wallet',
    auth: 'required',
    encoding: 'json',
    bodyFields: ['network'],
    requiredFields: ['network'],
    responseData: 'object',
    effect: 'wallet-write',
    docs: doc('wallets/generate-wallet-for-self'),
  },

  {
    id: 'customers.list',
    method: 'GET',
    path: '/customers',
    auth: 'unspecified',
    encoding: 'none',
    responseData: 'array',
    responseItemFields: [
      'id',
      'email',
      'first_name',
      'last_name',
      'phone_number',
      'blacklisted',
      'verified',
      'created_at',
    ],
    effect: 'read',
    docs: doc('customers/get-all-customers'),
  },
  {
    id: 'customers.blacklist',
    method: 'POST',
    path: '/customers/blacklist',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['email', 'reason'],
    requiredFields: ['email', 'reason'],
    responseData: 'unknown',
    effect: 'account-write',
    docs: doc('customers/blacklist-customer'),
  },
  {
    id: 'customers.whitelist',
    method: 'POST',
    path: '/customers/whitelist',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['email', 'reason'],
    requiredFields: ['email', 'reason'],
    responseData: 'unknown',
    effect: 'account-write',
    docs: doc('customers/whitelist-customer'),
  },
  {
    id: 'ip.list',
    method: 'GET',
    path: '/ip',
    auth: 'required',
    encoding: 'none',
    responseData: 'array',
    responseItemFields: ['id', 'merchant', 'ip_name', 'ip_address', 'created_at', 'updated_at'],
    effect: 'read',
    docs: doc('ip-whitelist/get-whitelisted-ips'),
  },
  {
    id: 'ip.add',
    method: 'POST',
    path: '/ip',
    auth: 'unspecified',
    encoding: 'form',
    bodyFields: ['ip_name', 'ip_address'],
    requiredFields: ['ip_name', 'ip_address'],
    responseData: 'array',
    effect: 'account-write',
    docs: doc('ip-whitelist/whitelist-ip'),
  },

  {
    id: 'webhooks.get-config',
    method: 'GET',
    path: '/webhooks',
    auth: 'unspecified',
    encoding: 'none',
    responseData: 'object',
    effect: 'read',
    docs: doc('webhooks/get-webhook-url'),
  },
  {
    id: 'webhooks.retrigger',
    method: 'POST',
    path: '/webhooks/retrigger',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['transaction_hash'],
    requiredFields: ['transaction_hash'],
    responseData: 'object',
    effect: 'webhook-action',
    docs: doc('webhooks/retrigger-webhook-events'),
  },

  {
    id: 'analytics.volume',
    method: 'GET',
    path: '/analytics/volume',
    auth: 'unspecified',
    encoding: 'query',
    queryFields: ['interval'],
    responseData: 'array',
    responseItemFields: ['date', 'value'],
    effect: 'read',
    docs: doc('analytics/get-volume-chart'),
  },
  {
    id: 'analytics.wallet-generation',
    method: 'GET',
    path: '/analytics/wallet-generation',
    auth: 'unspecified',
    encoding: 'none',
    responseData: 'array',
    responseItemFields: ['date', 'value'],
    effect: 'read',
    docs: doc('analytics/get-wallet-generation-chart'),
  },
  {
    id: 'analytics.stats',
    method: 'GET',
    path: '/analytics/stats',
    auth: 'required',
    encoding: 'none',
    responseData: 'object',
    responseFields: ['total_volume', 'total_credit', 'total_debit'],
    effect: 'read',
    docs: doc('analytics/get-stats'),
  },
  {
    id: 'analytics.wallet-stats',
    method: 'GET',
    path: '/analytics/wallet-stats',
    auth: 'unspecified',
    encoding: 'none',
    responseData: 'object',
    responseFields: ['totalWalletGenerated', 'totalDeletedWallets', 'breakdownByNetwork'],
    effect: 'read',
    docs: doc('analytics/get-wallet-metrics'),
  },

  {
    id: 'transaction.deposits',
    method: 'GET',
    path: '/transaction/token-deposit',
    auth: 'required',
    encoding: 'none',
    responseData: 'array',
    responseItemFields: [
      'ref',
      'status',
      'genesis',
      'email',
      'value',
      'network',
      'token',
      'address',
      'sender',
      'tx_hash',
      'created_at',
      'updated_at',
    ],
    effect: 'read',
    docs: doc('transaction/token-deposits'),
  },
  {
    id: 'transaction.withdrawals',
    method: 'GET',
    path: '/transaction/token-withdrawal',
    auth: 'required',
    encoding: 'none',
    responseData: 'array',
    responseItemFields: [
      'id',
      'refid',
      'status',
      'email',
      'value',
      '_to',
      'token',
      'network',
      'fee',
      'tx_hash',
      'processed_at',
      'created_at',
      'updated_at',
    ],
    effect: 'read',
    docs: doc('transaction/token-withdrawals'),
  },
  {
    id: 'transaction.deposit-by-hash',
    method: 'GET',
    path: '/transaction/deposit/:tx_hash',
    auth: 'required',
    encoding: 'none',
    pathParams: ['tx_hash'],
    requiredFields: ['tx_hash'],
    responseData: 'object',
    responseFields: [
      'ref',
      'status',
      'genesis',
      'email',
      'value',
      'network',
      'token',
      'address',
      'sender',
      'tx_hash',
      'created_at',
      'updated_at',
    ],
    effect: 'read',
    docs: doc('transaction/get-transaction-by-transaction-hash'),
  },
  {
    id: 'transaction.status-by-hash',
    method: 'GET',
    path: '/transaction/status/:tx_hash',
    auth: 'required',
    encoding: 'none',
    pathParams: ['tx_hash'],
    requiredFields: ['tx_hash'],
    responseData: 'object',
    responseFields: ['status', 'email', 'value', 'network'],
    effect: 'read',
    docs: doc('transaction/get-transaction-status-by-transaction-hash'),
  },
  {
    id: 'transaction.send-by-ref',
    method: 'GET',
    path: '/transaction/refId/:refid',
    auth: 'required',
    encoding: 'none',
    pathParams: ['refid'],
    requiredFields: ['refid'],
    responseData: 'object',
    responseFields: [
      'id',
      'refid',
      'status',
      'email',
      'value',
      '_to',
      'token',
      'network',
      'fee',
      'tx_hash',
      'created_at',
      'updated_at',
    ],
    effect: 'read',
    docs: doc('transaction/get-send-withdrawal-queue-record-by-reference-id'),
  },
  {
    id: 'transaction.search-chain',
    method: 'POST',
    path: '/transaction/search-blockchain-txhash',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['tx_hash', 'network'],
    requiredFields: ['tx_hash', 'network'],
    responseData: 'unknown',
    effect: 'read',
    docs: doc('transaction/search-transaction-on-blockchain'),
    note: 'Successful data shape varies by network; sometimes a JSON string.',
  },
  {
    id: 'transaction.requery',
    method: 'POST',
    path: '/transaction/requery/:network',
    auth: 'required',
    encoding: 'form',
    pathParams: ['network'],
    bodyFields: ['tx_hash'],
    requiredFields: ['network', 'tx_hash'],
    responseData: 'null',
    effect: 'webhook-action',
    docs: doc('transaction/requery-transaction'),
  },
  {
    id: 'transaction.refund',
    method: 'POST',
    path: '/transaction/refund',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['refid'],
    requiredFields: ['refid'],
    responseData: 'null',
    effect: 'onchain-write',
    docs: doc('transaction/refund-transaction'),
    note: 'May queue a refund; requires an eligible failed send at least one hour old.',
  },
  {
    id: 'transaction.network-fee',
    method: 'POST',
    path: '/transaction/network-fee',
    auth: 'required',
    encoding: 'form',
    bodyFields: ['network'],
    requiredFields: ['network'],
    responseData: 'object',
    effect: 'read',
    docs: doc('transaction/get-network-fees'),
  },

  {
    id: 'market.prices',
    method: 'GET',
    path: '/prices',
    auth: 'unspecified',
    encoding: 'none',
    responseData: 'unknown',
    effect: 'read',
    docs: doc('market-data/get-crypto-prices'),
    note: 'The page omits the example response schema.',
  },
  {
    id: 'market.rates',
    method: 'GET',
    path: '/rates',
    auth: 'unspecified',
    encoding: 'none',
    responseData: 'unknown',
    effect: 'read',
    docs: doc('market-data/get-fiat-rates'),
    note: 'The page omits the example response schema.',
  },

  {
    id: 'payment-links.networks',
    method: 'GET',
    path: '/payment-links/supported-networks',
    auth: 'public',
    encoding: 'none',
    responseData: 'object',
    responseFields: ['supported_networks'],
    effect: 'read',
    docs: doc('payment-links/get-supported-networks'),
  },
  {
    id: 'payment-links.create',
    method: 'POST',
    path: '/payment-links',
    auth: 'required',
    encoding: 'form',
    bodyFields: [
      'amount',
      'customer_details',
      'payment_reference',
      'success_url',
      'cancel_url',
      'expires_at',
      'metadata',
      'amount_currency',
      'wallets',
    ],
    requiredFields: [
      'amount',
      'customer_details',
      'payment_reference',
      'success_url',
      'cancel_url',
    ],
    responseData: 'object',
    responseFields: [
      'refid',
      'payment_reference',
      'payment_link',
      'wallets',
      'wallet_pre_generated',
      'amount_required',
      'amount_currency',
      'expires_at',
    ],
    effect: 'payment-link-write',
    docs: doc('payment-links/create-payment-link'),
  },
] as const satisfies readonly RasEndpointContract[];

export interface RasApiEnvelope {
  status: string;
  message?: string;
  data?: unknown;
}

export class RasApiError extends Error {
  constructor(
    message: string,
    readonly operationId: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'RasApiError';
  }
}

export interface RasClientOptions {
  apiKey: string;
  /** Only the official Roqqu RAS HTTPS origin and /v1 path are accepted. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const RAS_API_BASE_URL = 'https://service.roqqu.com/v1';

export class RoqquRasClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: RasClientOptions) {
    let baseUrl: URL;
    try {
      baseUrl = new URL(options.baseUrl || RAS_API_BASE_URL);
    } catch {
      throw new Error('RAS base URL must be the official Roqqu HTTPS API URL.');
    }
    if (
      baseUrl.protocol !== 'https:' ||
      baseUrl.hostname !== 'service.roqqu.com' ||
      baseUrl.port !== '' ||
      baseUrl.username !== '' ||
      baseUrl.password !== '' ||
      baseUrl.search !== '' ||
      baseUrl.hash !== '' ||
      !['/v1', '/v1/'].includes(baseUrl.pathname)
    ) {
      throw new Error('RAS requests are restricted to https://service.roqqu.com/v1.');
    }
    this.baseUrl = RAS_API_BASE_URL;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async request<T = unknown>(
    operationId: string,
    values: Record<string, unknown> = {},
  ): Promise<T> {
    const operation = RAS_ENDPOINTS.find((item) => item.id === operationId) as
      | RasEndpointContract
      | undefined;
    if (!operation) throw new RasApiError('Unknown RAS operation.', operationId);
    if (!this.options.apiKey.trim())
      throw new RasApiError('RAS test API key is not configured.', operationId);

    const pathParams = operation.pathParams || [];
    const queryFields = operation.queryFields || [];
    const bodyFields = operation.bodyFields || [];
    const allowed = new Set([...pathParams, ...queryFields, ...bodyFields]);
    const extras = Object.keys(values).filter((key) => !allowed.has(key));
    if (extras.length)
      throw new RasApiError(`Unexpected parameter: ${extras.join(', ')}.`, operationId);
    const missing = (operation.requiredFields || []).filter(
      (field) => values[field] === undefined || values[field] === null || values[field] === '',
    );
    if (missing.length)
      throw new RasApiError(`Missing required parameter: ${missing.join(', ')}.`, operationId);

    let path = operation.path;
    for (const key of pathParams) {
      const value = values[key];
      if (value === undefined || value === null || value === '')
        throw new RasApiError(`Missing path parameter: ${key}.`, operationId);
      path = path.replace(`:${key}`, encodeURIComponent(String(value)));
    }

    const url = new URL(`${this.baseUrl}${path}`);
    for (const key of queryFields) {
      if (values[key] !== undefined && values[key] !== null)
        url.searchParams.set(key, String(values[key]));
    }

    if (operation.encoding === 'undocumented' && bodyFields.length) {
      throw new RasApiError(
        'RAS docs do not specify this request encoding; refusing to guess.',
        operationId,
      );
    }

    const headers = new Headers({ Accept: 'application/json' });
    // All non-public operations use the test key header; the key is never placed in a URL or body.
    if (operation.auth !== 'public') headers.set('x-staging-api-key', this.options.apiKey);

    let body: string | undefined;
    if (operation.encoding === 'form') {
      const form = new URLSearchParams();
      for (const key of bodyFields) {
        const value = values[key];
        if (value !== undefined && value !== null)
          form.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      headers.set('Content-Type', 'application/x-www-form-urlencoded');
      body = form.toString();
    } else if (operation.encoding === 'json') {
      const payload: Record<string, unknown> = {};
      for (const key of bodyFields) if (values[key] !== undefined) payload[key] = values[key];
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(payload);
    } else if (operation.encoding === 'undocumented' && !bodyFields.length) {
      // No body needed; the docs' encoding ambiguity applies only when there are body fields.
    } else if (operation.encoding === 'none' && bodyFields.length) {
      throw new RasApiError('RAS contract has body fields but no body encoding.', operationId);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: operation.method,
        headers,
        redirect: 'error',
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new RasApiError('Could not reach the RAS API.', operationId);
    }

    let envelope: RasApiEnvelope;
    try {
      envelope = (await response.json()) as RasApiEnvelope;
    } catch {
      throw new RasApiError('RAS returned a non-JSON response.', operationId, response.status);
    }
    if (!response.ok || envelope.status !== 'success') {
      // Do not include request headers or configuration values in errors.
      throw new RasApiError(
        envelope.message || `RAS request failed (${response.status}).`,
        operationId,
        response.status,
      );
    }
    validateDataKind(operation.responseData, envelope.data, operationId, response.status);
    validateResponseFields(operation, envelope.data, response.status);
    return envelope.data as T;
  }
}

function validateResponseFields(
  operation: RasEndpointContract,
  data: unknown,
  statusCode: number,
): void {
  const hasFields = (value: unknown, fields: readonly string[]) =>
    typeof value === 'object' && value !== null && fields.every((field) => field in value);
  if (operation.responseFields?.length && !hasFields(data, operation.responseFields)) {
    throw new RasApiError(
      'RAS response is missing documented data fields.',
      operation.id,
      statusCode,
    );
  }
  if (
    operation.responseItemFields?.length &&
    Array.isArray(data) &&
    data.some((item) => !hasFields(item, operation.responseItemFields || []))
  ) {
    throw new RasApiError(
      'RAS response items are missing documented fields.',
      operation.id,
      statusCode,
    );
  }
}

function validateDataKind(
  kind: RasDataKind,
  data: unknown,
  operationId: string,
  statusCode: number,
): void {
  if (kind === 'unknown') return;
  if (kind === 'null' && data !== null)
    throw new RasApiError(
      'RAS response data did not match the documented null shape.',
      operationId,
      statusCode,
    );
  if (kind === 'object' && (typeof data !== 'object' || data === null || Array.isArray(data)))
    throw new RasApiError('RAS response data was not an object.', operationId, statusCode);
  if (kind === 'array' && !Array.isArray(data))
    throw new RasApiError('RAS response data was not an array.', operationId, statusCode);
}
