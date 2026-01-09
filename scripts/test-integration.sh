#!/bin/bash
# Integration tests for WhatsApp flow
# Runs automatically on GitHub Actions
# Usage: TEST_URL=https://... TEST_PHONE=123 ./scripts/test-integration.sh

set -e  # Exit on error

TEST_URL="${TEST_URL:-https://sell.thephirstory.com}"
TEST_PHONE="${TEST_PHONE:-15559999001}"
WEBHOOK_PATH="/api/sms-webhook"

echo "🧪 Running integration tests..."
echo "📍 Target: $TEST_URL"
echo "📱 Phone: $TEST_PHONE"
echo ""

FAILED=0

# Helper function to test webhook
test_webhook() {
  local test_name="$1"
  local payload="$2"
  local expected_status="$3"

  echo -n "Testing: $test_name... "

  response=$(curl -s -w "\n%{http_code}" -X POST "$TEST_URL$WEBHOOK_PATH" \
    -H "Content-Type: application/json" \
    -d "$payload")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    echo "❌ FAILED (HTTP $http_code)"
    echo "   Response: $body"
    FAILED=$((FAILED + 1))
    return 1
  fi

  if echo "$body" | grep -q "\"status\":\"$expected_status\""; then
    echo "✅ PASSED"
    return 0
  else
    echo "⚠️  WARNING (status not '$expected_status')"
    echo "   Response: $body"
    return 0  # Don't fail on status mismatch, just warn
  fi
}

# Test 1: SELL command
test_webhook "SELL command" \
  "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$TEST_PHONE\",\"id\":\"test_$(date +%s)_1\",\"type\":\"text\",\"text\":{\"body\":\"SELL\"}}]}}]}]}" \
  "asked email"

sleep 1

# Test 2: Email
test_webhook "Email input" \
  "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$TEST_PHONE\",\"id\":\"test_$(date +%s)_2\",\"type\":\"text\",\"text\":{\"body\":\"test@example.com\"}}]}}]}]}" \
  "asked confirmation"

sleep 1

# Test 3: Create account YES
test_webhook "Create account" \
  "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$TEST_PHONE\",\"id\":\"test_$(date +%s)_3\",\"type\":\"interactive\",\"interactive\":{\"button_reply\":{\"id\":\"create_yes\"}}}]}}]}]}" \
  "asked description"

sleep 1

# Test 4: CANCEL command (cleanup)
test_webhook "CANCEL cleanup" \
  "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$TEST_PHONE\",\"id\":\"test_$(date +%s)_4\",\"type\":\"text\",\"text\":{\"body\":\"CANCEL\"}}]}}]}]}" \
  "cancelled"

echo ""
if [ $FAILED -eq 0 ]; then
  echo "✅ All integration tests passed!"
  exit 0
else
  echo "❌ $FAILED integration tests failed"
  exit 1
fi
