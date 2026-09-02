/**
 * Test Suite 27: Sandboxed Office Document Extraction (.docx, .xlsx, .pptx)
 */

import assert from 'assert';
import { createZipArchive } from '../../src/services/backupService.js';
import {
  unpackZip,
  extractDocx,
  extractXlsx,
  extractPptx,
  extractOfficeDocument,
} from '../../src/services/officeDocService.js';

console.log('[TEST] Running Suite 27: Sandboxed Office Document Extraction...');

// Test 1: Word .docx Document Extraction
const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Quarterly Financial Overview</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Net profit increased by </w:t></w:r>
      <w:r><w:t>24.5% year over year.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>All enterprise clients were onboarded successfully.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

const docxBuffer = createZipArchive([{ name: 'word/document.xml', data: docxXml }]);
const docxResult = extractDocx(docxBuffer);

assert.strictEqual(docxResult.type, 'docx', 'Type must be docx');
assert.strictEqual(docxResult.paragraphs.length, 3, 'Must extract 3 paragraphs');
assert.strictEqual(docxResult.paragraphs[0], 'Quarterly Financial Overview');
assert.strictEqual(docxResult.paragraphs[1], 'Net profit increased by 24.5% year over year.');
assert.ok(docxResult.fullText.includes('Quarterly Financial Overview'));

// Test 2: Excel .xlsx Spreadsheet Extraction
const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Department</t></si>
  <si><t>Budget</t></si>
  <si><t>Engineering</t></si>
</sst>`;

const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2"><v>150000</v></c>
    </row>
  </sheetData>
</worksheet>`;

const xlsxBuffer = createZipArchive([
  { name: 'xl/sharedStrings.xml', data: sstXml },
  { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
]);
const xlsxResult = extractXlsx(xlsxBuffer);

assert.strictEqual(xlsxResult.type, 'xlsx', 'Type must be xlsx');
assert.strictEqual(xlsxResult.headers.length, 2, 'Must extract 2 headers');
assert.strictEqual(xlsxResult.headers[0], 'Department');
assert.strictEqual(xlsxResult.headers[1], 'Budget');
assert.strictEqual(xlsxResult.rows.length, 1, 'Must extract 1 data row');
assert.strictEqual(xlsxResult.rows[0][0], 'Engineering');
assert.strictEqual(xlsxResult.rows[0][1], '150000');

// Test 3: PowerPoint .pptx Presentation Extraction
const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>WoxMail Architecture</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:txBody><a:p><a:r><a:t>Sovereign zero-knowledge privacy</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree>
</p:sld>`;

const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Deployment Metrics</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:txBody><a:p><a:r><a:t>Zero data leaks recorded</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree>
</p:sld>`;

const pptxBuffer = createZipArchive([
  { name: 'ppt/slides/slide1.xml', data: slide1Xml },
  { name: 'ppt/slides/slide2.xml', data: slide2Xml },
]);
const pptxResult = extractPptx(pptxBuffer);

assert.strictEqual(pptxResult.type, 'pptx', 'Type must be pptx');
assert.strictEqual(pptxResult.slides.length, 2, 'Must extract 2 slides');
assert.strictEqual(pptxResult.slides[0].title, 'WoxMail Architecture');
assert.strictEqual(pptxResult.slides[0].content[0], 'Sovereign zero-knowledge privacy');
assert.strictEqual(pptxResult.slides[1].title, 'Deployment Metrics');

// Test 4: Dynamic Auto-Extraction by Filename
const autoDocx = extractOfficeDocument(docxBuffer, 'strategy.docx');
assert.strictEqual(autoDocx.type, 'docx');

const autoXlsx = extractOfficeDocument(xlsxBuffer, 'budget.xlsx');
assert.strictEqual(autoXlsx.type, 'xlsx');

const autoPptx = extractOfficeDocument(pptxBuffer, 'pitch.pptx');
assert.strictEqual(autoPptx.type, 'pptx');

console.log('[PASS] Suite 27: All Sandboxed Office Document Extraction tests passed (4/4)');
