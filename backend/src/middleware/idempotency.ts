import { sha256 } from '../utils/crypto';
import { stableStringify } from '../utils/stable-stringify';
import { Env, ValidationRequest, ValidationResponse, IdempotencyMetadata } from '../types';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Compute deterministic fingerprint for a validation request
 */
export async function computeFingerprint(request: ValidationRequest): Promise<string> {
  const contentHash = await sha256(request.content);
  const optionsStr = stableStringify(request.options || {});
  const contextStr = stableStringify(request.context || {});

  const composite = `${request.type}${contentHash}${optionsStr}${contextStr}`;
  return await sha256(composite);
}

/**
 * Check for existing idempotent response
 * Returns the stored response if found, or null if not found
 * Throws an error (409) if idempotency key is reused with different fingerprint
 */
export async function checkIdempotency(
  env: Env,
  idempotencyKey: string,
  apiKey: string,
  fingerprint: string,
  requestId?: string
): Promise<ValidationResponse | null> {
  const apiKeyHash = await sha256(apiKey);
  const kvKey = `idem:${apiKeyHash}:${idempotencyKey}:${fingerprint}`;

  // Check if exact match exists
  const stored = await env.IDEMPOTENCY_KV.get(kvKey, 'json');
  if (stored) {
    const metadata = stored as IdempotencyMetadata;
    const response = metadata.response;

    // Add idempotency metadata to response
    if (response.ok) {
      response.idempotency = {
        key: idempotencyKey,
        replayed: true,
      };
    } else {
      response.idempotency = {
        key: idempotencyKey,
        replayed: true,
      };
    }

    return response;
  }

  // Check if same idempotency key exists with different fingerprint
  const listResult = await env.IDEMPOTENCY_KV.list({
    prefix: `idem:${apiKeyHash}:${idempotencyKey}:`,
  });

  if (listResult.keys.length > 0) {
    // Same idempotency key, different fingerprint
    throw new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH',
          message: 'Idempotency key was already used with different request parameters',
          ...(requestId && { request_id: requestId }),
        },
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

/**
 * Store validation response for idempotency
 */
export async function storeIdempotentResponse(
  env: Env,
  idempotencyKey: string,
  apiKey: string,
  fingerprint: string,
  response: ValidationResponse
): Promise<void> {
  const apiKeyHash = await sha256(apiKey);
  const kvKey = `idem:${apiKeyHash}:${idempotencyKey}:${fingerprint}`;

  const metadata: IdempotencyMetadata = {
    key: idempotencyKey,
    fingerprint,
    response,
    timestamp: Date.now(),
  };

  await env.IDEMPOTENCY_KV.put(
    kvKey,
    JSON.stringify(metadata),
    { expirationTtl: IDEMPOTENCY_TTL_SECONDS }
  );
}
