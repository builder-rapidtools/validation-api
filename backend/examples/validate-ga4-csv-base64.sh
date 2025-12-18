#!/bin/bash

# Example script to validate a GA4 CSV using base64: prefix
# Usage: ./examples/validate-ga4-csv-base64.sh [path-to-csv-file]

API_URL="${API_URL:-http://localhost:8787}"
API_KEY="${API_KEY:-test-api-key}"

# Use provided CSV file or create a sample one
if [ -n "$1" ]; then
  CSV_FILE="$1"
else
  # Create a temporary sample CSV
  CSV_FILE="/tmp/sample-ga4.csv"
  cat > "$CSV_FILE" <<EOF
date,sessions,users,pageviews
2024-01-01,150,120,450
2024-01-02,200,180,600
2024-01-03,180,150,540
2024-01-04,220,190,660
2024-01-05,195,165,585
EOF
fi

if [ ! -f "$CSV_FILE" ]; then
  echo "Error: CSV file not found: $CSV_FILE"
  exit 1
fi

echo "Reading CSV file: $CSV_FILE"
echo ""

# Encode CSV to base64
CSV_BASE64=$(base64 < "$CSV_FILE" | tr -d '\n')

# Create validation request with idempotency key
IDEMPOTENCY_KEY="example-$(date +%s)"

REQUEST_BODY=$(cat <<EOF
{
  "type": "csv.timeseries.ga4.v1",
  "content": "base64:${CSV_BASE64}",
  "options": {
    "requireSortedByDateAsc": true,
    "allowDuplicateDates": false
  },
  "context": {
    "source": "example-script-base64",
    "filename": "$(basename "$CSV_FILE")"
  }
}
EOF
)

echo "Validating CSV data (with idempotency)..."
echo "Idempotency-Key: $IDEMPOTENCY_KEY"
echo ""

curl -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d "${REQUEST_BODY}" \
  | jq .

echo ""
echo "Replaying request with same idempotency key..."
echo ""

# Make the same request again to demonstrate idempotency
curl -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d "${REQUEST_BODY}" \
  | jq .

echo ""
echo "Done!"
