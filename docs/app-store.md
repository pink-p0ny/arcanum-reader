# App Store listing

Paste-ready text for App Store Connect. Keep this file in sync with what is live.

## Names

| Field | Value | Limit |
|---|---|---|
| Name | Arcanum Reader | 30 |
| Subtitle | Your library, your server | 30 |
| Home-screen name | Arcanum (from `app.json`) | |
| Primary category | Books | |
| Secondary category | Productivity | |

## Promotional text (170)

Read the ebooks on your own Grimmory or Booklore server, with highlights and notes that sync back,
read-aloud, and a home page that learns what you like.

## Description (4000)

Arcanum Reader is an ebook reader for people who keep their own library. Point it at your Grimmory or
Booklore server and every book is there, with your reading position, highlights and notes syncing both
ways. Nothing passes through anyone else's cloud.

READING
• Paged or scrolling, one or two columns, with real control over margins, line spacing, fonts and width
• Light, sepia and dark themes, or follow the system
• Highlights in six colours and four styles, with notes, all synced to your server
• Look Up, Translate and Share from the system menu, right next to Highlight
• Read aloud with the voices built into iPadOS, sentence by sentence
• Downloads for offline reading; anything you do offline syncs when you are back

YOUR LIBRARY
• A home page in the style you would expect: Continue Reading, shelves for the genres you actually finish
  and rate highly, top rated, recently added
• Browse by genre, search by title or author, sort any way you like
• Community ratings from Goodreads, Amazon and Hardcover, as synced by your server
• Surprise Me: one book, chosen for you, with a reason, and a button to try another

WANT MORE?
• Ask a Bindery server for books you do not have yet, straight from the app
• Bring your own Anthropic API key and Surprise Me will ask Claude, taking your mood into account

ARCANUM NEVER SEES YOUR BOOKS
The app talks only to servers you choose. There is no account with us, no analytics, and no copy of your
library anywhere but your devices and your server.

Arcanum Reader needs a Grimmory or Booklore server to read from. It is free and open source.

## Keywords (100)

ebook,epub,reader,grimmory,booklore,self-hosted,library,highlights,notes,read aloud,calibre

## URLs

| Field | Value |
|---|---|
| Support URL | https://github.com/pink-p0ny/arcanum-reader (make public first) or a page on arcanum-reader.app |
| Marketing URL | optional |
| Privacy policy URL | required before public release; see below |

## Privacy policy (draft, host anywhere)

Arcanum Reader does not collect, store or transmit any personal data to its developer. The app connects
only to servers the user configures: a Grimmory or Booklore library server, optionally a Bindery server,
and optionally the Anthropic API using the user's own key. Credentials are stored in the device keychain.
Reading positions, highlights and notes are stored on the user's own library server. The app contains no
analytics, advertising or tracking. Questions: <email>.

## App Privacy questionnaire

Answer **Data Not Collected**. The app has no backend of ours, no analytics SDK and no crash reporting.
Data sent to the user's own servers at their request is not collection under Apple's definitions. If the
hosted Arcanum Server tier launches later, revisit: identifiers tied to receipts may count.

## Age rating

All questions "None"; the app shows the user's own books. Unrestricted web access: No (external links open
in the system browser after a confirmation). Result: 4+.

## Review notes

Arcanum Reader is a client for a self-hosted library server (Grimmory, an open-source project). To review,
sign in with:

    Server:   https://grimmory.example.com
    Username: <create a reviewer account in Grimmory>
    Password: <...>

The library contains public-domain books. All features work with this account. Bindery and AI picks are
optional integrations that need the user's own servers or API key; leave them unconfigured.

## Screenshots to take (iPad 13-inch and 11-inch)

1. Home tab with shelves
2. Reader, two columns, sepia
3. Text selected with the edit menu showing Highlight and Add Note
4. Book page with ratings and highlights
5. Surprise Me sheet
6. Reader settings sheet
