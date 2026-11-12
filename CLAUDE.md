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
  swipe handled in main.js). Scans get pages by default: `isScanned` in pdf.js samples four pages for one
  image covering the page (operator list + transform), and such a PDF reflows only with the separate
  `pdfReflowScans` setting (`READER_PDF_REFLOW_SCANS=1` in `test:reader`; `book.pdf.scanned` drives the
  settings-sheet copy); a PDF with no text layer always gets pages. Reflow repairs for OCR layers: soft
  hyphens (U+00AD) at line ends become joins, a lone big letter (drop cap) rejoins its paragraph, a running
  head glued to another line is stripped, and item widths are capped at 1em per glyph so OCR word boxes
  do not swallow the space before the next word. `reader-web/test/scan.pdf` (from `make-scan.py`, hand
  written PDF: full-page JPEG + invisible text) is the fixture. `READER_PDF_PAGES=1` makes `test:reader`
  use pages mode for any PDF. TXT (`reader-web/src/txt.js`) becomes a reflowable book with
  chapters guessed from heading lines; servers have no TXT type, so it is a folder-library format only.
- Comics: `reader-web/src/comic.js` opens CBZ (zip.js) and CBR (node-unrar-js bundled to `unrar.webjs` +
  `unrar.wasm` next to reader.html, loaded on first use like pdf.js) as pre-paginated books, one image per
  section, through foliate's fixed-layout renderer (spreads, cover alone, `book.dir` rtl). Pages are sorted
  naturally, ComicInfo.xml gives title/writers/Manga direction/DoublePage/Bookmarks; the same rules live in
  `src/lib/comic-meta.ts` (pure, tested) which the folder library uses for CBZ covers (CBR has no cover there).
  Servers call the type CBX and store progress as `cbxProgress { page, percentage }` (Position.pageFormat).
  Reader setting `comicDirection` auto/ltr/rtl reopens the book on change. CB7 is detected and refused.
  Fixtures `reader-web/test/comic.cbz` and `comic.cbr` come from `reader-web/test/make-comics.py` (PIL;
  the CBR is a hand-written RAR4 "store" archive since no rar tool is installed).
- `npm run test:reader -- <file>` accepts EPUB/MOBI/FB2/PDF/CBZ/CBR/TXT; `READER_SEARCH` sets the search term and
  `READER_START_CFI` opens at a saved position. Opening never trusts the book: `showStart` in `main.js` checks
  that a page is displayed after each attempt (saved CFI, its fraction, text start, first linear section),
  because foliate's `init` fails quietly on a landmark outside the spine or a CFI from another edition and
  used to leave an empty page nothing could turn. `reader-web/test/badstart.epub` (from `make-badstart.py`)
  has both faults; the stale-CFI case is `READER_START_CFI='epubcfi(/6/999)'` on any EPUB.
  Swipes in reflowable books: foliate's paginator drags the page and snaps on release, but decides from the
  last touchmove sample (or half a page of travel) and keeps taking touches while a snap animates or the
  next chapter loads, when its scroll bounds are stale (a second swipe then lands on the chapter start).
  `guardSwipes` in `main.js` (capture listeners on the book document and on reader.html) decides the
  release from the whole gesture and calls `renderer.snap(±2|0)`, and swallows touches, taps' next/prev
  included, while `turning` (cleared by the paginator's relocate off the blank pad pages, 1.2 s fallback).
  `test:reader` simulates slow drags, flicks and a double swipe; the book frame has no scripts, so the
  gesture is paced from Node and each touch goes to the live frame.
  Links inside a book go through `followLink` in `main.js` (foliate's 'link' event is cancelled): resolve,
  else match by file name ignoring folders and case, else an on-page notice; `badstart.epub` opens on a
  contents page with all three cases and `test:reader` clicks them (`data-expect` says where each lands).
  Books are untrusted: `reader-web/src/main.js` strips `allow-scripts` from every content iframe's sandbox
  (foliate leaves it on), and the test fails if `reader-web/test/scripted.epub` (Alice with a script element,
  an inline handler and a javascript: link injected) manages to set `data-script-ran`. The app only opens
  http(s)/mailto links out of a book.
  Reader errors before the book opens are shown on screen and stored in kv `lastReaderError`
  (`sqlite3 <app>/Documents/SQLite/grimmory.db` on a simulator).
- Titles pass through `cleanTitle` (`src/lib/editions.ts`) when server books are stored and on the book and
  reader screens: a title that is a path or URL (a text file printed to PDF keeps `file:///C|/...TXT` as its
  Title) gives way to the file name. Blurbs on the book page go through `stripHtml` there: every block tag
  is a break, entities are decoded, and raw newlines are whitespace in HTML but wrapped lines in plain text.
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
- AI picks (`src/lib/ai.ts`, pure parts in `ai-core.ts`) speak the Anthropic Messages API in four modes that
  differ only by base URL and credential: `byok` (user's key, api.anthropic.com), `cloud` (hosted Arcanum
  Server at cloud.arcanum-reader.app, bearer = RevenueCat app user id from `subscriberId()`), `self` (user's
  own Arcanum Server, URL in kv, ACCESS_TOKEN in SecureStore) and `off`. Only candidate titles and a taste
  summary are sent. The server lives in ../arcanum-server (github.com/pink-p0ny/arcanum-server): Hono,
  Cloudflare Workers for the hosted copy, `npm start` for self-hosting, `/v1/me` reports quota.
- Pure logic lives in `*-core.ts` / `taste.ts` / `highlights-markdown.ts` with `node:test` tests run by
  `npm test` (tsx); keep Expo imports out of those files. SQLite schema is at user_version 2 (sessions table).
- Booklore has no `/api/v1/app/*` endpoints; `src/lib/providers/booklore.ts` maps its `/api/v1/books` DTOs.
  The server kind is detected at sign-in (`detectKind` in session.ts) and stored on the session.
- `scripts/asc.mjs` talks to the App Store Connect API with the key in `~/.appstoreconnect/private_keys/`
  (never in the repo): `inspect`, `products`, `equalize <subId>`, `screenshots <png>` (review screenshots
  for the products), `listing` (pushes docs/app-store.md: subtitle, categories, description, keywords,
  URLs, age rating; rerun after editing the doc), `review` (App Review notes, demo account `reviewer` on the server in
  `$REVIEW_SERVER`, password from `$DEMO_PASSWORD`/clipboard, contact from `REVIEW_CONTACT_*` env vars) and `storeshots <dir>` (replaces the 13-inch and 11-inch
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
- EAS Update code signing: `certs/certificate.pem` is the public certificate (CN Pink Pony Software LLC, valid
  to 2036); the private key lives in `~/.arcanum/update-keys/` on the dev Mac, never in the repo. Not yet wired
  in: builds 1–6 have no certificate, and Expo requires a new runtime version for it, so run
  `npx expo-updates codesigning:configure --certificate-input-directory certs --key-input-directory ~/.arcanum/update-keys`
  together with the version bump for build 7, and from then on pass `--private-key-path ~/.arcanum/update-keys/private-key.pem`
  to every `eas update`.
- Purchases go through RevenueCat (`src/lib/premium.ts`, entitlement `premium`, public key in app.json
  `extra.revenueCatIosKey`). `CLOUD_ENABLED` is `__DEV__` so Arcanum Cloud stays hidden in production until
  the hosted service exists. The folder library (`src/lib/library-folder.ts`) uses negative book ids;
  `getProvider(bookId)` routes them. iCloud needs the dev build (`modules/icloud-container`).
- Planned work and bugs are tracked outside this repo (the GitHub issue tracker is not used, so nothing
  from the maintainer's personal account appears here). The exported backlog lives in the gitignored
  `issues-backup/` folder on the dev machine until a company-account tracker exists.
