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
HERE=${0:A:h}
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
  xcrun simctl shutdown "$UDID" 2>/dev/null || true
  xcrun simctl erase "$UDID"
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b >/dev/null
  xcrun simctl ui "$UDID" appearance light
  xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
  xcrun simctl install "$UDID" "$APP"

  # 2. Seed the folder library before first launch: books plus sidecars with progress and ratings.
  local DATA
  DATA=$(xcrun simctl get_app_container "$UDID" $BUNDLE data)
  mkdir -p "$DATA/Documents/Library"
  cp "$EPUBS"/*.epub "$DATA/Documents/Library/"
  python3 "$HERE/screenshots-seed.py" "$DATA/Documents/Library"

  # 3. First launch in folder-only mode: scans the folder and lets expo-updates fetch the latest JS.
  xcrun simctl launch "$UDID" $BUNDLE -arcanumLocalOnly 1 >/dev/null
  local UPDB="$DATA/Library/Application Support/.expo-internal/expo-v11.db" n=0
  until [[ -f "$UPDB" && $(sqlite3 "$UPDB" "select count(*) from updates;" 2>/dev/null || echo 0) -gt 1 || $n -ge 60 ]]; do
    sleep 1; n=$((n + 1))
  done
  echo "  update fetched after ${n}s ($(sqlite3 "$UPDB" "select count(*) from updates;" 2>/dev/null) updates in db)"
  sleep 5
  xcrun simctl terminate "$UDID" $BUNDLE
  # Reader settings and reading sessions live in SQLite; set sepia, two columns, and a week of reading.
  python3 "$HERE/screenshots-seed.py" "$DATA/Documents/Library" "$DATA/Documents/SQLite/grimmory.db"
  # 4. One launch per screen: `-arcanumRoute` opens the screen once the tabs are up. (simctl openurl would
  #    show the system "Open in Arcanum?" prompt, which nothing can dismiss from a script.)
  local BOOK
  BOOK=$(python3 "$HERE/screenshots-seed.py" --id "$DATA/Documents/Library" emma.epub)
  show() {  # show <shot name> <route or -> <settle seconds>
    xcrun simctl terminate "$UDID" $BUNDLE 2>/dev/null || true
    if [[ "$2" == "-" ]]; then xcrun simctl launch "$UDID" $BUNDLE -arcanumLocalOnly 1 >/dev/null
    else xcrun simctl launch "$UDID" $BUNDLE -arcanumLocalOnly 1 -arcanumRoute "$2" >/dev/null; fi
    sleep "$3"
    xcrun simctl io "$UDID" screenshot --type png "$OUT/$PREFIX-$1.png" >/dev/null
    echo "  $PREFIX-$1.png"
  }
  show 1-home - 12
  show 3-library /library 8
  show 4-book "/book/$BOOK" 8
  show 2-reader "/read/$BOOK" 14
  xcrun simctl terminate "$UDID" $BUNDLE
  xcrun simctl status_bar "$UDID" clear
}

shoot "iPad Pro 13-inch (M4)" 13
shoot "iPad Pro 11-inch (M4)" 11
echo "done: $OUT"
