import type { Env, ValidationRequest, ValidationResponse } from './types';
import { requireAuth } from './middleware/auth';
import {
  computeFingerprint,
  checkIdempotency,
  storeIdempotentResponse,
} from './middleware/idempotency';
import { validateGA4CSV } from './validators/csv-ga4';
import { getRequestId, addTraceabilityHeaders } from './request-id';

function jsonResponse(body: unknown, status = 200, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function notFound(requestId?: string): Response {
  return jsonResponse(
    { ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found', ...(requestId && { request_id: requestId }) } },
    404,
    requestId,
  );
}

async function performValidation(req: ValidationRequest): Promise<ValidationResponse> {
  if (req.type === 'csv.timeseries.ga4.v1') {
    const result = validateGA4CSV(req.content, req.options);

    if (!result.summary.valid) {
      return {
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'CSV failed validation.' },
        findings: result.findings,
      };
    }

    return result;
  }

  return {
    ok: false,
    error: {
      code: 'UNSUPPORTED_TYPE',
      message: `Validation type "${req.type}" is not supported`,
    },
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Generate request ID at start of request
    const requestId = getRequestId(request as any);

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      // ✅ Always-works health endpoint
      if (method === 'GET' && path === '/health') {
        const response = jsonResponse({
          ok: true,
          status: {
            service: 'rapidtools-validation',
            version: env.SERVICE_VERSION || '1.0.0',
          },
        });
        return addTraceabilityHeaders(response, requestId);
      }

      // --- AUTHENTICATED ROUTES ---
      if (path.startsWith('/api/')) {
        // requireAuth returns a Response (stop) or undefined (continue)
        const maybeAuthResponse = requireAuth(request as any, env, requestId);
        if (maybeAuthResponse instanceof Response) {
          return addTraceabilityHeaders(maybeAuthResponse, requestId);
        }
      }

      // GET /api/types
      if (method === 'GET' && path === '/api/types') {
        const response = jsonResponse({
          ok: true,
          types: [
            {
              type: 'csv.timeseries.ga4.v1',
              description: 'CSV timeseries validation for Google Analytics 4 data',
              requiredHeaders: ['date', 'sessions', 'users'],
              optionalHeaders: ['pageviews'],
              options: {
                allowPageviewsMissing: 'boolean (default: false)',
                requireSortedByDateAsc: 'boolean (default: false)',
                allowDuplicateDates: 'boolean (default: false)',
                maxRows: 'number (default: 100000)',
              },
            },
          ],
        });
        return addTraceabilityHeaders(response, requestId);
      }

      // POST /api/validate
      if (method === 'POST' && path === '/api/validate') {
        let body: ValidationRequest;

        try {
          body = (await request.json()) as ValidationRequest;
        } catch {
          const response = jsonResponse(
            { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON', request_id: requestId } },
            400,
          );
          return addTraceabilityHeaders(response, requestId);
        }

        if (!body?.type) {
          const response = jsonResponse(
            { ok: false, error: { code: 'MISSING_TYPE', message: 'Validation type is required', request_id: requestId } },
            400,
          );
          return addTraceabilityHeaders(response, requestId);
        }

        if (!body?.content) {
          const response = jsonResponse(
            { ok: false, error: { code: 'MISSING_CONTENT', message: 'Content is required', request_id: requestId } },
            400,
          );
          return addTraceabilityHeaders(response, requestId);
        }

        const idempotencyKey = request.headers.get('Idempotency-Key');
        const apiKey = request.headers.get('x-api-key')?.trim();

        // No idempotency — validate and return
        if (!idempotencyKey || !apiKey) {
          const result = await performValidation(body);
          const response = jsonResponse(result, result.ok ? 200 : 422);
          return addTraceabilityHeaders(response, requestId);
        }

        // Idempotent path
        const fingerprint = await computeFingerprint(body);

        try {
          const existing = await checkIdempotency(env, idempotencyKey, apiKey, fingerprint, requestId);
          if (existing) {
            const response = jsonResponse(existing, existing.ok ? 200 : 422);
            return addTraceabilityHeaders(response, requestId);
          }
        } catch (e) {
          if (e instanceof Response) return addTraceabilityHeaders(e, requestId); // 409 conflict, etc.
          throw e;
        }

        const result = await performValidation(body);
        result.idempotency = { key: idempotencyKey, replayed: false };

        await storeIdempotentResponse(env, idempotencyKey, apiKey, fingerprint, result);

        const response = jsonResponse(result, result.ok ? 200 : 422);
        return addTraceabilityHeaders(response, requestId);
      }

      return addTraceabilityHeaders(notFound(requestId), requestId);
    } catch (err) {
      console.error('Unhandled error:', err);
      const response = jsonResponse(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred', request_id: requestId } },
        500,
      );
      return addTraceabilityHeaders(response, requestId);
    }
  },
};