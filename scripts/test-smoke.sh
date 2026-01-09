#!/bin/bash
# Smoke tests - quick sanity checks
# Usage: TEST_URL=https://... ./scripts/test-smoke.sh

set -e

TEST_URL="${TEST_URL:-https://sell.thephirstory.com}"

echo "🔥 Running smoke tests..."
echo "📍 Target: $TEST_URL"
echo ""

FAILED=0

# Test 1: Webhook responds to GET (verification)
echo -n "Testing: Webhook verification endpoint... "
response=$(curl -s -w "\n%{http_code}" "$TEST_URL/api/sms-webhook?hub.mode=subscribe&hub.verify_token=tps123&hub.challenge=test123")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ] && [ "$body" = "test123" ]; then
  echo "✅ PASSED"
else
  echo "❌ FAILED (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi

# Test 2: API responds
echo -n "Testing: API is accessible... "
response=$(curl -s -w "\n%{http_code}" -X POST "$TEST_URL/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d '{"invalid":"payload"}')
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "200" ]; then
  echo "✅ PASSED"
else
  echo "❌ FAILED (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi

# Test 3: Frontend loads
echo -n "Testing: Frontend is accessible... "
response=$(curl -s -w "\n%{http_code}" "$TEST_URL")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "200" ]; then
  echo "✅ PASSED"
else
  echo "❌ FAILED (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo "✅ All smoke tests passed!"
  exit 0
else
  echo "❌ $FAILED smoke tests failed"
  exit 1
fi
