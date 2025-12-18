import { json, IRequest } from 'itty-router';
import type { Env } from '../types';

function parseApiKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// NON-async middleware: must either return a Response or return undefined to continue
export function requireAuth(request: IRequest, env: Env, requestId?: string) {
  const presented = request.headers.get('x-api-key')?.trim();
  const allowedKeys = parseApiKeys(env.VALIDATION_API_KEYS);

  if (allowedKeys.length === 0) {
    return json(
      {
        ok: false,
        error: {
          code: 'CONFIG_ERROR',
          message:
            'VALIDATION_API_KEYS is not configured. For local dev, set it in .dev.vars. For deploy, set via wrangler secret put.',
          ...(requestId && { request_id: requestId }),
        },
      },
      { status: 500 },
    );
  }

  if (!presented || !allowedKeys.includes(presented)) {
    return json(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid x-api-key', ...(requestId && { request_id: requestId }) },
      },
      { status: 401 },
    );
  }

  (request as any).apiKey = presented;
  return;
}