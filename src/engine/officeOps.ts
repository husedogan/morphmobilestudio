import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {PickedFile} from '../data/models';
import {canvasToBlob} from './imaging';

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
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractDocumentText(file: PickedFile): Promise<string> {
  const ext = file.ext.toLowerCase();

  if (ext === 'docx') {
    const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
    const xmlEntry = zip.file('word/document.xml');
    if (!xmlEntry) throw new Error('Geçersiz DOCX dosyası.');
    const xml = await xmlEntry.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
    const lines = paragraphs.map((p) => {
      const texts = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '');
      return texts.join('');
    });
    return lines.join('\n').trim();
  }

  if (ext === 'odt') {
    const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
    const xmlEntry = zip.file('content.xml');
    if (!xmlEntry) throw new Error('Geçersiz ODT dosyası.');
    const xml = await xmlEntry.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = Array.from(doc.getElementsByTagName('text:p'));
    return paragraphs.map((p) => p.textContent ?? '').join('\n').trim();
  }

  if (ext === 'xlsx' || ext === 'pptx' || ext === 'doc' || ext === 'xls' || ext === 'ppt') {
    if (ext === 'xlsx') {
      const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
      const sharedStrings: string[] = [];
      const shared = zip.file('xl/sharedStrings.xml');
      if (shared) {
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

      const sheetBlocks: string[] = [];
      for (const sp of sheetPaths) {
        const xml = await zip.files[sp].async('text');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const rows = Array.from(doc.getElementsByTagName('row'));
        const rowLines: string[] = [];
        for (const row of rows) {
          const cells = Array.from(row.getElementsByTagName('c'));
          const vals: string[] = [];
          for (const cell of cells) {
            const cellType = cell.getAttribute('t');
            if (cellType === 'inlineStr') {
              const inlineTxt = Array.from(cell.getElementsByTagName('t'))
                .map((t) => t.textContent ?? '')
                .join('');
              if (inlineTxt.trim()) vals.push(inlineTxt.trim());
            } else {
              const vNode = cell.getElementsByTagName('v')[0];
              const rawVal = vNode?.textContent?.trim() ?? '';
              if (!rawVal) continue;
              if (cellType === 's') {
                const idx = parseInt(rawVal, 10);
                const resolved = Number.isFinite(idx) ? sharedStrings[idx] ?? rawVal : rawVal;
                if (resolved.trim()) vals.push(resolved.trim());
              } else {
                vals.push(rawVal);
              }
            }
          }
          if (vals.length > 0) {
            rowLines.push(vals.join(' \t '));
          }
        }
        if (rowLines.length > 0) {
          sheetBlocks.push(rowLines.join('\n'));
        }
      }
      if (sheetBlocks.length > 0) return sheetBlocks.join('\n\n');
      if (sharedStrings.length > 0) return sharedStrings.filter(Boolean).join(' · ');
    }
    if (ext === 'pptx') {
      const zip = await JSZip.loadAsync(await file.file.arrayBuffer());
      const slides = Object.keys(zip.files)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
      const blocks: string[] = [];
      for (const s of slides) {
        const xml = await zip.files[s].async('text');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const txt = Array.from(doc.getElementsByTagName('a:t'))
          .map((t) => t.textContent ?? '')
          .join(' ');
        if (txt.trim()) blocks.push(txt.trim());
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

export async function pdfToDocxBlob(
  file: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
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

  const bodyXml = pageParagraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`)
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

  onProgress?.(0.95);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
