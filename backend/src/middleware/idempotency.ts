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

  // First check if this idempotency key has been used before (stored fingerprint)
  const fingerprintKey = `idem-fp:${apiKeyHash}:${idempotencyKey}`;
  const storedFingerprint = await env.IDEMPOTENCY_KV.get(fingerprintKey, 'text');

  if (storedFingerprint) {
    // Idempotency key exists - check if fingerprint matches
    if (storedFingerprint !== fingerprint) {
      // Same key, different fingerprint = conflict
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

    // Fingerprint matches - retrieve cached response
    const kvKey = `idem:${apiKeyHash}:${idempotencyKey}:${fingerprint}`;
    const stored = await env.IDEMPOTENCY_KV.get(kvKey, 'json');
    if (stored) {
      const metadata = stored as IdempotencyMetadata;
      const response = metadata.response;

      // Add idempotency metadata to response
      response.idempotency = {
        key: idempotencyKey,
        replayed: true,
      };

      return response;
    }
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

  // Store the response with the full key including fingerprint
  await env.IDEMPOTENCY_KV.put(
    kvKey,
    JSON.stringify(metadata),
    { expirationTtl: IDEMPOTENCY_TTL_SECONDS }
  );

  // Also store the fingerprint separately for conflict detection
  const fingerprintKey = `idem-fp:${apiKeyHash}:${idempotencyKey}`;
  await env.IDEMPOTENCY_KV.put(
    fingerprintKey,
    fingerprint,
    { expirationTtl: IDEMPOTENCY_TTL_SECONDS }
  );
}
