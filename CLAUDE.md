@AGENTS.md

# Project notes

- Grimmory server API is documented in the Java controllers of `grimmory-tools/grimmory` (no OpenAPI exposed on
  the user's server). The app uses the `/api/v1/app/*` mobile endpoints, `/api/v1/annotations`,
  `/api/v1/books/{id}/content?bookType=EPUB` for downloads, and `/api/v1/media/book/{id}/thumbnail` for covers.
- `reader-web/foliate` is vendored from Grimmory's frontend (`frontend/src/assets/foliate`, MIT). Do not edit it;
  change `reader-web/src/main.js` and rebuild with `npm run build:reader`. The bundle is inlined into
  `assets/reader/reader.html` by string splicing, never `String.replace` (foliate uses `$$` identifiers).
- The WebView loads `reader.html` from the Documents directory so WKWebView lets it XHR the downloaded EPUB
  (`allowingReadAccessToURL`). See `src/lib/reader-asset.ts`, which also copies `pdfjs.webjs` and
  `pdf.worker.webjs` next to it.
- Formats: `src/lib/formats.ts` lists what the reader opens (EPUB, AZW3, MOBI, FB2, PDF, TXT). PDF goes through
  `reader-web/src/pdf.js` (adapted from foliate-js) with pdfjs-dist pinned to 4.10.x: 5.x/6.x need WebKit
  features (`Iterator` helpers) missing before iOS 18.4. `build-reader.mjs` turns the pdf.js ES modules into
  classic scripts (`assets/reader/*.webjs`, Metro asset ext `webjs`) because WKWebView refuses module scripts
  from file URLs; both run on the main thread (pdf.js uses its in-page worker when `pdfjsWorker` is global).
  PDFs open in one of two modes, both with one foliate section per page so progress stays by page
  (`pageFromCfi`, servers get `pdfProgress`) and a position survives switching: `pdfReflow` (default, Reader
  Settings) pulls the text out with pdf.js and rebuilds paragraphs/headings as a reflowable book (highlights,
  search, read-aloud and every typography setting work; running heads and page numbers are dropped), while
  pages mode renders each page to a canvas with a text layer (fixed layout: no highlights or read-aloud,
  swipe handled in main.js). Scanned PDFs with no text layer always get pages. `READER_PDF_PAGES=1` makes
  `test:reader` use pages mode. TXT (`reader-web/src/txt.js`) becomes a reflowable book with
  chapters guessed from heading lines; servers have no TXT type, so it is a folder-library format only.
- `npm run test:reader -- <file>` accepts EPUB/MOBI/FB2/PDF/TXT; `READER_SEARCH` sets the search term.
  Reader errors before the book opens are shown on screen and stored in kv `lastReaderError`
  (`sqlite3 <app>/Documents/SQLite/grimmory.db` on a simulator).
- Edition grouping (`src/lib/editions.ts`): base title (subtitle after `:`/dash dropped), apostrophes ignored,
  author name parts sorted ("Barr, Nevada" = "Nevada Barr"), a missing author or bare title joins the group
  when the rest agree. `node scripts/grimmory.mjs dupes` lists what a server still shows as separate cards.
- Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:reader -- <epub>` before calling work done.
  A preview-channel `eas update` plus the simulator build is the way to check WebKit-specific behaviour.
- The project is pinned to SDK 57 because that is what Expo Go in the App Store supports; do not bump to 58 until Expo Go does. Native tabs import from `expo-router/unstable-native-tabs` on this SDK. The dev machine has Xcode 16.1, so prefer Expo Go or EAS Build over local native builds.
- `modules/webview-edit-menu` is a local Expo module (Swift) that inserts Highlight / Add Note into the system
  text-selection menu of WKWebView, Apple Books style. It is absent in Expo Go, where the reader falls back to
  the in-app `SelectionBar`. Native changes need a development build: `npx eas-cli build --profile development`.
  Never pass `menuItems` to the WebView: react-native-webview then hides every system action.
  Likewise never set `allowsLinkPreview={false}` on it: WebKit then stops showing the selection edit menu.
- `assets/expo.icon` (Icon Composer bundle) is NOT referenced from app.json: EAS build b1565afd crashed in
  actool on it ("attempt to insert nil object"). The 1024px `assets/images/icon.png` is the shipped icon.
  To retry the layered icon, open the bundle in Icon Composer on a Mac with Xcode 26, save, then set
  `ios.icon` back to `./assets/expo.icon`.
- Backends go through `src/lib/provider.ts` (`LibraryProvider` in `src/lib/providers/types.ts`). Screens and
  sync code never call `src/lib/api.ts` directly; add a backend by implementing the interface.
- Bindery client is `src/lib/bindery.ts` (API reference: raw.githubusercontent.com/vavallee/bindery/main/docs/API.md).
  Auth is `X-Api-Key`; `POST /api/v1/author/book` adds+searches with an admin key, 403 for requester keys
  falls back to `POST /api/v1/requests`. The server URL lives in kv, the key in SecureStore.
- AI picks (`src/lib/ai.ts`) call the Anthropic Messages API from the device with the user's own key
  (SecureStore) and a forced `pick_book` tool. Only candidate titles and a taste summary are sent.
- Pure logic lives in `*-core.ts` / `taste.ts` / `highlights-markdown.ts` with `node:test` tests run by
  `npm test` (tsx); keep Expo imports out of those files. SQLite schema is at user_version 2 (sessions table).
- Booklore has no `/api/v1/app/*` endpoints; `src/lib/providers/booklore.ts` maps its `/api/v1/books` DTOs.
  The server kind is detected at sign-in (`detectKind` in session.ts) and stored on the session.
- `scripts/asc.mjs` talks to the App Store Connect API with the key in `~/.appstoreconnect/private_keys/`
  (never in the repo): `inspect`, `products`, `equalize <subId>`, `screenshots <png>` (review screenshots
  for the products), `listing` (pushes docs/app-store.md: subtitle, categories, description, keywords,
  URLs, age rating; rerun after editing the doc) and `storeshots <dir>` (replaces the 13-inch and 11-inch
  iPad screenshot sets from `13-*.png` / `11-*.png`). Products: group "Arcanum Premium" (display "Arcanum
  Cloud"), monthly/yearly subscriptions and a lifetime non-consumable.
- Store screenshots: `scripts/screenshots.sh <simulator build id> <epub dir> <out dir>` installs the EAS
  `simulator` profile build on iPad Pro simulators, seeds a folder library (`scripts/screenshots-seed.py`
  rewrites Gutenberg EPUB subjects to short genres and writes sidecars, reader settings and sessions),
  launches with `-arcanumLocalOnly 1` (a launch argument `session.ts` reads through NSUserDefaults) and
  captures Home, Library, a book page and the reader via `arcanum:///` deep links. The release builds on
  the `preview`/`production` channels take JS over the air: `eas update --channel <c> --environment <c>
  --platform ios` (web is not installed, so never `--platform all`).
- TestFlight builds predating `expo-updates` (build 3) cannot take OTA updates; build 4 onward can.
- Purchases go through RevenueCat (`src/lib/premium.ts`, entitlement `premium`, public key in app.json
  `extra.revenueCatIosKey`). `CLOUD_ENABLED` is `__DEV__` so Arcanum Cloud stays hidden in production until
  the hosted service exists. The folder library (`src/lib/library-folder.ts`) uses negative book ids;
  `getProvider(bookId)` routes them. iCloud needs the dev build (`modules/icloud-container`).
- Planned work and bugs are tracked as GitHub issues on pink-p0ny/arcanum-reader (`gh issue list`): label `FR`
  for feature requests, `BUG` for bugs, `chore` for release/upgrade tasks. File new ideas and device-reported
  bugs there rather than in memory; reference the issue number in the commit that closes it.
