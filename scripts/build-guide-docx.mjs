#!/usr/bin/env node
/**
 * scripts/build-guide-docx.mjs
 *
 * Compiles markdown handover guides (docs/guides/en/*.md and docs/guides/zh/*.md)
 * into high-quality, valid OOXML Word documents (.docx) in docs/guides/word/.
 *
 * Zero external dependencies: uses only Node.js built-in modules (node:fs, node:path, node:zlib).
 * Embeds real PNG screenshots with aspect-ratio preserving dimensions from IHDR headers.
 *
 * Usage:
 *   node scripts/build-guide-docx.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ---------------------------------------------------------------------------
// 1. Zero-dependency PKZIP Writer
// ---------------------------------------------------------------------------

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c >>> 0;
}

function calculateCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class OoxmlZipPackage {
  constructor() {
    this.entries = [];
  }

  addFile(name, content, compress = true) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = calculateCrc32(raw);
    const compressed = compress ? zlib.deflateRawSync(raw) : raw;
    const method = compress ? 8 : 0;
    this.entries.push({ name, raw, compressed, crc, method });
  }

  toBuffer() {
    const localChunks = [];
    const cdChunks = [];
    let offset = 0;

    for (const entry of this.entries) {
      const nameBuf = Buffer.from(entry.name, 'utf8');
      const localHdr = Buffer.alloc(30);
      localHdr.writeUInt32LE(0x04034b50, 0); // Local header signature
      localHdr.writeUInt16LE(20, 4);         // Version needed: 2.0
      localHdr.writeUInt16LE(0x0800, 6);     // Flags: bit 11 set for UTF-8
      localHdr.writeUInt16LE(entry.method, 8);
      localHdr.writeUInt16LE(0, 10);         // Mod time
      localHdr.writeUInt16LE(0, 12);         // Mod date
      localHdr.writeUInt32LE(entry.crc, 14);
      localHdr.writeUInt32LE(entry.compressed.length, 18);
      localHdr.writeUInt32LE(entry.raw.length, 22);
      localHdr.writeUInt16LE(nameBuf.length, 26);
      localHdr.writeUInt16LE(0, 28);         // Extra field length

      localChunks.push(localHdr, nameBuf, entry.compressed);

      const cdHdr = Buffer.alloc(46);
      cdHdr.writeUInt32LE(0x02014b50, 0);    // Central directory header signature
      cdHdr.writeUInt16LE(20, 4);            // Version made by
      cdHdr.writeUInt16LE(20, 6);            // Version needed
      cdHdr.writeUInt16LE(0x0800, 8);        // Flags: UTF-8
      cdHdr.writeUInt16LE(entry.method, 10);
      cdHdr.writeUInt16LE(0, 12);            // Mod time
      cdHdr.writeUInt16LE(0, 14);            // Mod date
      cdHdr.writeUInt32LE(entry.crc, 16);
      cdHdr.writeUInt32LE(entry.compressed.length, 20);
      cdHdr.writeUInt32LE(entry.raw.length, 24);
      cdHdr.writeUInt16LE(nameBuf.length, 28);
      cdHdr.writeUInt16LE(0, 30);            // Extra field length
      cdHdr.writeUInt16LE(0, 32);            // Comment length
      cdHdr.writeUInt16LE(0, 34);            // Disk number start
      cdHdr.writeUInt16LE(0, 36);            // Internal file attributes
      cdHdr.writeUInt32LE(0, 38);            // External file attributes
      cdHdr.writeUInt32LE(offset, 42);       // Relative offset of local header

      cdChunks.push(cdHdr, nameBuf);
      offset += localHdr.length + nameBuf.length + entry.compressed.length;
    }

    const cdBuf = Buffer.concat(cdChunks);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);       // End of central directory signature
    eocd.writeUInt16LE(0, 4);                // Disk number
    eocd.writeUInt16LE(0, 6);                // Disk with start of CD
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);    // CD size
    eocd.writeUInt32LE(offset, 16);          // CD offset
    eocd.writeUInt16LE(0, 20);               // Comment length

    return Buffer.concat([...localChunks, cdBuf, eocd]);
  }
}

// ---------------------------------------------------------------------------
// 2. PNG Header Dimension Parser & EMU Calculator
// ---------------------------------------------------------------------------

function getPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function calculateEmuDimensions(pxWidth, pxHeight) {
  // 96 DPI: 1 inch = 914400 EMUs, 1 px = 914400 / 96 = 9525 EMUs
  const rawEmuW = pxWidth * 9525;
  const rawEmuH = pxHeight * 9525;

  // Max printable width on A4 with 1-inch margins: ~5.8 inches = 5,300,000 EMUs
  const MAX_W = 5300000;
  // Max printable height on A4: ~6.5 inches = 6,000,000 EMUs
  const MAX_H = 6000000;

  let scale = 1.0;
  if (rawEmuW > MAX_W) {
    scale = Math.min(scale, MAX_W / rawEmuW);
  }
  if (rawEmuH * scale > MAX_H) {
    scale = Math.min(scale, MAX_H / rawEmuH);
  }

  return {
    cx: Math.round(rawEmuW * scale),
    cy: Math.round(rawEmuH * scale)
  };
}

// ---------------------------------------------------------------------------
// 3. XML Helpers & Markdown Parser
// ---------------------------------------------------------------------------

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parses markdown inline formatting (bold, italic, code, link) into WordprocessingML <w:r> runs.
 */
function renderInlineRuns(text, defaultRunPr = '') {
  const runs = [];
  // Tokenize bold/italic/code/link
  // Regex matches:
  // 1: bold italic ***text***
  // 2: bold **text**
  // 3: italic *text*
  // 4: code `code`
  // 5: link [text](url)
  const tokenRegex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;

  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.substring(lastIndex, match.index);
      runs.push(`<w:r>${defaultRunPr}<w:t xml:space="preserve">${escapeXml(plain)}</w:t></w:r>`);
    }

    if (match[2]) {
      // ***bold italic***
      runs.push(
        `<w:r><w:rPr><w:b/><w:i/>${defaultRunPr ? defaultRunPr.replace(/<\/?w:rPr>/g, '') : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(
          match[2]
        )}</w:t></w:r>`
      );
    } else if (match[3]) {
      // **bold**
      runs.push(
        `<w:r><w:rPr><w:b/>${defaultRunPr ? defaultRunPr.replace(/<\/?w:rPr>/g, '') : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(
          match[3]
        )}</w:t></w:r>`
      );
    } else if (match[4]) {
      // *italic*
      runs.push(
        `<w:r><w:rPr><w:i/>${defaultRunPr ? defaultRunPr.replace(/<\/?w:rPr>/g, '') : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(
          match[4]
        )}</w:t></w:r>`
      );
    } else if (match[5]) {
      // `code`
      runs.push(
        `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${escapeXml(
          match[5]
        )}</w:t></w:r>`
      );
    } else if (match[6]) {
      // [text](url)
      const linkText = match[6];
      runs.push(
        `<w:r><w:rPr><w:color w:val="0284C7"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${escapeXml(
          linkText
        )}</w:t></w:r>`
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    const plain = text.substring(lastIndex);
    runs.push(`<w:r>${defaultRunPr}<w:t xml:space="preserve">${escapeXml(plain)}</w:t></w:r>`);
  }

  return runs.join('');
}

// ---------------------------------------------------------------------------
// 4. Document XML Generator
// ---------------------------------------------------------------------------

function buildDocumentXml(markdownContent, sourceFilePath, imageRegistry) {
  const lines = markdownContent.split(/\r?\n/);
  const bodyXml = [];

  let i = 0;
  const docDir = path.dirname(sourceFilePath);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      bodyXml.push(
        `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="8" w:color="E2E8F0"/></w:pBdr><w:spacing w:before="120" w:after="180"/></w:pPr></w:p>`
      );
      i++;
      continue;
    }

    // Heading # Title
    if (/^#\s+(.+)$/.test(line)) {
      const text = line.replace(/^#\s+/, '').trim();
      bodyXml.push(
        `<w:p><w:pPr><w:spacing w:before="240" w:after="180"/><w:jc w:val="left"/></w:pPr>${renderInlineRuns(
          text,
          '<w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F172A"/></w:rPr>'
        )}</w:p>`
      );
      i++;
      continue;
    }

    // Heading ## Section
    if (/^##\s+(.+)$/.test(line)) {
      const text = line.replace(/^##\s+/, '').trim();
      bodyXml.push(
        `<w:p><w:pPr><w:spacing w:before="360" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="CBD5E1"/></w:pBdr></w:pPr>${renderInlineRuns(
          text,
          '<w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0284C7"/></w:rPr>'
        )}</w:p>`
      );
      i++;
      continue;
    }

    // Heading ### Sub-section
    if (/^###\s+(.+)$/.test(line)) {
      const text = line.replace(/^###\s+/, '').trim();
      bodyXml.push(
        `<w:p><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr>${renderInlineRuns(
          text,
          '<w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1E293B"/></w:rPr>'
        )}</w:p>`
      );
      i++;
      continue;
    }

    // Heading #### Sub-sub-section
    if (/^####\s+(.+)$/.test(line)) {
      const text = line.replace(/^####\s+/, '').trim();
      bodyXml.push(
        `<w:p><w:pPr><w:spacing w:before="180" w:after="60"/></w:pPr>${renderInlineRuns(
          text,
          '<w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="334155"/></w:rPr>'
        )}</w:p>`
      );
      i++;
      continue;
    }

    // Fenced Code Block
    if (trimmed.startsWith('```')) {
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```

      const codeContent = codeLines.join('\n');
      bodyXml.push(
        `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/><w:pBdr><w:top w:val="single" w:sz="6" w:space="6" w:color="CBD5E1"/><w:left w:val="single" w:sz="18" w:space="8" w:color="0284C7"/><w:bottom w:val="single" w:sz="6" w:space="6" w:color="CBD5E1"/><w:right w:val="single" w:sz="6" w:space="6" w:color="CBD5E1"/></w:pBdr><w:ind w:left="180" w:right="180"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${escapeXml(
          codeContent
        )}</w:t></w:r></w:p>`
      );
      continue;
    }

    // Blockquote / Callout
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const quoteText = quoteLines.join(' ');
      bodyXml.push(
        `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/><w:pBdr><w:left w:val="single" w:sz="24" w:space="12" w:color="0284C7"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/><w:ind w:left="240" w:right="240"/></w:pPr>${renderInlineRuns(
          quoteText,
          '<w:rPr><w:i/><w:color w:val="334155"/></w:rPr>'
        )}</w:p>`
      );
      continue;
    }

    // Markdown Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseRow = (rowStr) =>
          rowStr
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());

        const headerCells = parseRow(tableLines[0]);
        // line 1 is usually separator (|---|---|...)
        const dataRows = tableLines.slice(2).map(parseRow);

        let tableXml = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar></w:tblPr>`;

        // Header Row
        tableXml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>`;
        for (const cell of headerCells) {
          tableXml += `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E2E8F0"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${renderInlineRuns(
            cell,
            '<w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr>'
          )}</w:p></w:tc>`;
        }
        tableXml += `</w:tr>`;

        // Data Rows
        for (const row of dataRows) {
          tableXml += `<w:tr>`;
          for (let cIdx = 0; cIdx < headerCells.length; cIdx++) {
            const cellVal = row[cIdx] || '';
            tableXml += `<w:tc><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${renderInlineRuns(
              cellVal,
              '<w:rPr><w:sz w:val="20"/></w:rPr>'
            )}</w:p></w:tc>`;
          }
          tableXml += `</w:tr>`;
        }

        tableXml += `</w:tbl>`;
        bodyXml.push(tableXml);
        continue;
      }
    }

    // Image: ![alt](path)
    const imgMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      const altText = imgMatch[1];
      const relImgPath = imgMatch[2];
      const fullImgPath = path.resolve(docDir, relImgPath);

      if (!fs.existsSync(fullImgPath)) {
        throw new Error(
          `Image referenced in ${sourceFilePath} does not exist on disk: ${relImgPath} (resolved: ${fullImgPath})`
        );
      }

      const imgBuffer = fs.readFileSync(fullImgPath);
      const dims = getPngDimensions(imgBuffer);
      if (!dims) {
        throw new Error(`Failed to parse PNG dimensions for image: ${fullImgPath}`);
      }

      const { cx, cy } = calculateEmuDimensions(dims.width, dims.height);
      const fileName = path.basename(fullImgPath);

      let regItem = imageRegistry.find((r) => r.fullPath === fullImgPath);
      if (!regItem) {
        const rId = `rIdImg${imageRegistry.length + 1}`;
        const zipMediaName = `media/image${imageRegistry.length + 1}.png`;
        regItem = { rId, zipMediaName, fullPath: fullImgPath, buffer: imgBuffer, fileName };
        imageRegistry.push(regItem);
      }

      const picId = imageRegistry.indexOf(regItem) + 1;

      bodyXml.push(
        `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="180" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${picId}" name="${escapeXml(
          fileName
        )}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${picId}" name="${escapeXml(
          fileName
        )}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${
          regItem.rId
        }"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
      );
      if (altText) {
        bodyXml.push(
          `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="180"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${escapeXml(
            altText
          )}</w:t></w:r></w:p>`
        );
      }
      i++;
      continue;
    }

    // Unordered / Checkbox List
    if (/^[-*]\s+/.test(trimmed)) {
      let itemText = trimmed.replace(/^[-*]\s+/, '');
      if (itemText.startsWith('[ ] ')) {
        itemText = '☐ ' + itemText.substring(4);
      } else if (itemText.startsWith('[x] ') || itemText.startsWith('[X] ')) {
        itemText = '☑ ' + itemText.substring(4);
      } else {
        itemText = '• ' + itemText;
      }
      bodyXml.push(
        `<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/><w:spacing w:before="40" w:after="40"/></w:pPr>${renderInlineRuns(
          itemText
        )}</w:p>`
      );
      i++;
      continue;
    }

    // Ordered List
    if (/^\d+\.\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+\.)\s+(.+)$/);
      const prefix = match ? match[1] + ' ' : '';
      const text = match ? match[2] : trimmed;
      bodyXml.push(
        `<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(
          prefix
        )}</w:t></w:r>${renderInlineRuns(text)}</w:p>`
      );
      i++;
      continue;
    }

    // Regular Paragraph
    bodyXml.push(
      `<w:p><w:pPr><w:spacing w:before="60" w:after="100"/><w:ind w:left="0" w:right="0"/></w:pPr>${renderInlineRuns(
        trimmed
      )}</w:p>`
    );
    i++;
  }

  // Section Properties: A4 Portrait with standard 1-inch margins (1440 dxa)
  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml.join('\n    ')}
    ${sectPr}
  </w:body>
</w:document>`;
}

// ---------------------------------------------------------------------------
// 5. Standard OOXML Metadata & Relationships
// ---------------------------------------------------------------------------

function buildContentTypesXml(hasImages) {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>`;
  if (hasImages) {
    xml += `\n  <Default Extension="png" ContentType="image/png"/>\n  <Default Extension="jpeg" ContentType="image/jpeg"/>\n  <Default Extension="jpg" ContentType="image/jpeg"/>`;
  }
  xml += `
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  return xml;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildDocumentRelsXml(imageRegistry) {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  for (const img of imageRegistry) {
    xml += `\n  <Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.zipMediaName}"/>`;
  }
  xml += `\n</Relationships>`;
  return xml;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:color w:val="1E293B"/>
        <w:lang w:val="en-US" w:eastAsia="zh-CN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
}

// ---------------------------------------------------------------------------
// 6. Main Orchestrator
// ---------------------------------------------------------------------------

export async function buildDocxFile(mdFilePath, outDocxPath) {
  if (!fs.existsSync(mdFilePath)) {
    throw new Error(`Source markdown file does not exist: ${mdFilePath}`);
  }

  const content = fs.readFileSync(mdFilePath, 'utf8');
  const imageRegistry = [];

  const documentXml = buildDocumentXml(content, mdFilePath, imageRegistry);
  const contentTypesXml = buildContentTypesXml(imageRegistry.length > 0);
  const rootRelsXml = buildRootRelsXml();
  const documentRelsXml = buildDocumentRelsXml(imageRegistry);
  const stylesXml = buildStylesXml();

  const pkg = new OoxmlZipPackage();
  pkg.addFile('[Content_Types].xml', contentTypesXml);
  pkg.addFile('_rels/.rels', rootRelsXml);
  pkg.addFile('word/document.xml', documentXml);
  pkg.addFile('word/_rels/document.xml.rels', documentRelsXml);
  pkg.addFile('word/styles.xml', stylesXml);

  // Add embedded media
  for (const img of imageRegistry) {
    pkg.addFile(`word/${img.zipMediaName}`, img.buffer, false); // Store PNG without recompression
  }

  const outDir = path.dirname(outDocxPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const zipBuffer = pkg.toBuffer();
  fs.writeFileSync(outDocxPath, zipBuffer);

  return {
    source: mdFilePath,
    output: outDocxPath,
    bytes: zipBuffer.length,
    images: imageRegistry.length
  };
}

export async function buildAllGuides() {
  const guideMappings = [
    { src: 'docs/guides/en/1-class-lead-guide.md', dest: 'docs/guides/word/1-class-lead-guide-en.docx' },
    { src: 'docs/guides/zh/1-class-lead-guide.md', dest: 'docs/guides/word/1-class-lead-guide-zh.docx' },
    { src: 'docs/guides/en/2-admin-guide.md', dest: 'docs/guides/word/2-admin-guide-en.docx' },
    { src: 'docs/guides/zh/2-admin-guide.md', dest: 'docs/guides/word/2-admin-guide-zh.docx' },
    { src: 'docs/guides/en/3-dancer-guide.md', dest: 'docs/guides/word/3-dancer-guide-en.docx' },
    { src: 'docs/guides/zh/3-dancer-guide.md', dest: 'docs/guides/word/3-dancer-guide-zh.docx' },
    { src: 'docs/guides/en/4-admin-handover-guide.md', dest: 'docs/guides/word/4-admin-handover-guide-en.docx' },
    { src: 'docs/guides/zh/4-admin-handover-guide.md', dest: 'docs/guides/word/4-admin-handover-guide-zh.docx' },
    { src: 'docs/guides/en/5-developer-guide.md', dest: 'docs/guides/word/5-developer-guide-en.docx' },
    { src: 'docs/guides/zh/5-developer-guide.md', dest: 'docs/guides/word/5-developer-guide-zh.docx' }
  ];

  console.log('Building OOXML Word guides (.docx) with zero external dependencies...\n');
  const results = [];

  for (const mapping of guideMappings) {
    const res = await buildDocxFile(mapping.src, mapping.dest);
    results.push(res);
    console.log(
      `✓ Built: ${mapping.dest} (${(res.bytes / 1024).toFixed(1)} KB, ${res.images} embedded image${
        res.images === 1 ? '' : 's'
      })`
    );
  }

  console.log(`\nSuccessfully built all ${results.length} guides in docs/guides/word/!`);
  return results;
}

// Direct execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/build-guide-docx.mjs')) {
  buildAllGuides().catch((err) => {
    console.error('Fatal build-guide-docx error:', err);
    process.exit(1);
  });
}
