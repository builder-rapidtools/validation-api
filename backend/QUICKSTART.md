# Quick Start Guide

Get the RapidTools Validation API up and running in 5 minutes.

## Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI

## 1. Install Dependencies

```bash
npm install
```

## 2. Create KV Namespace

```bash
# Create KV namespace for idempotency
wrangler kv:namespace create "IDEMPOTENCY_KV"
```

Copy the namespace ID from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "YOUR_NAMESPACE_ID_HERE"  # Replace with actual ID
```

## 3. Set API Key

```bash
# Set your API key secret
wrangler secret put VALIDATION_API_KEYS
# When prompted, enter: test-api-key-123
```

## 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:8787`.

## 5. Test the API

Open a new terminal and run:

```bash
# Test health endpoint
curl http://localhost:8787/health | jq .

# Test validation (set your API key)
export API_KEY=test-api-key-123
./examples/validate-ga4-csv.sh
```

## Next Steps

- Read the [full README](README.md) for detailed API documentation
- Explore more examples in `examples/`
- Deploy to production with `npm run deploy`

## Common Issues

### "Invalid API key" error

Make sure you've set the API key secret:
```bash
wrangler secret put VALIDATION_API_KEYS
```

### KV namespace errors

Verify the KV namespace ID in `wrangler.toml` matches the one created:
```bash
wrangler kv:namespace list
```

### Port 8787 already in use

Kill the process or use a different port:
```bash
wrangler dev --port 8788
```
