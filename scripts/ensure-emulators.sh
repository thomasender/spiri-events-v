#!/bin/bash
# Make sure usable Firebase emulators are running, starting or restarting them
# if needed. Used by the pre-push hook so that a push is never blocked by an
# emulator that merely needs a restart (see AGENTS.md -> "The emulator is the
# bottleneck"). A degraded emulator is the single biggest cause of slow and
# flaky Playwright runs: the same smoke suite takes ~25s on a fresh emulator
# and several minutes on a degraded one.
#
# Exit 0: emulators are usable. Exit 1: they could not be brought up.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${TMPDIR:-/tmp}/spiri-events-emulators"
mkdir -p "$LOG_DIR"

# The Firestore emulator leaks memory across test runs (RSS passed 9 GB after a
# handful of full-suite runs) and then spends its time in GC: the same suite
# goes from ~1.5 min to ~5 min and starts failing on timing. It still *answers*
# probes at that point, so a latency check alone notices too late. Restart
# pre-emptively once it has grown past the threshold; a restart costs ~13s.
MAX_RSS_MB="${EMULATOR_MAX_RSS_MB:-2500}"
rss_kb=$(ps -axo rss=,command= | grep "[c]loud-firestore-emulator" | awk '{print $1}' | sort -rn | head -1)
BLOATED=false
if [ -n "$rss_kb" ] && [ "$rss_kb" -gt $((MAX_RSS_MB * 1024)) ]; then
  BLOATED=true
fi

if [ "$BLOATED" = false ] && bash "$SCRIPT_DIR/check-emulators.sh" >/dev/null 2>&1; then
  exit 0
fi

if [ "$BLOATED" = true ]; then
  echo "Firestore emulator has grown to $((rss_kb / 1024)) MB (limit ${MAX_RSS_MB} MB) - restarting it (~15s)..."
else
  echo "Emulators are down or degraded - (re)starting them (~20s)..."
fi
pkill -f cloud-firestore-emulator 2>/dev/null
pkill -f "firebase.*emulators" 2>/dev/null
sleep 3

cd "$ROOT_DIR" || exit 1
nohup bash "$SCRIPT_DIR/start-emulators.sh" >"$LOG_DIR/start.log" 2>&1 &

for _ in $(seq 1 90); do
  if bash "$SCRIPT_DIR/check-emulators.sh" >/dev/null 2>&1; then
    echo "Emulators are up."
    exit 0
  fi
  sleep 1
done

echo "Could not start the emulators. See $LOG_DIR/start.log and $LOG_DIR/emulators.err"
exit 1
