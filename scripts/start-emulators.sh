#!/bin/bash
set -e

SEED_PROD=false
IMPORT_PATH="./data-export"

while [[ $# -gt 0 ]]; do
  case $1 in
    --seed-prod)
      SEED_PROD=true
      IMPORT_PATH="./data-export"
      shift
      ;;
    --import)
      IMPORT_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo "=========================================="
if [ "$SEED_PROD" = true ]; then
  echo "Starting emulators with PRODUCTION DATA"
  echo "Import path: $IMPORT_PATH"
else
  echo "Starting emulators with SEEDED TEST DATA"
fi
echo "=========================================="

cleanup() {
  echo ""
  echo "Shutting down emulators..."
  kill $EMULATOR_PID 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

# Keep the emulator's debug logs out of the repo root. Left at the default
# verbosity they grow into the multi-GB range within a single work session,
# which is what makes the Firestore emulator start thrashing and time out.
EMULATOR_LOG_DIR="${TMPDIR:-/tmp}/spiri-events-emulators"
mkdir -p "$EMULATOR_LOG_DIR"

firebase emulators:start \
  --import "$IMPORT_PATH" \
  --project spirieventsvbg \
  --log-verbosity QUIET 2>"$EMULATOR_LOG_DIR/emulators.err" &
EMULATOR_PID=$!

echo "Waiting for emulators to be ready..."

# Poll from the first second instead of sleeping blind for 8s.
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if ! kill -0 $EMULATOR_PID 2>/dev/null; then
    echo "Emulator process exited during startup."
    exit 1
  fi
  if bash "$SCRIPT_DIR/check-emulators.sh" >/dev/null 2>&1; then
    echo "Emulators ready after ${WAITED}s."
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "Timeout waiting for emulators"
  kill $EMULATOR_PID 2>/dev/null || true
  exit 1
fi

echo ""
if [ "$SEED_PROD" = true ]; then
  echo "Emulators started with production data."
  echo "Import path: $IMPORT_PATH"
  echo ""
  echo "To seed production users for debugging, run:"
  echo "  node scripts/import-test-users.mjs"
else
  echo "Seeding test data..."
  node scripts/seed-dev-data.mjs
fi

echo ""
echo "=========================================="
echo "Emulators running:"
echo "  Auth:        http://localhost:9199"
echo "  Firestore:   http://localhost:8181"
echo "  UI:          http://localhost:4040"
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop"

wait $EMULATOR_PID
