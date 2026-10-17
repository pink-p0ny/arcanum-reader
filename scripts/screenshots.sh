#!/bin/zsh
# Takes App Store screenshots on iPad simulators from an EAS simulator build, with a seeded folder
# library of public-domain books. Needs Xcode's simulators, sqlite3 and a finished `simulator` build.
#
#   scripts/screenshots.sh <build-id-or-artifact.tar.gz> <epub-dir> <out-dir>
#
# Writes 13-*.png and 11-*.png into <out-dir>; upload them with `node scripts/asc.mjs storeshots <out-dir>`.
set -euo pipefail

BUILD=$1
EPUBS=$2
OUT=$3
BUNDLE=net.snobunny.arcanum
WORK=${TMPDIR:-/tmp}/arcanum-shots
mkdir -p "$WORK" "$OUT"

# 1. The .app from the EAS artifact.
if [[ "$BUILD" == *.tar.gz ]]; then TAR=$BUILD; else
  URL=$(npx eas-cli build:view "$BUILD" --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["artifacts"]["buildUrl"])')
  TAR=$WORK/build.tar.gz
  curl -sfL -o "$TAR" "$URL"
fi
rm -rf "$WORK/app"; mkdir -p "$WORK/app"; tar -xzf "$TAR" -C "$WORK/app"
APP=$(find "$WORK/app" -maxdepth 2 -name '*.app' | head -1)
[[ -n "$APP" ]] || { echo "no .app in $TAR"; exit 1; }

shoot() {  # shoot <device name> <prefix>
  local NAME=$1 PREFIX=$2
  local UDID
  UDID=$(xcrun simctl list devices available -j | python3 -c "
import json,sys; d=json.load(sys.stdin)['devices']
print(next(x['udid'] for r in d.values() for x in r if x['name']=='$NAME'))")
  echo "== $NAME ($UDID)"
  xcrun simctl boot "$UDID" 2>/dev/null || true
  xcrun simctl bootstatus "$UDID" -b >/dev/null
  xcrun simctl ui "$UDID" appearance light
  xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
  xcrun simctl terminate "$UDID" $BUNDLE 2>/dev/null || true
  xcrun simctl uninstall "$UDID" $BUNDLE 2>/dev/null || true
  xcrun simctl install "$UDID" "$APP"

  # 2. Seed the folder library before first launch: books plus sidecars with progress and ratings.
  local DATA
  DATA=$(xcrun simctl get_app_container "$UDID" $BUNDLE data)
  mkdir -p "$DATA/Documents/Library"
  cp "$EPUBS"/*.epub "$DATA/Documents/Library/"
  python3 "$(dirname "$0")/screenshots-seed.py" "$DATA/Documents/Library"

  # 3. First launch in folder-only mode: scans the folder and lets expo-updates fetch the latest JS.
  xcrun simctl launch "$UDID" $BUNDLE -arcanumLocalOnly 1 >/dev/null
  sleep 25
  xcrun simctl terminate "$UDID" $BUNDLE
  # Reader settings and reading sessions live in SQLite; set sepia, two columns, and a week of reading.
  python3 "$(dirname "$0")/screenshots-seed.py" "$DATA/Documents/Library" "$DATA/Documents/SQLite/grimmory.db"
  xcrun simctl launch "$UDID" $BUNDLE -arcanumLocalOnly 1 >/dev/null
  sleep 12

  snap() { xcrun simctl io "$UDID" screenshot --type png "$OUT/$PREFIX-$1.png" >/dev/null; echo "  $PREFIX-$1.png"; }
  snap 1-home
  xcrun simctl openurl "$UDID" "arcanum:///library"; sleep 3; snap 3-library
  local BOOK
  BOOK=$(python3 "$(dirname "$0")/screenshots-seed.py" --id "$DATA/Documents/Library" emma.epub)
  xcrun simctl openurl "$UDID" "arcanum:///book/$BOOK"; sleep 3; snap 4-book
  xcrun simctl openurl "$UDID" "arcanum:///read/$BOOK"; sleep 8; snap 2-reader
  xcrun simctl terminate "$UDID" $BUNDLE
  xcrun simctl status_bar "$UDID" clear
}

shoot "iPad Pro 13-inch (M4)" 13
shoot "iPad Pro 11-inch (M4)" 11
echo "done: $OUT"
