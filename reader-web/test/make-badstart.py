#!/usr/bin/env python3
"""Builds badstart.epub for `npm run test:reader`: a three-chapter EPUB 3 whose landmarks point the start of
the text at a file that does not exist (and whose guide points at the cover image, which is not in the
spine). Real books ship with both mistakes; foliate's "go to text start" used to fail on them and the reader
showed an empty page.

    python3 reader-web/test/make-badstart.py
"""
import zipfile
from pathlib import Path

HERE = Path(__file__).parent

CHAPTERS = [
    ('Chapter One', 'Down the rabbit hole. ' * 1500),
    ('Chapter Two', 'The pool of tears. ' * 1500),
    ('Chapter Three', 'A caucus race and a long tale. ' * 1500),
]


def xhtml(title, body):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{title}</title></head>
<body><h1>{title}</h1><p>{body}</p></body></html>'''


def build(path):
    manifest = ''.join(
        f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(len(CHAPTERS))
    )
    manifest += '<item id="contents" href="contents.xhtml" media-type="application/xhtml+xml"/>'
    spine = '<itemref idref="contents"/>' + ''.join(f'<itemref idref="c{i}"/>' for i in range(len(CHAPTERS)))
    # A contents page like real books have: one link as the manifest spells it, one in the wrong case, one
    # to a file that is not there (data-expect says what test:reader should see).
    contents = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Contents</title></head>
<body><h1>Contents</h1>
<p><a href="c0.xhtml" data-expect="Chapter One">Chapter One</a></p>
<p><a href="C1.XHTML" data-expect="Chapter Two">Chapter Two</a></p>
<p><a href="nowhere.xhtml" data-expect="none">Nowhere</a></p>
</body></html>'''
    opf = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:badstart</dc:identifier>
    <dc:title>Bad Start</dc:title>
    <dc:creator>Arcanum Tests</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
  <guide><reference type="text" title="Start" href="cover.png"/></guide>
</package>'''
    nav = f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body>
<nav epub:type="toc"><ol>{''.join(f'<li><a href="c{i}.xhtml">{t}</a></li>' for i, (t, _) in enumerate(CHAPTERS))}</ol></nav>
<nav epub:type="landmarks" hidden=""><ol><li><a epub:type="bodymatter" href="missing.xhtml">Start of text</a></li></ol></nav>
</body></html>'''
    png = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + b'\0' * 32
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/content.opf', opf, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/nav.xhtml', nav, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/cover.png', png)
        z.writestr('OEBPS/contents.xhtml', contents, zipfile.ZIP_DEFLATED)
        for i, (t, b) in enumerate(CHAPTERS):
            z.writestr(f'OEBPS/c{i}.xhtml', xhtml(t, b), zipfile.ZIP_DEFLATED)


if __name__ == '__main__':
    build(HERE / 'badstart.epub')
    print('badstart.epub', (HERE / 'badstart.epub').stat().st_size, 'bytes')
