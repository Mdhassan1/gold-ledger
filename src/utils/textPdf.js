function pdfEscape(value) {
  return String(value)
    .replace(/[^\x09\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function byteLength(value) {
  return value.length;
}

export function buildTextPdf(lines) {
  const source = lines.length ? lines : ['GoldLedger'];
  const normalized = source.map((line) => pdfEscape(String(line).slice(0, 100)));
  const groups = [];
  for (let index = 0; index < normalized.length; index += 48) {
    groups.push(normalized.slice(index, index + 48));
  }
  const fontObjectId = 3 + groups.length * 2;
  const objects = new Map();
  const kids = [];
  groups.forEach((group, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const commands = ['BT', '/F1 9 Tf', '36 800 Td', '14 TL'];
    group.forEach((line) => {
      commands.push(`(${line}) Tj`);
      commands.push('T*');
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects.set(contentId, `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> >>`,
    );
  });
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Count ${groups.length} /Kids [${kids.join(' ')}] >>`);
  objects.set(fontObjectId, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id <= fontObjectId; id += 1) {
    offsets[id] = byteLength(pdf);
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xref = byteLength(pdf);
  pdf += `xref\n0 ${fontObjectId + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id <= fontObjectId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
