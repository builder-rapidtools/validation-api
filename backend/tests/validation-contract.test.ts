/**
 * Contract tests for RapidTools Validation API
 *
 * Tests that the API correctly implements the v1 contract:
 * - Health check (no auth)
 * - Types listing (auth required)
 * - Validation with valid CSV
 * - Validation with invalid CSV
 * - Idempotency semantics (24h TTL, 409 on mismatch)
 */

import { describe, test, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'https://rapidtools-validation-api.jamesredwards89.workers.dev';
const API_KEY = process.env.TEST_API_KEY;

// Skip auth-required tests if API key is not set
const shouldSkipAuth = !API_KEY;

// Sample valid GA4 CSV (with text: prefix required by API)
const VALID_CSV = `text:date,sessions,users,pageviews
2024-01-01,100,50,200
2024-01-02,120,60,240
2024-01-03,110,55,220`;

// Sample invalid GA4 CSV (missing required header 'users')
const INVALID_CSV = `text:date,sessions,pageviews
2024-01-01,100,200
2024-01-02,120,240`;

describe('Health Check', () => {
  test('should return service health without authentication', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.service).toBe('rapidtools-validation');
    expect(data.data.version).toBeDefined();
  });
});

describe('List Types', () => {
  test.skipIf(shouldSkipAuth)('should require authentication', async () => {
    const response = await fetch(`${BASE_URL}/api/types`);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  test.skipIf(shouldSkipAuth)('should list supported validation types', async () => {
    const response = await fetch(`${BASE_URL}/api/types`, {
      headers: {
        'x-api-key': API_KEY!,
      },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.types).toBeDefined();
    expect(Array.isArray(data.types)).toBe(true);
    expect(data.types.length).toBeGreaterThan(0);
    expect(data.types[0].type).toBe('csv.timeseries.ga4.v1');
  });
});

describe('Validation', () => {
  test.skipIf(shouldSkipAuth)('should validate valid CSV successfully', async () => {
    const response = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'csv.timeseries.ga4.v1',
        content: VALID_CSV,
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.summary.valid).toBe(true);
    expect(data.summary.issues).toBe(0);
    expect(data.summary.rows).toBe(3);
    expect(data.findings).toBeDefined();
    expect(Array.isArray(data.findings)).toBe(true);
  });

  test.skipIf(shouldSkipAuth)('should return validation errors for invalid CSV', async () => {
    const response = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'csv.timeseries.ga4.v1',
        content: INVALID_CSV,
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('VALIDATION_FAILED');
    expect(data.findings).toBeDefined();
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.findings.length).toBeGreaterThan(0);

    // Should have error about missing 'users' header
    const missingHeaderError = data.findings.find((f: any) => f.code === 'MISSING_REQUIRED_HEADERS');
    expect(missingHeaderError).toBeDefined();
  });

  test.skipIf(shouldSkipAuth)('should return error when type is missing', async () => {
    const response = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: VALID_CSV,
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('MISSING_TYPE');
  });

  test.skipIf(shouldSkipAuth)('should return error when content is missing', async () => {
    const response = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'csv.timeseries.ga4.v1',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('MISSING_CONTENT');
  });

  test.skipIf(shouldSkipAuth)('should return error for unsupported type', async () => {
    const response = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'csv.unsupported.type.v1',
        content: VALID_CSV,
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('UNSUPPORTED_TYPE');
  });
});

describe('Idempotency Contract', () => {
  test.skipIf(shouldSkipAuth)('should return cached response when same idempotency key is used with same payload', async () => {
    const idempotencyKey = `test-replay-${Date.now()}`;
    const payload = {
      type: 'csv.timeseries.ga4.v1',
      content: VALID_CSV,
    };

    // First request - should succeed
    const response1 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const data1 = await response1.json();

    expect(response1.status).toBe(200);
    expect(data1.ok).toBe(true);
    expect(data1.summary.valid).toBe(true);
    expect(data1.idempotency).toBeDefined();
    expect(data1.idempotency.key).toBe(idempotencyKey);
    expect(data1.idempotency.replayed).toBe(false);

    // Second request with same key and same payload - should return cached response
    const response2 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const data2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(data2.ok).toBe(true);
    expect(data2.idempotency).toBeDefined();
    expect(data2.idempotency.key).toBe(idempotencyKey);
    expect(data2.idempotency.replayed).toBe(true);

    // Results should be identical (same summary, findings)
    expect(data2.summary).toEqual(data1.summary);
  });

  test.skipIf(shouldSkipAuth)('should return 409 when same idempotency key is used with different payload', async () => {
    const idempotencyKey = `test-mismatch-${Date.now()}`;

    // First request with original CSV
    const response1 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        type: 'csv.timeseries.ga4.v1',
        content: VALID_CSV,
      }),
    });

    const data1 = await response1.json();

    expect(response1.status).toBe(200);
    expect(data1.ok).toBe(true);

    // Second request with same key but different CSV content - should get 409
    const differentCSV = `text:date,sessions,users,pageviews
2024-02-01,200,100,400
2024-02-02,220,110,440`;

    const response2 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        type: 'csv.timeseries.ga4.v1',
        content: differentCSV,
      }),
    });

    const data2 = await response2.json();

    expect(response2.status).toBe(409);
    expect(data2.ok).toBe(false);
    expect(data2.error.code).toBe('IDEMPOTENCY_KEY_REUSE_MISMATCH');
    expect(data2.error.message).toContain('different request parameters');
  });

  test.skipIf(shouldSkipAuth)('should return 409 when same key is used with different type', async () => {
    const idempotencyKey = `test-type-mismatch-${Date.now()}`;

    // First request with GA4 type
    const response1 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        type: 'csv.timeseries.ga4.v1',
        content: VALID_CSV,
      }),
    });

    expect(response1.status).toBe(200);

    // Second request with same key but attempt with different type (will error as unsupported, but should 409 first)
    const response2 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        type: 'csv.different.type.v1',
        content: VALID_CSV,
      }),
    });

    const data2 = await response2.json();

    expect(response2.status).toBe(409);
    expect(data2.ok).toBe(false);
    expect(data2.error.code).toBe('IDEMPOTENCY_KEY_REUSE_MISMATCH');
  });

  test.skipIf(shouldSkipAuth)('should allow different idempotency keys with same payload', async () => {
    const payload = {
      type: 'csv.timeseries.ga4.v1',
      content: VALID_CSV,
    };

    // First request with key1
    const response1 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': `test-key1-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    const data1 = await response1.json();

    expect(response1.status).toBe(200);
    expect(data1.ok).toBe(true);
    expect(data1.idempotency.replayed).toBe(false);

    // Second request with different key but same payload - should succeed
    const response2 = await fetch(`${BASE_URL}/api/validate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY!,
        'content-type': 'application/json',
        'idempotency-key': `test-key2-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    const data2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(data2.ok).toBe(true);
    expect(data2.idempotency.replayed).toBe(false); // New key = not replayed
  });
});
