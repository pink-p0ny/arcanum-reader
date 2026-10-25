#!/usr/bin/env python3
"""Builds the comic fixtures for `npm run test:reader`: comic.cbz and comic.cbr.

The pages are small flat JPEGs with a big page number, named so that lexical order differs from reading
order (pg-10 before pg-2). The CBZ carries a ComicInfo.xml, a double-page spread, a bookmark, and the junk
entries real archives have (__MACOSX, Thumbs.db). The CBR is a RAR 4 archive with "store" entries written
by hand, because no rar tool is installed; unrar reads it like any other.

    python3 reader-web/test/make-comics.py
"""
import io
import struct
import zipfile
import zlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
PAGES = 12
COLORS = ['#f4b6c2', '#f6d8ae', '#c9e4de', '#c6def1', '#dbcdf0', '#f2c6de']


def page(n, wide=False):
    w, h = (1600, 1000) if wide else (800, 1000)
    im = Image.new('RGB', (w, h), COLORS[n % len(COLORS)])
    d = ImageDraw.Draw(im)
    d.rectangle([40, 40, w - 40, h - 40], outline='#333', width=8)
    font = ImageFont.load_default(size=360)
    d.text((w / 2, h / 2), str(n), fill='#222', anchor='mm', font=font)
    d.text((w / 2, h - 110), 'spread' if wide else f'page {n}', fill='#222', anchor='mm', font=ImageFont.load_default(size=60))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=60)
    return buf.getvalue()


COMIC_INFO = f"""<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>Fixture Comic</Title>
  <Series>Arcanum Tests</Series>
  <Number>1</Number>
  <Summary>Twelve pages that count.</Summary>
  <Writer>Pink Pony</Writer>
  <Publisher>Pink Pony Software</Publisher>
  <Year>2026</Year>
  <Genre>Test</Genre>
  <PageCount>{PAGES}</PageCount>
  <LanguageISO>en</LanguageISO>
  <Pages>
    <Page Image="0" Type="FrontCover" />
    <Page Image="5" DoublePage="true" />
    <Page Image="6" Bookmark="Chapter Two" />
  </Pages>
</ComicInfo>
"""


def entries(prefix=''):
    out = [(f'{prefix}ComicInfo.xml', COMIC_INFO.encode())]
    for n in range(1, PAGES + 1):
        out.append((f'{prefix}pg-{n}.jpg', page(n, wide=(n == 6))))
    return out


def make_cbz(path):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in entries('Fixture Comic/'):
            z.writestr(name, data)
        z.writestr('Fixture Comic/Thumbs.db', b'\0' * 16)
        z.writestr('__MACOSX/Fixture Comic/._pg-1.jpg', b'\0' * 16)


# ---- RAR 4 writer (store only) ----

def rar_block(head_type, flags, body):
    size = 7 + len(body)
    head = struct.pack('<BHH', head_type, flags, size) + body
    crc = zlib.crc32(head) & 0xFFFF
    return struct.pack('<H', crc) + head


def make_cbr(path):
    out = bytearray(b'Rar!\x1a\x07\x00')
    out += rar_block(0x73, 0x0000, struct.pack('<HI', 0, 0))  # main header
    for name, data in entries():
        name_b = name.encode('utf-8')
        body = struct.pack('<IIBIIBBHI', len(data), len(data), 2, zlib.crc32(data) & 0xFFFFFFFF, 0, 20, 0x30, len(name_b), 0x20)
        out += rar_block(0x74, 0x8000, body + name_b)  # LONG_BLOCK: packed data follows the header
        out += data
    out += rar_block(0x7B, 0x4000, b'')  # end of archive
    path.write_bytes(out)


if __name__ == '__main__':
    make_cbz(HERE / 'comic.cbz')
    make_cbr(HERE / 'comic.cbr')
    for f in ('comic.cbz', 'comic.cbr'):
        print(f, (HERE / f).stat().st_size, 'bytes')
