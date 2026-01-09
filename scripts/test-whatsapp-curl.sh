#!/bin/bash
# Quick curl-based tests for WhatsApp webhook
# Usage: ./scripts/test-whatsapp-curl.sh

DOMAIN="${1:-https://sell.thephirstory.com}"
PHONE="${2:-15551234567}"

echo "🧪 Testing WhatsApp webhook at: $DOMAIN"
echo "📱 Using test phone: $PHONE"
echo ""

# Test A: SELL command
echo "Test A: SELL command"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST1\",\"type\":\"text\",\"text\":{\"body\":\"SELL\"}}]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: { \"status\": \"asked email\" }"
echo ""
read -p "Press Enter to continue..."

# Test B: Email
echo "Test B: Email"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST2\",\"type\":\"text\",\"text\":{\"body\":\"test@example.com\"}}]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: { \"status\": \"asked confirmation\" } or { \"status\": \"asked description\" }"
echo ""
read -p "Press Enter to continue..."

# Test C: Create account YES
echo "Test C: Create account YES"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST3\",\"type\":\"interactive\",
      \"interactive\":{\"button_reply\":{\"id\":\"create_yes\"}}
    }]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: { \"status\": \"asked description\" }"
echo ""
read -p "Press Enter to continue..."

# Test D: Description
echo "Test D: Description"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST4\",\"type\":\"text\",\"text\":{\"body\":\"Maria B lawn 3pc, M, like new, \$80\"}}]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: Extracts fields, asks for missing ones"
echo ""
read -p "Press Enter to continue..."

# Test E: Missing field - designer
echo "Test E: Missing field - designer"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST5\",\"type\":\"text\",\"text\":{\"body\":\"Maria B\"}}]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: Moves to next missing field or photos"
echo ""
read -p "Press Enter to continue..."

# Test F: Pieces button
echo "Test F: Pieces button (3-piece)"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST6\",\"type\":\"interactive\",
      \"interactive\":{\"button_reply\":{\"id\":\"3-piece\"}}
    }]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: Saves pieces, asks next field"
echo ""
read -p "Press Enter to continue..."

# Test G: Test photo (requires TEST_MODE=true)
echo "Test G: Test photo (requires TEST_MODE=true in .env)"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST_PHOTO1\",\"type\":\"image\",
      \"image\":{\"id\":\"test_image_123\",\"mime_type\":\"image/jpeg\"}
    }]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected (TEST_MODE): Saves dummy photo 1/3"
echo "❌ Expected (PROD): Tries to download from Meta, may fail"
echo ""
read -p "Press Enter to continue..."

# Test H: SUBMIT command
echo "Test H: SUBMIT command"
curl -s -X POST "$DOMAIN/api/sms-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$PHONE\",\"id\":\"wamid.TEST_SUBMIT\",\"type\":\"text\",\"text\":{\"body\":\"SUBMIT\"}}]}}]}]
  }" | python3 -m json.tool
echo ""
echo "✅ Expected: Submits if ready, or says what's missing"
echo ""

echo "🎉 Tests complete!"
echo ""
echo "To check session state, query Supabase:"
echo "SELECT * FROM whatsapp_sessions WHERE phone = '$PHONE';"
