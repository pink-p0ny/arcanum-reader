@AGENTS.md

# Project notes

- Grimmory server API is documented in the Java controllers of `grimmory-tools/grimmory` (no OpenAPI exposed on
  the user's server). The app uses the `/api/v1/app/*` mobile endpoints, `/api/v1/annotations`,
  `/api/v1/books/{id}/content?bookType=EPUB` for downloads, and `/api/v1/media/book/{id}/thumbnail` for covers.
- `reader-web/foliate` is vendored from Grimmory's frontend (`frontend/src/assets/foliate`, MIT). Do not edit it;
  change `reader-web/src/main.js` and rebuild with `npm run build:reader`. The bundle is inlined into
  `assets/reader/reader.html` by string splicing, never `String.replace` (foliate uses `$$` identifiers).
- The WebView loads `reader.html` from the Documents directory so WKWebView lets it XHR the downloaded EPUB
  (`allowingReadAccessToURL`). See `src/lib/reader-asset.ts`.
- Run `npm run typecheck`, `npm run lint` and `npm run test:reader -- <epub>` before calling work done.
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
