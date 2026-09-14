#!/bin/bash
# Fast preflight: are the Firebase emulators actually usable?
#
# The old check only probed Auth (:9199). The Firestore emulator can be up as a
# process but unresponsive — the "degraded emulator" state — and the test suite
# would then burn 30s in globalSetup before failing for confusing reasons.
# This probes both, with a short timeout, and fails in ~3s with instructions.

AUTH_URL="http://127.0.0.1:9199"
FIRESTORE_URL="http://127.0.0.1:8181"
PROJECT_ID="spirieventsvbg"

probe() {
  # A reachable emulator answers something (200/400/404). curl exits non-zero
  # only when it cannot connect or the request times out.
  curl -s -o /dev/null --max-time 3 "$1"
}

AUTH_OK=false
FIRESTORE_OK=false
FIRESTORE_SLOW=false

probe "$AUTH_URL" && AUTH_OK=true

# Hit a real Firestore endpoint, not just the root: a thrashing emulator still
# accepts the TCP connection but never answers a query. Also measure how long
# it takes — a degraded emulator often still answers, just far too slowly to
# run a suite against, and that looks like dozens of unrelated test failures.
# Probe three times and keep the worst: a degraded emulator answers some
# requests quickly and hangs on the next, so a single probe can pass by luck.
FIRESTORE_TIME=0
FIRESTORE_URL_DOC="$FIRESTORE_URL/v1/projects/$PROJECT_ID/databases/(default)/documents/events?pageSize=1"
for _ in 1 2 3; do
  if t=$(curl -s -o /dev/null --max-time 5 -w "%{time_total}" "$FIRESTORE_URL_DOC"); then
    FIRESTORE_OK=true
  else
    # A timeout is the clearest degradation signal there is.
    FIRESTORE_SLOW=true
    t=5
  fi
  awk -v a="$t" -v b="$FIRESTORE_TIME" 'BEGIN { exit !(a > b) }' && FIRESTORE_TIME=$t
done

# 1s for a single-document query means it is thrashing; healthy is ~10ms.
awk -v t="$FIRESTORE_TIME" 'BEGIN { exit !(t > 1.0) }' && FIRESTORE_SLOW=true

if [ "$AUTH_OK" = true ] && [ "$FIRESTORE_OK" = true ] && [ "$FIRESTORE_SLOW" = true ]; then
  echo ""
  echo "=========================================="
  echo "  Firestore emulator is degraded"
  echo "=========================================="
  echo "  A single-document query took ${FIRESTORE_TIME}s (healthy: well under 0.1s)."
  echo "  It is answering, but far too slowly to run a suite against — you would"
  echo "  see dozens of unrelated tests fail with \"element not found\"."
  echo ""
  echo "  Restart it:"
  echo ""
  echo "    pkill -f cloud-firestore-emulator"
  echo "    npm run emulators:start"
  echo ""
  exit 1
fi

if [ "$AUTH_OK" = true ] && [ "$FIRESTORE_OK" = true ]; then
  exit 0
fi

echo ""
echo "=========================================="
echo "  Firebase emulators are not usable"
echo "=========================================="
[ "$AUTH_OK" = true ]      && echo "  Auth      (:9199)  OK"      || echo "  Auth      (:9199)  NOT RESPONDING"
[ "$FIRESTORE_OK" = true ] && echo "  Firestore (:8181)  OK"      || echo "  Firestore (:8181)  NOT RESPONDING"
echo ""
if [ "$AUTH_OK" = true ] && [ "$FIRESTORE_OK" = false ]; then
  echo "  Auth answers but Firestore does not — the Firestore emulator has"
  echo "  most likely degraded (it does that under sustained load). Restart it:"
  echo ""
  echo "    pkill -f cloud-firestore-emulator"
  echo "    npm run emulators:start"
else
  echo "  Start them in a separate terminal:"
  echo ""
  echo "    npm run emulators:start"
fi
echo ""
exit 1
