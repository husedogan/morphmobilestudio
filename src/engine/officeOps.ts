import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {PickedFile} from '../data/models';
import {canvasToBlob} from './imaging';
import {ensurePdfWorker} from './pdfOps';

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCsvRows(raw: string, delimiter?: string): string[][] {
  const clean = raw.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const sep =
    delimiter ||
    (firstLine.includes('\t') && !firstLine.includes(',')
      ? '\t'
      : firstLine.split(';').length > firstLine.split(',').length
        ? ';'
        : ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim().length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

function serializeCsvRows(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const val = cell ?? '';
          if (/[",\r\n]/.test(val)) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    )
    .join('\r\n');
}

async function extractXlsxRows(file: Blob): Promise<string[][]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sharedStrings: string[] = [];
  const shared = zip.file('xl/sharedStrings.xml');
  if (shared && typeof DOMParser !== 'undefined') {
    const xml = await shared.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const siNodes = Array.from(doc.getElementsByTagName('si'));
    for (const si of siNodes) {
      const parts = Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '');
      sharedStrings.push(parts.join(''));
    }
  }

  const sheetPaths = Object.keys(zip.files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

  const allRows: string[][] = [];
  for (const sp of sheetPaths) {
    const xml = await zip.files[sp].async('text');
    if (typeof DOMParser === 'undefined') continue;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const rows = Array.from(doc.getElementsByTagName('row'));
    for (const row of rows) {
      const cells = Array.from(row.getElementsByTagName('c'));
      const vals: string[] = [];
      for (const cell of cells) {
        const cellType = cell.getAttribute('t');
        if (cellType === 'inlineStr') {
          const inlineTxt = Array.from(cell.getElementsByTagName('t'))
            .map((t) => t.textContent ?? '')
            .join('');
          vals.push(inlineTxt.trim());
        } else {
          const vNode = cell.getElementsByTagName('v')[0];
          const rawVal = vNode?.textContent?.trim() ?? '';
          if (!rawVal) {
            vals.push('');
            continue;
          }
          if (cellType === 's') {
            const idx = parseInt(rawVal, 10);
            vals.push(Number.isFinite(idx) ? (sharedStrings[idx] ?? rawVal).trim() : rawVal);
          } else {
            vals.push(rawVal);
          }
        }
      }
      if (vals.some((v) => v.length > 0)) {
        allRows.push(vals);
      }
    }
  }
  return allRows;
}

export async function extractStructuredRows(file: PickedFile): Promise<string[][]> {
  const ext = file.ext.toLowerCase();
  if (ext === 'xlsx') {
    const rows = await extractXlsxRows(file.file);
    if (rows.length > 0) return rows;
  }
  const raw = await file.file.text();
  if (ext === 'json') {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).data)
        ? ((parsed as Record<string, unknown>).data as unknown[])
        : [parsed];
    if (arr.length === 0) return [];
    if (Array.isArray(arr[0])) {
      return arr.map((r) => (Array.isArray(r) ? r.map((v) => String(v ?? '')) : [String(r ?? '')]));
    }
    if (arr[0] && typeof arr[0] === 'object') {
      const keys = Array.from(
        new Set(arr.flatMap((item) => (item && typeof item === 'object' ? Object.keys(item as object) : [])))
      );
      const header = keys;
      const body = arr.map((item) => {
        const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return keys.map((k) => {
          const v = rec[k];
          if (v === null || v === undefined) return '';
          return typeof v === 'object' ? JSON.stringify(v) : String(v);
        });
      });
      return [header, ...body];
    }
  }
  return parseCsvRows(raw, ext === 'tsv' ? '\t' : undefined);
}

export async function extractDocumentText(file: PickedFile): Promise<string> {
  const ext = file.ext.toLowerCase();

  if (ext === 'docx') {
    const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
    const xmlEntry = zip.file('word/document.xml');
    if (!xmlEntry) throw new Error('Geçersiz DOCX dosyası.');
    const xml = await xmlEntry.async('text');
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
      const lines = paragraphs.map((p) => {
        const texts = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '');
        return texts.join('');
      });
      return lines.join('\n').trim();
    }
    return xml.replace(/<[^>]+>/g, ' ').trim();
  }

  if (ext === 'odt') {
    const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
    const xmlEntry = zip.file('content.xml');
    if (!xmlEntry) throw new Error('Geçersiz ODT dosyası.');
    const xml = await xmlEntry.async('text');
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const paragraphs = Array.from(doc.getElementsByTagName('text:p'));
      return paragraphs.map((p) => p.textContent ?? '').join('\n').trim();
    }
    return xml.replace(/<[^>]+>/g, ' ').trim();
  }

  if (ext === 'xlsx' || ext === 'pptx' || ext === 'doc' || ext === 'xls' || ext === 'ppt') {
    if (ext === 'xlsx') {
      const rows = await extractXlsxRows(file.file);
      if (rows.length > 0) {
        return rows.map((r) => r.filter(Boolean).join(' \t ')).join('\n');
      }
    }
    if (ext === 'pptx') {
      const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
      const slides = Object.keys(zip.files)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
      const blocks: string[] = [];
      for (const s of slides) {
        const xml = await zip.files[s].async('text');
        if (typeof DOMParser !== 'undefined') {
          const doc = new DOMParser().parseFromString(xml, 'application/xml');
          const txt = Array.from(doc.getElementsByTagName('a:t'))
            .map((t) => t.textContent ?? '')
            .join(' ');
          if (txt.trim()) blocks.push(txt.trim());
        }
      }
      if (blocks.length > 0) return blocks.join('\n\n');
    }
  }

  const raw = await file.file.text();
  if (ext === 'rtf') return stripRtf(raw);
  if (ext === 'html' || ext === 'htm') return stripHtml(raw);
  return raw;
}

export async function documentToTextBlob(file: PickedFile): Promise<Blob> {
  const text = await extractDocumentText(file);
  return new Blob([text], {type: 'text/plain;charset=utf-8'});
}

function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function documentToPdfBlob(
  file: PickedFile,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const text = await extractDocumentText(file);
  const rawParagraphs = (text || '(Boş belge)').split(/\r?\n/);

  const pageW = 1240;
  const pageH = 1754;
  const marginX = 96;
  const marginY = 104;
  const lineH = 38;
  const maxTextW = pageW - marginX * 2;

  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) throw new Error('Canvas unavailable');
  mCtx.font = '400 24px "Plus Jakarta Sans", Arial, sans-serif';

  const wrappedLines: string[] = [];
  for (const para of rawParagraphs) {
    wrappedLines.push(...wrapParagraph(mCtx, para, maxTextW));
  }

  const linesPerPage = Math.max(10, Math.floor((pageH - marginY * 2) / lineH));
  const totalPages = Math.max(1, Math.ceil(wrappedLines.length / linesPerPage));
  const doc = await PDFDocument.create();

  for (let p = 0; p < totalPages; p++) {
    onProgress?.((p / totalPages) * 0.85);
    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageW, pageH);
    ctx.fillStyle = '#18202C';
    ctx.font = '400 24px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.textBaseline = 'top';

    const slice = wrappedLines.slice(p * linesPerPage, (p + 1) * linesPerPage);
    slice.forEach((line, idx) => {
      ctx.fillText(line, marginX, marginY + idx * lineH);
    });

    ctx.fillStyle = '#6E7B8F';
    ctx.font = '500 18px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText(`${p + 1} / ${totalPages}`, pageW - marginX - 60, pageH - 58);

    const jpgBlob = await canvasToBlob(canvas, 'jpg', 90);
    const embedded = await doc.embedJpg(await jpgBlob.arrayBuffer());
    const page = doc.addPage([595.28, 841.89]);
    page.drawImage(embedded, {x: 0, y: 0, width: 595.28, height: 841.89});
  }

  onProgress?.(0.95);
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function packParagraphsIntoDocxBlob(paragraphs: string[]): Promise<Blob> {
  const safeList = paragraphs.length > 0 ? paragraphs : [''];
  const bodyXml = safeList
    .map((rawLine) => {
      const trimmed = rawLine.trim();
      if (/^#{1,3}\s+/.test(trimmed)) {
        const cleanTitle = trimmed.replace(/^#{1,3}\s+/, '');
        return `<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(cleanTitle)}</w:t></w:r></w:p>`;
      }
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(rawLine)}</w:t></w:r></w:p>`;
    })
    .join('');

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${bodyXml}<w:sectPr/></w:body></w:document>`;

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const relsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function documentToDocxBlob(
  file: PickedFile,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  onProgress?.(0.3);
  const text = await extractDocumentText(file);
  const lines = (text || '').split(/\r?\n/);
  onProgress?.(0.8);
  return packParagraphsIntoDocxBlob(lines);
}

function buildHtmlTablePage(title: string, rows: string[][]): string {
  const header = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const thHtml = header.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const tbodyHtml = bodyRows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('\n');

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem auto; max-width: 1120px; padding: 0 1.25rem; background: #0f172a; color: #e2e8f0; }
    h1 { font-size: 1.4rem; margin-bottom: 1rem; }
    .wrap { overflow-x: auto; border: 1px solid #334155; border-radius: 12px; background: #1e293b; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
    th, td { padding: 0.65rem 0.9rem; border-bottom: 1px solid #334155; text-align: left; }
    th { background: #0f172a; font-weight: 700; color: #f8fafc; }
    @media (prefers-color-scheme: light) {
      body { background: #f8fafc; color: #0f172a; }
      .wrap { background: #ffffff; border-color: #cbd5e1; }
      th, td { border-color: #e2e8f0; }
      th { background: #f1f5f9; color: #0f172a; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="wrap">
    <table>
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${tbodyHtml}</tbody>
    </table>
  </div>
</body>
</html>`;
}

export async function documentToHtmlBlob(file: PickedFile): Promise<Blob> {
  const ext = file.ext.toLowerCase();
  if (['csv', 'tsv', 'xlsx', 'json'].includes(ext)) {
    const rows = await extractStructuredRows(file);
    if (rows.length > 0) {
      return new Blob([buildHtmlTablePage(file.baseName, rows)], {type: 'text/html;charset=utf-8'});
    }
  }

  const text = await extractDocumentText(file);
  const lines = text.split(/\r?\n/);
  const htmlBlocks: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('### ')) {
      htmlBlocks.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      htmlBlocks.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      htmlBlocks.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else if (/^[-*]\s+/.test(trimmed)) {
      htmlBlocks.push(`<p>• ${escapeHtml(trimmed.replace(/^[-*]\s+/, ''))}</p>`);
    } else {
      htmlBlocks.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  const docHtml = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(file.baseName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 780px; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.7; background: #0f172a; color: #e2e8f0; }
    h1, h2, h3 { color: #f8fafc; line-height: 1.3; margin-top: 1.6rem; }
    p { margin: 0.65rem 0; white-space: pre-wrap; }
    @media (prefers-color-scheme: light) {
      body { background: #ffffff; color: #0f172a; }
      h1, h2, h3 { color: #0f172a; }
    }
  </style>
</head>
<body>
  ${htmlBlocks.join('\n  ') || `<p>${escapeHtml(file.baseName)}</p>`}
</body>
</html>`;
  return new Blob([docHtml], {type: 'text/html;charset=utf-8'});
}

export async function convertTableDataBlob(
  file: PickedFile,
  targetFormat: 'csv' | 'json' | 'html'
): Promise<Blob> {
  const rows = await extractStructuredRows(file);
  if (rows.length === 0) {
    throw new Error('Tablo verisi bulunamadı. CSV, XLSX veya JSON dosyası seçin.');
  }

  if (targetFormat === 'csv') {
    const csv = '\uFEFF' + serializeCsvRows(rows);
    return new Blob([csv], {type: 'text/csv;charset=utf-8'});
  }

  if (targetFormat === 'html') {
    return new Blob([buildHtmlTablePage(file.baseName, rows)], {type: 'text/html;charset=utf-8'});
  }

  // JSON: use row[0] as keys if 2+ rows exist
  if (rows.length >= 2) {
    const headers = rows[0].map((h, idx) => h.trim() || `col_${idx + 1}`);
    const records = rows.slice(1).map((r) => {
      const obj: Record<string, string | number | boolean | null> = {};
      headers.forEach((key, idx) => {
        const raw = (r[idx] ?? '').trim();
        if (raw === '') {
          obj[key] = null;
        } else if (raw === 'true' || raw === 'false') {
          obj[key] = raw === 'true';
        } else if (/^-?\d+(\.\d+)?$/.test(raw) && raw.length < 15) {
          obj[key] = Number(raw);
        } else {
          obj[key] = r[idx] ?? '';
        }
      });
      return obj;
    });
    return new Blob([JSON.stringify(records, null, 2)], {type: 'application/json;charset=utf-8'});
  }

  return new Blob([JSON.stringify(rows, null, 2)], {type: 'application/json;charset=utf-8'});
}

export async function pdfToDocxBlob(
  file: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  await ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({data});
  const pdf = await loadingTask.promise;
  const pageParagraphs: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.((pageNum - 1) / pdf.numPages);
      const page = await pdf.getPage(pageNum);
      const tc = await page.getTextContent();
      const strings = tc.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter((s) => s.trim().length > 0);
      if (strings.length > 0) {
        pageParagraphs.push(strings.join(' '));
      }
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  if (pageParagraphs.length === 0) {
    pageParagraphs.push('(PDF metin katmanı içermiyor veya görsel tabanlı.)');
  }

  onProgress?.(0.95);
  return packParagraphsIntoDocxBlob(pageParagraphs);
}
