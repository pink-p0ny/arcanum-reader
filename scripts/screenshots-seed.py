#!/usr/bin/env python3
"""Seeds the simulator's folder library for App Store screenshots. Used by scripts/screenshots.sh.

  screenshots-seed.py --genres <epub-dir>        rewrite each EPUB's subjects to short genre names
  screenshots-seed.py <library-dir>              write sidecars: progress, status, ratings, added dates
  screenshots-seed.py <library-dir> <db>         reader settings (sepia, two columns) and a week of sessions
  screenshots-seed.py --id <library-dir> <file>  print the folder book id of one file
"""
import json
import os
import re
import sqlite3
import sys
import time
import zipfile
from datetime import datetime, timedelta, timezone

GENRES = {
    'age-of-innocence': ['Classics', 'Romance'],
    'alice-in-wonderland': ['Fantasy', "Children's"],
    'dorian-gray': ['Gothic', 'Classics'],
    'dracula': ['Horror', 'Gothic'],
    'dubliners': ['Short Stories', 'Classics'],
    'emma': ['Romance', 'Classics'],
    'frankenstein': ['Science Fiction', 'Gothic'],
    'great-gatsby': ['Classics', 'Literary Fiction'],
    'jane-eyre': ['Romance', 'Gothic'],
    'jekyll-and-hyde': ['Horror', 'Mystery'],
    'little-women': ['Classics', 'Coming of Age'],
    'moby-dick': ['Adventure', 'Classics'],
    'mysterious-affair-at-styles': ['Mystery', 'Crime'],
    'poe-works': ['Horror', 'Short Stories'],
    'right-ho-jeeves': ['Humor', 'Classics'],
    'sherlock-holmes': ['Mystery', 'Short Stories'],
    'the-odyssey': ['Epic', 'Classics'],
    'twenty-thousand-leagues': ['Science Fiction', 'Adventure'],
    'war-of-the-worlds': ['Science Fiction', 'Classics'],
    'wizard-of-oz': ['Fantasy', "Children's"],
    'yellow-wallpaper': ['Horror', 'Short Stories'],
}

TITLES = {
    'the-odyssey': 'The Odyssey',
    'war-of-the-worlds': 'The War of the Worlds',
    'poe-works': 'The Works of Edgar Allan Poe',
    'sherlock-holmes': 'The Adventures of Sherlock Holmes',
    'twenty-thousand-leagues': 'Twenty Thousand Leagues Under the Sea',
    'mysterious-affair-at-styles': 'The Mysterious Affair at Styles',
    'jekyll-and-hyde': 'The Strange Case of Dr. Jekyll and Mr. Hyde',
    'yellow-wallpaper': 'The Yellow Wallpaper',
    'alice-in-wonderland': "Alice's Adventures in Wonderland",
    'dorian-gray': 'The Picture of Dorian Gray',
}

# name -> (progress fraction, status, rating, days since last read)
HISTORY = {
    'emma': (0.42, 'READING', None, 0),
    'dracula': (0.15, 'READING', None, 1),
    'moby-dick': (0.63, 'READING', None, 3),
    'frankenstein': (1.0, 'READ', 5, 5),
    'sherlock-holmes': (1.0, 'READ', 5, 9),
    'dorian-gray': (1.0, 'READ', 4, 14),
    'jane-eyre': (1.0, 'READ', 4, 20),
    'mysterious-affair-at-styles': (1.0, 'READ', 4, 26),
    'little-women': (1.0, 'READ', 3, 40),
}


def book_id(name: str) -> int:
    h = 0x811C9DC5
    for ch in name:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return -((h % 0x7FFFFFFF) + 1)


def iso(days_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime('%Y-%m-%dT%H:%M:%SZ')


def rewrite_genres(epub_dir: str):
    for name, genres in GENRES.items():
        path = os.path.join(epub_dir, f'{name}.epub')
        if not os.path.exists(path):
            continue
        with zipfile.ZipFile(path) as z:
            items = [(i, z.read(i.filename)) for i in z.infolist()]
        out = []
        for info, data in items:
            if info.filename.endswith('.opf'):
                text = data.decode('utf-8')
                text = re.sub(r'\s*<dc:subject[^>]*>.*?</dc:subject>', '', text, flags=re.S)
                tags = ''.join(f'\n    <dc:subject>{g}</dc:subject>' for g in genres)
                text = text.replace('</metadata>', f'{tags}\n  </metadata>', 1)
                if name in TITLES:
                    text = re.sub(r'(<dc:title[^>]*>).*?(</dc:title>)', lambda m: m.group(1) + TITLES[name] + m.group(2), text, count=1, flags=re.S)
                data = text.encode('utf-8')
            out.append((info, data))
        tmp = path + '.tmp'
        with zipfile.ZipFile(tmp, 'w') as z:
            for info, data in out:
                method = zipfile.ZIP_STORED if info.filename == 'mimetype' else zipfile.ZIP_DEFLATED
                z.writestr(info.filename, data, compress_type=method)
        os.replace(tmp, path)
        print('genres', name, genres)


def write_sidecars(lib: str):
    files = sorted(f for f in os.listdir(lib) if f.endswith('.epub'))
    for i, f in enumerate(files):
        name = f[:-5]
        side = {'version': 1, 'annotations': [], 'nextAnnotationId': 1, 'addedOn': iso(2 + i * 2.7)}
        if name in HISTORY:
            fraction, status, rating, days = HISTORY[name]
            side['progress'] = {'fraction': fraction, 'updatedAt': iso(days + 0.3)}
            side['status'] = status
            if rating:
                side['rating'] = rating
        with open(os.path.join(lib, f'{name}.arcanum.json'), 'w') as fh:
            json.dump(side, fh, indent=2)
    print('sidecars', len(files))


def seed_db(db_path: str):
    db = sqlite3.connect(db_path)
    settings = {
        'fontSize': 19, 'lineHeight': 1.5, 'sideMargin': 8, 'verticalMargin': 56, 'maxInlineSize': 720,
        'maxColumns': 2, 'fontFamily': '"Palatino", "Book Antiqua", serif', 'theme': 'sepia',
        'flow': 'paginated', 'justify': True, 'hyphenate': True, 'ttsRate': 1, 'ttsVoice': None,
    }
    db.execute('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', ('readerSettings', json.dumps(settings)))
    db.execute('DELETE FROM sessions')
    now = int(time.time() * 1000)
    day = 86_400_000
    reading = ['emma.epub', 'dracula.epub', 'moby-dick.epub']
    minutes = [38, 52, 0, 45, 61, 27, 44]  # a week, newest last
    for d, mins in enumerate(reversed(minutes)):
        if not mins:
            continue
        end = now - d * day - 3 * 3_600_000
        db.execute(
            'INSERT INTO sessions (book_id, started_at, ended_at) VALUES (?, ?, ?)',
            (book_id(reading[d % len(reading)]), end - mins * 60_000, end),
        )
    db.commit()
    print('db seeded')


args = sys.argv[1:]
if args and args[0] == '--genres':
    rewrite_genres(args[1])
elif args and args[0] == '--id':
    print(book_id(args[2]))
elif len(args) == 1:
    write_sidecars(args[0])
elif len(args) == 2:
    seed_db(args[1])
else:
    print(__doc__)
    sys.exit(1)
