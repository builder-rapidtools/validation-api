#!/bin/bash

# Example script to test all API endpoints
# Usage: ./examples/test-endpoints.sh

API_URL="${API_URL:-http://localhost:8787}"
API_KEY="${API_KEY:-test-api-key}"

echo "=== Testing RapidTools Validation API ==="
echo ""

# Test health endpoint
echo "1. Testing GET /health (no auth required)..."
curl -s "${API_URL}/health" | jq .
echo ""
echo ""

# Test types endpoint
echo "2. Testing GET /api/types (auth required)..."
curl -s "${API_URL}/api/types" \
  -H "x-api-key: ${API_KEY}" \
  | jq .
echo ""
echo ""

# Test auth failure
echo "3. Testing auth failure (missing API key)..."
curl -s "${API_URL}/api/types" | jq .
echo ""
echo ""

# Test auth failure with invalid key
echo "4. Testing auth failure (invalid API key)..."
curl -s "${API_URL}/api/types" \
  -H "x-api-key: invalid-key" \
  | jq .
echo ""
echo ""

# Test validation with missing type
echo "5. Testing validation with missing type..."
curl -s -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"content":"text:some data"}' \
  | jq .
echo ""
echo ""

# Test validation with unsupported type
echo "6. Testing validation with unsupported type..."
curl -s -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"type":"unsupported.type","content":"text:some data"}' \
  | jq .
echo ""
echo ""

# Test validation with invalid CSV (missing headers)
echo "7. Testing validation with invalid CSV (missing required headers)..."
CSV_DATA="date,sessions
2024-01-01,150"

curl -s -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"type\":\"csv.timeseries.ga4.v1\",\"content\":\"text:${CSV_DATA}\"}" \
  | jq .
echo ""
echo ""

# Test validation with valid CSV
echo "8. Testing validation with valid CSV..."
CSV_DATA="date,sessions,users,pageviews
2024-01-01,150,120,450
2024-01-02,200,180,600"

curl -s -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"type\":\"csv.timeseries.ga4.v1\",\"content\":\"text:${CSV_DATA}\"}" \
  | jq .
echo ""
echo ""

echo "=== All tests completed ==="
