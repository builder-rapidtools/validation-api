#!/bin/bash

# Example script to validate a GA4 CSV using text: prefix
# Usage: ./examples/validate-ga4-csv.sh

API_URL="${API_URL:-http://localhost:8787}"
API_KEY="${API_KEY:-test-api-key}"

# Sample CSV data
CSV_DATA="date,sessions,users,pageviews
2024-01-01,150,120,450
2024-01-02,200,180,600
2024-01-03,180,150,540"

# Create validation request
REQUEST_BODY=$(cat <<EOF
{
  "type": "csv.timeseries.ga4.v1",
  "content": "text:${CSV_DATA}",
  "options": {
    "requireSortedByDateAsc": true,
    "allowDuplicateDates": false,
    "maxRows": 100000
  },
  "context": {
    "source": "example-script"
  }
}
EOF
)

echo "Validating CSV data..."
echo ""

curl -X POST "${API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "${REQUEST_BODY}" \
  | jq .

echo ""
echo "Done!"
