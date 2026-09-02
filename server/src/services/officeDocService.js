/**
 * WoxMail Sandboxed Office Document Extraction Service
 * Extracts structured readable content (text, tables, slides) from binary Office formats
 * (.docx, .xlsx, .pptx) using native ZIP unpacking and XML parsing.
 * Zero external binary dependencies, zero untrusted script execution.
 */

import zlib from 'zlib';

/**
 * Unpacks a PKZIP buffer in memory into a map of filename -> Buffer.
 * Handles both Deflate-compressed and stored file streams.
 * @param {Buffer} buffer
 * @returns {Record<string, Buffer>}
 */
export function unpackZip(buffer) {
  const files = {};
  if (!Buffer.isBuffer(buffer) || buffer.length < 30) return files;

  let pos = 0;
  const maxLen = buffer.length - 4;

  while (pos < maxLen) {
    const sig = buffer.readUInt32LE(pos);
    if (sig === 0x04034b50) {
      // Local file header
      const method = buffer.readUInt16LE(pos + 8);
      const compSize = buffer.readUInt32LE(pos + 18);
      const nameLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);

      const nameStart = pos + 30;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > buffer.length) break;

      const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
      const dataStart = nameEnd + extraLen;
      const dataEnd = dataStart + compSize;

      if (dataEnd <= buffer.length) {
        const compData = buffer.subarray(dataStart, dataEnd);
        let decompressed;
        if (method === 8) {
          try {
            decompressed = zlib.inflateRawSync(compData);
          } catch {
            decompressed = compData;
          }
        } else {
          decompressed = compData;
        }
        files[name] = decompressed;
        pos = dataEnd;
        continue;
      }
    }
    pos++;
  }

  return files;
}

/**
 * Extracts structured text and paragraphs from a .docx file buffer.
 * @param {Buffer} buffer
 * @returns {{ type: 'docx', paragraphs: Array<string>, fullText: string }}
 */
export function extractDocx(buffer) {
  const files = unpackZip(buffer);
  const docXmlBuf = files['word/document.xml'];
  if (!docXmlBuf) {
    // Fallback: search for any document XML
    const altKey = Object.keys(files).find((k) => k.endsWith('document.xml'));
    if (!altKey) {
      throw new Error('Invalid or corrupted .docx archive: missing word/document.xml');
    }
    return parseDocxXml(files[altKey].toString('utf8'));
  }
  return parseDocxXml(docXmlBuf.toString('utf8'));
}

function parseDocxXml(xml) {
  const paragraphs = [];
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const pMatches = xml.match(pRegex) || [];

  for (const p of pMatches) {
    const tMatches = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
    const text = tMatches.map((m) => m[1]).join('').trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }

  return {
    type: 'docx',
    paragraphs,
    fullText: paragraphs.join('\n\n'),
  };
}

/**
 * Extracts structured spreadsheet grid (headers and rows) from a .xlsx file buffer.
 * @param {Buffer} buffer
 * @returns {{ type: 'xlsx', sheetName: string, headers: Array<string>, rows: Array<Array<string>> }}
 */
export function extractXlsx(buffer) {
  const files = unpackZip(buffer);

  // 1. Parse shared strings table if present
  const sharedStrings = [];
  const sstBuf = files['xl/sharedStrings.xml'];
  if (sstBuf) {
    const sstXml = sstBuf.toString('utf8');
    const siMatches = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)];
    for (const si of siMatches) {
      const tMatches = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
      sharedStrings.push(tMatches.map((m) => m[1]).join(''));
    }
  }

  // 2. Parse primary worksheet
  const sheetBuf = files['xl/worksheets/sheet1.xml'] || Object.entries(files).find(([k]) => k.includes('worksheets/sheet'))?.[1];
  if (!sheetBuf) {
    throw new Error('Invalid or corrupted .xlsx archive: missing worksheet XML');
  }

  const sheetXml = sheetBuf.toString('utf8');
  const rowMatches = [...sheetXml.matchAll(/<row[\s>][\s\S]*?<\/row>/g)];
  const grid = [];

  for (const rowMatch of rowMatches) {
    const rowXml = rowMatch[0];
    const cellMatches = [...rowXml.matchAll(/<c(?:\s+[^>]*)?>([\s\S]*?)<\/c>/g)];
    const cells = [];

    for (const cellMatch of cellMatches) {
      const fullTag = cellMatch[0];
      const inner = cellMatch[1];
      const isShared = fullTag.includes('t="s"') || fullTag.includes("t='s'");

      const valMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const rawVal = valMatch ? valMatch[1].trim() : '';

      if (isShared) {
        const sstIdx = parseInt(rawVal, 10);
        cells.push(sharedStrings[sstIdx] !== undefined ? sharedStrings[sstIdx] : rawVal);
      } else {
        cells.push(rawVal);
      }
    }

    if (cells.some((c) => c.length > 0)) {
      grid.push(cells);
    }
  }

  const headers = grid[0] || [];
  const rows = grid.slice(1);

  return {
    type: 'xlsx',
    sheetName: 'Sheet1',
    headers,
    rows,
  };
}

/**
 * Extracts structured presentation slides from a .pptx file buffer.
 * @param {Buffer} buffer
 * @returns {{ type: 'pptx', slides: Array<{ slideNumber: number, title: string, content: Array<string> }> }}
 */
export function extractPptx(buffer) {
  const files = unpackZip(buffer);
  const slideKeys = Object.keys(files)
    .filter((k) => k.startsWith('ppt/slides/slide') && k.endsWith('.xml'))
    .sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
      return numA - numB;
    });

  if (slideKeys.length === 0) {
    throw new Error('Invalid or corrupted .pptx archive: missing slide XML');
  }

  const slides = [];

  slideKeys.forEach((key, idx) => {
    const slideXml = files[key].toString('utf8');
    const textMatches = [...slideXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
    const lines = textMatches.map((m) => m[1].trim()).filter((t) => t.length > 0);

    const title = lines[0] || `Slide ${idx + 1}`;
    const content = lines.slice(1);

    slides.push({
      slideNumber: idx + 1,
      title,
      content,
    });
  });

  return {
    type: 'pptx',
    slides,
  };
}

/**
 * Automatically extracts office document content based on filename extension.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {object}
 */
export function extractOfficeDocument(buffer, filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'docx') {
    return extractDocx(buffer);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return extractXlsx(buffer);
  }
  if (ext === 'pptx' || ext === 'ppt') {
    return extractPptx(buffer);
  }
  throw new Error(`Unsupported document format: ${ext}`);
}

export default {
  unpackZip,
  extractDocx,
  extractXlsx,
  extractPptx,
  extractOfficeDocument,
};
