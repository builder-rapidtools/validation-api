# RapidTools Validation API

API-first validation service built on Cloudflare Workers with x-api-key authentication and optional idempotency via KV storage.

## Features

- **API-first design** - REST API for validating various data formats
- **Authentication** - API key-based authentication via `x-api-key` header
- **Idempotency** - Optional request idempotency using KV storage (24h TTL)
- **Deterministic** - Validation results are consistent and reproducible
- **Type-safe** - Built with TypeScript for type safety
- **Fast** - Runs on Cloudflare's edge network

## API Endpoints

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "ok": true,
  "service": "rapidtools-validation",
  "version": "1.0.0"
}
```

### GET /api/types

Get list of supported validation types (authentication required).

**Headers:**
- `x-api-key` - Your API key

**Response:**
```json
{
  "ok": true,
  "types": [
    {
      "type": "csv.timeseries.ga4.v1",
      "description": "CSV timeseries validation for Google Analytics 4 data",
      "requiredHeaders": ["date", "sessions", "users"],
      "optionalHeaders": ["pageviews"],
      "options": {
        "allowPageviewsMissing": "boolean (default: false)",
        "requireSortedByDateAsc": "boolean (default: false)",
        "allowDuplicateDates": "boolean (default: false)",
        "maxRows": "number (default: 100000)"
      }
    }
  ]
}
```

### POST /api/validate

Validate input data (authentication required).

**Headers:**
- `x-api-key` - Your API key
- `Idempotency-Key` - (Optional) Idempotency key for request deduplication

**Request Body:**
```json
{
  "type": "csv.timeseries.ga4.v1",
  "content": "text:date,sessions,users\n2024-01-01,150,120",
  "options": {
    "requireSortedByDateAsc": true,
    "allowDuplicateDates": false,
    "maxRows": 100000
  },
  "context": {
    "source": "my-app"
  }
}
```

**Success Response (200):**
```json
{
  "ok": true,
  "summary": {
    "valid": true,
    "issues": 0,
    "warnings": 0,
    "rows": 1
  },
  "findings": [],
  "normalized": {
    "detectedHeaders": ["date", "sessions", "users"],
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-01-01"
    }
  },
  "idempotency": {
    "key": "my-idempotency-key",
    "replayed": false
  }
}
```

**Validation Failed Response (422):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "CSV failed validation."
  },
  "findings": [
    {
      "level": "error",
      "code": "MISSING_REQUIRED_HEADERS",
      "message": "Missing required headers: users",
      "pointer": {
        "missing": ["users"]
      }
    }
  ]
}
```

## Validation Type: csv.timeseries.ga4.v1

Validates CSV files containing Google Analytics 4 timeseries data.

### Required Headers
- `date` - ISO 8601 date (YYYY-MM-DD)
- `sessions` - Non-negative integer
- `users` - Non-negative integer

### Optional Headers
- `pageviews` - Non-negative integer

### Content Format

Content must be prefixed with either:
- `text:` - Plain text CSV data
- `base64:` - Base64-encoded CSV data

**Example with text prefix:**
```
text:date,sessions,users,pageviews
2024-01-01,150,120,450
2024-01-02,200,180,600
```

**Example with base64 prefix:**
```
base64:ZGF0ZSxzZXNzaW9ucyx1c2Vycwoy...
```

### Validation Options

- `allowPageviewsMissing` (boolean, default: false) - Allow missing pageviews column
- `requireSortedByDateAsc` (boolean, default: false) - Require dates to be sorted ascending
- `allowDuplicateDates` (boolean, default: false) - Allow duplicate dates
- `maxRows` (number, default: 100000) - Maximum number of data rows

### Validation Rules

1. All required headers must be present (case-sensitive)
2. Each row must have a valid ISO date (YYYY-MM-DD)
3. `sessions`, `users`, and `pageviews` must be non-negative integers
4. Dates must be sorted in ascending order (if `requireSortedByDateAsc` is true)
5. No duplicate dates (if `allowDuplicateDates` is false)
6. Total rows must not exceed `maxRows`

### Finding Codes

**Error Codes:**
- `INVALID_CONTENT_ENCODING` - Content must be prefixed with "base64:" or "text:"
- `EMPTY_CSV` - CSV file is empty
- `MISSING_REQUIRED_HEADERS` - Required headers are missing
- `INVALID_ROW_FORMAT` - Row has insufficient columns
- `INVALID_DATE_FORMAT` - Date is not in YYYY-MM-DD format
- `DUPLICATE_DATE` - Date appears multiple times
- `INVALID_SESSIONS_VALUE` - Sessions value is not a non-negative integer
- `INVALID_USERS_VALUE` - Users value is not a non-negative integer
- `INVALID_PAGEVIEWS_VALUE` - Pageviews value is not a non-negative integer
- `NOT_SORTED_BY_DATE` - Dates are not in ascending order
- `MAX_ROWS_EXCEEDED` - CSV exceeds maximum row count

**Warning Codes:**
- `MISSING_OPTIONAL_HEADER` - Optional header (pageviews) is missing

## Authentication

API authentication uses the `x-api-key` header. All endpoints under `/api/*` require authentication.

**Error Response (401):**
```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

## Idempotency

Idempotency ensures that multiple identical requests produce the same result without side effects.

### How it works

1. Client includes `Idempotency-Key` header in request
2. Server computes fingerprint: `sha256(type + sha256(content) + stableStringify(options) + stableStringify(context))`
3. Server checks KV storage for existing response with key: `idem:{apiKeyHash}:{idempotencyKey}:{fingerprint}`
4. If found, returns stored response with `replayed: true`
5. If not found, processes request and stores response for 24 hours

### Idempotency Key Reuse

If the same `Idempotency-Key` is used with different request parameters, the API returns a 409 Conflict:

```json
{
  "ok": false,
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSE_MISMATCH",
    "message": "Idempotency key was already used with different request parameters"
  }
}
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure KV Namespace

Create KV namespaces for development and production:

```bash
# Create preview namespace
wrangler kv:namespace create "IDEMPOTENCY_KV"

# Create production namespace
wrangler kv:namespace create "IDEMPOTENCY_KV" --env production
```

Update the namespace IDs in `wrangler.toml`.

### 3. Set API Keys

Set the `VALIDATION_API_KEYS` secret (comma-separated list):

```bash
# Development
wrangler secret put VALIDATION_API_KEYS
# Enter: key1,key2,key3

# Production
wrangler secret put VALIDATION_API_KEYS --env production
# Enter: prod-key-1,prod-key-2
```

### 4. Deploy

```bash
# Deploy to development
npm run deploy

# Deploy to production
npm run deploy:production
```

## Development

### Run Locally

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`.

### Type Checking

```bash
npm run typecheck
```

## Examples

Example scripts are provided in the `examples/` directory:

### Test All Endpoints

```bash
chmod +x examples/test-endpoints.sh
API_KEY=your-api-key ./examples/test-endpoints.sh
```

### Validate CSV (Text Format)

```bash
chmod +x examples/validate-ga4-csv.sh
API_KEY=your-api-key ./examples/validate-ga4-csv.sh
```

### Validate CSV (Base64 Format with Idempotency)

```bash
chmod +x examples/validate-ga4-csv-base64.sh
API_KEY=your-api-key ./examples/validate-ga4-csv-base64.sh /path/to/your.csv
```

## Architecture

### Project Structure

```
rapidtools-validation-api/
├── src/
│   ├── index.ts                 # Main worker entry point
│   ├── types.ts                 # TypeScript type definitions
│   ├── middleware/
│   │   ├── auth.ts             # Authentication middleware
│   │   └── idempotency.ts      # Idempotency handling
│   ├── validators/
│   │   └── csv-ga4.ts          # CSV GA4 validator
│   └── utils/
│       ├── crypto.ts           # SHA-256 hashing
│       └── stable-stringify.ts # Deterministic JSON serialization
├── examples/
│   ├── test-endpoints.sh
│   ├── validate-ga4-csv.sh
│   └── validate-ga4-csv-base64.sh
├── wrangler.toml               # Cloudflare Workers configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Technology Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript
- **Router:** itty-router
- **Storage:** Cloudflare KV (for idempotency)
- **Crypto:** Web Crypto API

### Design Principles

1. **Idempotent** - All operations are safe to retry
2. **Deterministic** - Same input always produces same output
3. **Stateless** - No server-side state (except idempotency cache)
4. **Fast** - Runs on edge, near users
5. **Type-safe** - Full TypeScript coverage

## Error Codes

### HTTP Status Codes

- `200` - Success (valid or invalid data with findings)
- `401` - Unauthorized (missing or invalid API key)
- `404` - Not Found (endpoint doesn't exist)
- `409` - Conflict (idempotency key reused with different parameters)
- `422` - Unprocessable Entity (validation failed)
- `500` - Internal Server Error

### Application Error Codes

- `UNAUTHORIZED` - Invalid or missing API key
- `MISSING_TYPE` - Validation type not provided
- `MISSING_CONTENT` - Content not provided
- `UNSUPPORTED_TYPE` - Validation type not supported
- `VALIDATION_FAILED` - Data failed validation (see findings)
- `IDEMPOTENCY_KEY_REUSE_MISMATCH` - Idempotency key reused incorrectly
- `INTERNAL_ERROR` - Unexpected server error

## License

MIT
