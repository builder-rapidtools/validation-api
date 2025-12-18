# Contract Tests

Contract tests for the RapidTools Validation API.

## Running Tests

### Prerequisites

Set required environment variables:

```bash
export TEST_BASE_URL="https://rapidtools-validation-api.jamesredwards89.workers.dev"
export TEST_API_KEY="your-api-key"
```

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test tests/validation-contract.test.ts
```

### Run in Watch Mode

```bash
npm test -- --watch
```

## Test Files

### `validation-contract.test.ts`

Tests v1 contract compliance for the validation API:

**Health Check**
- Service health without authentication

**List Types**
- Authentication required
- Lists supported validation types

**Validation**
- Valid CSV passes validation
- Invalid CSV returns structured errors
- Missing type returns error
- Missing content returns error
- Unsupported type returns error

**Idempotency**
- Same key + same payload → Returns cached response with `replayed: true`
- Same key + different content → Returns `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`
- Same key + different type → Returns `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`
- Different keys + same payload → Creates new validations (not cached)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TEST_BASE_URL` | No | API base URL (default: https://rapidtools-validation-api.jamesredwards89.workers.dev) |
| `TEST_API_KEY` | Yes | Valid API key for testing |

**Note**: Tests requiring authentication will be skipped if `TEST_API_KEY` is not set.

## CI/CD Integration

For CI/CD pipelines, set environment variables as secrets:

```yaml
env:
  TEST_BASE_URL: https://rapidtools-validation-api.jamesredwards89.workers.dev
  TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
```

## Test Data

Tests use sample GA4 CSV data:

**Valid CSV**:
```csv
date,sessions,users,pageviews
2024-01-01,100,50,200
2024-01-02,120,60,240
2024-01-03,110,55,220
```

**Invalid CSV** (missing required 'users' header):
```csv
date,sessions,pageviews
2024-01-01,100,200
2024-01-02,120,240
```
