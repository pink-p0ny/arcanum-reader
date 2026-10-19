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

Read ebooks from your own Grimmory or Booklore server, or a folder in iCloud Drive. Highlights and
notes sync back, it reads aloud, and Home learns your taste.

## Description (4000)

Arcanum Reader is an ebook reader for people who keep their own library. Point it at your Grimmory or
Booklore server and every book is there, with your reading position, highlights and notes syncing both
ways. No server? Drop EPUBs into a folder in iCloud Drive and read them on every iPad you own. Nothing
passes through anyone else's cloud.

READING
• EPUB, Kindle AZW3 and MOBI, FB2, PDF and plain text
• Paged or scrolling, one or two columns, with real control over margins, line spacing, fonts and width
• Light, sepia and dark themes, or follow the system
• Highlights in six colours and four styles, with notes, all synced to your server
• Look Up, Translate and Share from the system menu, right next to Highlight
• Search inside the book
• Read aloud with the voices built into iPadOS, sentence by sentence
• Downloads for offline reading; anything you do offline syncs when you are back

YOUR LIBRARY
• A home page in the style you would expect: Continue Reading, shelves for the genres you actually finish
  and rate highly, top rated, recently added
• Browse by genre, search by title or author, sort any way you like
• The same book in two formats shows as one card; pick the edition when you open it
• Community ratings from Goodreads, Amazon and Hardcover, as synced by your server
• Surprise Me: one book, chosen for you, with a reason, and a button to try another
• Reading time this week, your streak, and a seven-day chart
• Share a book's highlights and notes as Markdown

WANT MORE?
• Ask a Bindery server for books you do not have yet, straight from the app
• Bring your own Anthropic API key and Surprise Me will ask Claude, taking your mood into account

ARCANUM NEVER SEES YOUR BOOKS
The app talks only to servers you choose. There is no account with us, no analytics, and no copy of your
library anywhere but your devices and your server.

Arcanum Reader works with a Grimmory or Booklore server, or on its own with a folder of books. It is
free and open source.

## Keywords (100)

ebook,epub,mobi,reader,grimmory,booklore,self-hosted,library,highlights,notes,read aloud,calibre

## URLs

| Field | Value |
|---|---|
| Support URL | https://arcanum-reader.app/support.html |
| Marketing URL | https://arcanum-reader.app |
| Privacy policy URL | https://arcanum-reader.app/privacy.html |

## Privacy policy (live at arcanum-reader.app/privacy.html; source in site/)

Arcanum Reader does not collect, store or transmit any personal data to its developer. The app connects
only to servers and storage the user configures: a Grimmory or Booklore library server, the user's own
iCloud Drive for a folder library, optionally a Bindery server, and optionally the Anthropic API using
the user's own key. Credentials are stored in the device keychain. Reading positions, highlights and notes
are stored on the user's own library server, or beside the book in their iCloud Drive. The app contains
no analytics, advertising or tracking. Questions: support@arcanum-reader.app.

## App Privacy questionnaire

Answer **Data Not Collected**. The app has no backend of ours, no analytics SDK and no crash reporting.
Data sent to the user's own servers at their request is not collection under Apple's definitions. If the
hosted Arcanum Server tier launches later, revisit: identifiers tied to receipts may count.

## Age rating

All questions "None"; the app shows the user's own books. Unrestricted web access: No (external links open
in the system browser after a confirmation). Result: 4+.

## Review notes

Arcanum Reader is a client for a self-hosted library server (Grimmory or Booklore, both open source). It
also works with no server at all: on the sign-in screen tap "No server? Use a folder of books instead",
then add books with Add Books on the Library tab or by opening an EPUB, PDF or text file from Files.

To review the server features, sign in with the demo account below. It sees a "Review Library" of eight
public-domain titles (Austen, Carroll, Conan Doyle, Gilman, Melville, Shelley, Stoker, Wilde) on the
developer's own server and can read, download, highlight and annotate them; reading positions and
highlights sync to that server. Bindery and AI picks are optional integrations that need the reviewer's
own servers or API key; leave them unconfigured. Arcanum Cloud (the subscription) is not offered in this
release.

    Server:   https://grimmory.example.com
    Username: reviewer

The demo password is not stored here: `scripts/asc.mjs review` reads it from `$DEMO_PASSWORD` or the
clipboard and sends it to the App Review demo-account field. The account is a download-only Grimmory user
assigned to the "Review Library" only (library id 2, files under `/app/data/review-library`).

## Review contact

Pushed to the App Review contact fields by `scripts/asc.mjs review`. The repo is public, so the real values
are not kept here: set `REVIEW_CONTACT_FIRST`, `REVIEW_CONTACT_LAST`, `REVIEW_CONTACT_PHONE` and
`REVIEW_CONTACT_EMAIL` in the environment when running the command (they override the table).

| First name | <first> |
| Last name | <last> |
| Phone | <phone> |
| Email | <email> |

## Screenshots to take (iPad 13-inch and 11-inch)

1. Home tab with shelves
2. Reader, two columns, sepia
3. Text selected with the edit menu showing Highlight and Add Note
4. Book page with ratings and highlights
5. Surprise Me sheet
6. Reader settings sheet
