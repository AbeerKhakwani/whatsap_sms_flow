# GitHub Actions Setup for Automated Testing

## ✅ What You Get

Every time you push to `main`, GitHub Actions automatically:
1. ✅ Runs unit tests
2. ✅ Checks environment variables
3. ✅ Builds the project
4. ✅ Deploys to Vercel
5. ✅ Runs smoke tests against production
6. ✅ Runs integration tests (full WhatsApp flow)

**If anything breaks, you'll know immediately!**

---

## Required GitHub Secrets

Go to: https://github.com/AbeerKhakwani/whatsap_sms_flow/settings/secrets/actions

Add these secrets (if not already added):

### Required:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `WHATSAPP_ACCESS_TOKEN` - Meta WhatsApp API token
- `WHATSAPP_PHONE_NUMBER_ID` - WhatsApp Business Phone Number ID
- `VITE_SHOPIFY_STORE_URL` - Shopify store URL (ba42c1.myshopify.com)
- `VITE_SHOPIFY_ACCESS_TOKEN` - Shopify Admin API access token

### Optional (for Vercel deployment):
- `VERCEL_TOKEN` - Vercel API token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID

---

## How to View Test Results

### Option 1: GitHub Actions UI

1. Go to: https://github.com/AbeerKhakwani/whatsap_sms_flow/actions
2. Click on the latest workflow run
3. See all test steps and results

### Option 2: Email Notifications

GitHub will email you if tests fail:
- ✅ Green checkmark = All tests passed
- ❌ Red X = Some tests failed

### Option 3: Git Commit Status

In your commit history, you'll see:
- ✅ Green checkmark next to commit = Tests passed
- ❌ Red X = Tests failed

---

## What Tests Run

### 1. Environment Check
Verifies all required secrets are set in GitHub.

**Pass**: All env vars present
**Fail**: Missing SUPABASE_SERVICE_KEY, WHATSAPP_ACCESS_TOKEN, etc.

### 2. Unit Tests
Runs `npm test` to check code quality.

**Pass**: All Vitest tests pass
**Fail**: Test failures or errors

### 3. Build Check
Runs `npm run build` to ensure code compiles.

**Pass**: Build succeeds, no TypeScript errors
**Fail**: Compilation errors, missing dependencies

### 4. Smoke Tests (After Deployment)
Quick health checks on production:
- Webhook responds to verification
- API is accessible
- Frontend loads

**Pass**: All endpoints respond with 200
**Fail**: 500 errors, timeouts, or unreachable

### 5. Integration Tests (After Deployment)
Full WhatsApp flow testing:
- `SELL` command → asks email
- Email input → asks confirmation
- Create account → asks description
- `CANCEL` → cleanup

**Pass**: All webhook responses match expected states
**Fail**: Unexpected responses or errors

---

## How to Disable Tests (If Needed)

Edit `.github/workflows/test.yml`:

```yaml
# Comment out integration tests
# - name: Run integration tests
#   run: ./scripts/test-integration.sh
```

Or delete the workflow file entirely:
```bash
rm .github/workflows/test.yml
git commit -am "disable CI tests"
git push
```

---

## How to Add More Tests

### Add a new smoke test:

Edit `scripts/test-smoke.sh`:
```bash
# Test 4: Check another endpoint
echo -n "Testing: Another endpoint... "
response=$(curl -s -w "\n%{http_code}" "$TEST_URL/api/another")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "200" ]; then
  echo "✅ PASSED"
else
  echo "❌ FAILED (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi
```

### Add a new integration test:

Edit `scripts/test-integration.sh`:
```bash
# Test 5: Test submit command
test_webhook "Submit without photos" \
  "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"$TEST_PHONE\",\"id\":\"test_$(date +%s)_5\",\"type\":\"text\",\"text\":{\"body\":\"SUBMIT\"}}]}}]}]}" \
  "need more photos"
```

---

## Troubleshooting

### Tests fail on first run

**Cause**: GitHub Secrets not set

**Fix**: Go to Settings → Secrets and add all required secrets

---

### Integration tests timeout

**Cause**: Vercel deployment taking too long, or production is down

**Fix**: Check Vercel logs, increase timeout in test script:
```bash
# In scripts/test-integration.sh, add:
sleep 5  # Wait for deployment to stabilize
```

---

### Tests pass locally but fail on GitHub

**Cause**: Different environment (Node version, dependencies, etc.)

**Fix**: Ensure `package-lock.json` is committed:
```bash
git add package-lock.json
git commit -m "lock dependencies"
git push
```

---

### "Permission denied" errors

**Cause**: Test scripts not executable

**Fix**:
```bash
chmod +x scripts/test-*.sh
git add scripts/
git commit -m "make scripts executable"
git push
```

---

## What Happens Next

Every push to `main` will:
1. Wait ~20 seconds for tests to start
2. Run tests (1-2 minutes)
3. Deploy to Vercel if tests pass
4. Run integration tests on live site
5. Email you if anything fails

**You'll know immediately if something breaks!**

---

## Viewing Test Logs

### See latest test run:
```bash
# From GitHub CLI
gh run list --limit 5

# View specific run
gh run view 123456789
```

### See test output in terminal:
```bash
# Run smoke tests locally
./scripts/test-smoke.sh

# Run integration tests locally
TEST_URL=https://sell.thephirstory.com ./scripts/test-integration.sh
```

---

## Current Status

Check the status badge:

![Tests](https://github.com/AbeerKhakwani/whatsap_sms_flow/workflows/Test%20&%20Deploy/badge.svg)

Or visit: https://github.com/AbeerKhakwani/whatsap_sms_flow/actions

---

## For Sunday Demo

Before the demo, check:
- [ ] Latest commit has green checkmark
- [ ] All tests passing in Actions tab
- [ ] No failed runs in the last 24 hours

If tests are failing:
1. Check GitHub Actions logs
2. Run tests locally to reproduce
3. Fix the issue
4. Push the fix
5. Wait for tests to pass

**Don't demo with failing tests!**

---

## Quick Commands

```bash
# Check if tests will pass locally
npm test
npm run build
./scripts/test-smoke.sh
TEST_URL=https://sell.thephirstory.com ./scripts/test-integration.sh

# Force a test run (push empty commit)
git commit --allow-empty -m "trigger tests"
git push

# View latest test status
gh run list --limit 1

# Download test logs
gh run download  # Downloads artifacts from latest run
```

---

**Your tests are now running automatically on every push!** 🎉

Check: https://github.com/AbeerKhakwani/whatsap_sms_flow/actions
