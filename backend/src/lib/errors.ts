export interface ApiErrorDetail {
  row?: number;
  field?: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFound(message = 'Resource not found'): never {
  throw new ApiError(404, 'not_found', message);
}

export function badRequest(message: string, details: ApiErrorDetail[] = []): never {
  throw new ApiError(400, 'bad_request', message, details);
}

export function unauthorized(message = 'Missing or invalid bearer token'): never {
  throw new ApiError(401, 'unauthorized', message);
}

export function forbidden(message = 'Forbidden'): never {
  throw new ApiError(403, 'forbidden', message);
}
