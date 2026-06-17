#!/bin/bash
# scripts/backup-supabase.sh
# Phase 0 of ownership refactor: dump the Supabase database before any migration.
#
# Prerequisites:
#   brew install postgresql   # for pg_dump
#
# Find your connection string in:
#   Supabase dashboard → project dwihbnfrpsejfajpuveb → Settings → Database → Connection string (URI)
#
# Usage:
#   bash scripts/backup-supabase.sh "postgres://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

set -e

if [ -z "$1" ]; then
  echo "Usage: bash scripts/backup-supabase.sh \"<connection-string>\""
  echo ""
  echo "Get your connection string from:"
  echo "  Supabase dashboard → project dwihbnfrpsejfajpuveb → Settings → Database → URI"
  exit 1
fi

CONNECTION_STRING="$1"
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="$(dirname "$0")/../backups"
OUTPUT="$BACKUP_DIR/supabase-$DATE.sql"

mkdir -p "$BACKUP_DIR"

echo "Dumping Supabase database..."
echo "Output: $OUTPUT"
echo ""

pg_dump "$CONNECTION_STRING" \
  --no-owner \
  --no-acl \
  --format=plain \
  --file="$OUTPUT"

echo ""
echo "--- Backup complete ---"
echo "File: $OUTPUT"
echo "Size: $(du -sh "$OUTPUT" | cut -f1)"
echo ""
echo "To verify restore works (optional, on a test DB):"
echo "  psql <test-connection-string> < $OUTPUT"
