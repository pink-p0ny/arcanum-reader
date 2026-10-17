/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';

import { decodeEntities, parseEpubMeta } from './epub-meta';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function epub(opf: string, extra: Record<string, Uint8Array> = {}, opfPath = 'OEBPS/content.opf') {
  return zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    [opfPath]: strToU8(opf),
    ...extra,
  });
}

describe('parseEpubMeta', () => {
  it('reads EPUB 3 metadata, series and a cover-image manifest item', () => {
    const meta = parseEpubMeta(
      epub(
        `<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>The Hobbit &amp; Friends</dc:title>
            <dc:creator>J. R. R. Tolkien</dc:creator>
            <dc:creator>Someone Else</dc:creator>
            <dc:language>en</dc:language>
            <dc:publisher>Allen &amp; Unwin</dc:publisher>
            <dc:date>1937-09-21</dc:date>
            <dc:description><p>There and <i>back</i> again.</p></dc:description>
            <meta property="belongs-to-collection" id="c1">Middle-earth</meta>
            <meta refines="#c1" property="group-position">1</meta>
          </metadata>
          <manifest>
            <item id="cov" href="images/cover.png" media-type="image/png" properties="cover-image"/>
            <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
        </package>`,
        { 'OEBPS/images/cover.png': PNG },
      ),
    );
    assert.equal(meta.title, 'The Hobbit & Friends');
    assert.deepEqual(meta.authors, ['J. R. R. Tolkien', 'Someone Else']);
    assert.equal(meta.language, 'en');
    assert.equal(meta.publisher, 'Allen & Unwin');
    assert.equal(meta.published, '1937-09-21');
    assert.equal(meta.description, 'There and back again.');
    assert.equal(meta.series, 'Middle-earth');
    assert.equal(meta.seriesNumber, 1);
    assert.equal(meta.cover?.ext, 'png');
    assert.deepEqual(meta.cover?.bytes, PNG);
  });

  it('reads EPUB 2 cover pointers, Calibre series tags and relative paths', () => {
    const meta = parseEpubMeta(
      epub(
        `<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
            <dc:title>Dune</dc:title>
            <dc:creator opf:role="aut">Frank Herbert</dc:creator>
            <meta name="cover" content="cover-img"/>
            <meta name="calibre:series" content="Dune Chronicles"/>
            <meta name="calibre:series_index" content="1.0"/>
          </metadata>
          <manifest>
            <item id="cover-img" href="../img/c.JPEG" media-type="image/jpeg"/>
          </manifest>
        </package>`,
        { 'img/c.JPEG': PNG },
        'ops/book.opf',
      ),
    );
    assert.equal(meta.title, 'Dune');
    assert.deepEqual(meta.authors, ['Frank Herbert']);
    assert.equal(meta.series, 'Dune Chronicles');
    assert.equal(meta.seriesNumber, 1);
    assert.equal(meta.cover?.ext, 'jpg');
  });

  it('rejects files that are not EPUBs', () => {
    assert.throws(() => parseEpubMeta(zipSync({ 'readme.txt': strToU8('hi') })), /Not an EPUB/);
  });
});

describe('decodeEntities', () => {
  it('handles named, decimal and hex entities', () => {
    assert.equal(decodeEntities('a &amp; b &#233; &#x1F525; &unknown;'), 'a & b é 🔥 &unknown;');
  });
});
