#!/usr/bin/env python3
"""Builds scan.pdf for `npm run test:reader`: two dozen pages that are each one full-page JPEG with an invisible
OCR-style text layer on top (text render mode 3), the way scanner software and OCR tools write PDFs. The
reader must show such a file as pages by default: the text is there for search, but reflowing it reads as
OCR noise. The first page's text is deliberately garbage, like a scanned cover.

    python3 reader-web/test/make-scan.py
"""
import io
import zlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
PAGES = 24
W, H = 612, 792  # points; the image is drawn at 1 px per point


def page_image(n):
    im = Image.new('RGB', (W, H), '#f3eee4')
    d = ImageDraw.Draw(im)
    d.rectangle([30, 30, W - 30, H - 30], outline='#777', width=3)
    d.text((W / 2, 150), f'Scanned page {n}', fill='#222', anchor='mm', font=ImageFont.load_default(size=44))
    for i in range(8):
        d.line([(80, 250 + i * 60), (W - 80, 250 + i * 60)], fill='#999', width=2)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=40)
    return buf.getvalue()


def ocr_text(n):
    if n == 1:
        return ["r", "L L", "'", "LITING", "wm:'", "D REFLECTION", "HE ART OF LIVING"]
    # Each line differs per page: lines repeated on most pages read as running heads and are dropped.
    return [f"Scanned page {n}.", f"On page {n} the quick brown fox jumps over the lazy dog while the rabbit",
            f"keeps its {n}th appointment and hurries on through the field.", f"Netherfield is mentioned on page {n} too."]


def pdf_string(s):
    return '(' + s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ')'


def build(path):
    objs = []  # list of bytes; object number = index + 1

    def add(body):
        objs.append(body)
        return len(objs)

    font = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    page_ids = []
    pages_placeholder = add(b'')  # pages tree, filled in below
    for n in range(1, PAGES + 1):
        jpg = page_image(n)
        img = add(b'<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n' % (W, H, len(jpg)) + jpg + b'\nendstream')
        lines = ocr_text(n)
        text = 'BT 3 Tr /F1 12 Tf 72 720 Td 16 TL ' + ' '.join(pdf_string(l) + " '" for l in lines) + ' ET'
        content = f'q {W} 0 0 {H} 0 0 cm /Im1 Do Q\n{text}\n'.encode('latin-1')
        cs = add(b'<< /Length %d >>\nstream\n' % len(content) + content + b'\nendstream')
        page = add(f'<< /Type /Page /Parent {pages_placeholder} 0 R /MediaBox [0 0 {W} {H}] /Resources << /Font << /F1 {font} 0 R >> /XObject << /Im1 {img} 0 R >> >> /Contents {cs} 0 R >>'.encode())
        page_ids.append(page)
    objs[pages_placeholder - 1] = f'<< /Type /Pages /Kids [{" ".join(f"{p} 0 R" for p in page_ids)}] /Count {len(page_ids)} >>'.encode()
    catalog = add(f'<< /Type /Catalog /Pages {pages_placeholder} 0 R >>'.encode())

    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n'.encode()
    out += b'0000000000 65535 f \n'
    for o in offsets:
        out += f'{o:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objs) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    path.write_bytes(out)


if __name__ == '__main__':
    build(HERE / 'scan.pdf')
    print('scan.pdf', (HERE / 'scan.pdf').stat().st_size, 'bytes')
