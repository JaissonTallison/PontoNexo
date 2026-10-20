import PDFDocument from 'pdfkit';
import { formatCpf, GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type ReceiptView } from '@pontonexo/shared';

/** PDF A4 do comprovante, gerado no servidor (mesmo conteúdo do documento formal da tela). */
export function receiptPdf(r: ReceiptView): Promise<Buffer> {
  const p = r.payload;
  const [date, time] = p.localTime.split(' ');
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Comprovante de ponto NSR ${p.nsr}`, Author: 'PontoNexo', Creator: 'PontoNexo' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 96;
  const navy = '#000F4B';
  const gray = '#52606D';

  doc.fillColor(navy).font('Helvetica-Bold').fontSize(15).text('COMPROVANTE DE REGISTRO DE PONTO', { continued: false });
  doc.font('Helvetica').fontSize(9).fillColor(gray).text(`do Trabalhador · nº ${String(p.nsr).padStart(9, '0')}`);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(navy).text('PontoNexo', 48, 48, { width: W, align: 'right' });
  doc.moveTo(48, 92).lineTo(48 + W, 92).lineWidth(1.5).strokeColor(navy).stroke();

  // resumo em quatro caixas
  const boxes: Array<[string, string]> = [
    ['MARCAÇÃO', PUNCH_TYPE_LABEL[p.punchType]],
    ['DATA', date ?? ''],
    ['HORA', time ?? ''],
    ['NSR', String(p.nsr).padStart(9, '0')],
  ];
  const bw = W / 4;
  boxes.forEach(([k, v], i) => {
    const x = 48 + i * bw;
    doc.roundedRect(x + (i ? 4 : 0), 104, bw - (i ? 4 : 0), 46, 6).lineWidth(0.8).strokeColor('#BCCCDC').stroke();
    doc.font('Helvetica-Bold').fontSize(7).fillColor(gray).text(k, x + 12, 112);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F1C2A').text(v, x + 12, 124, { width: bw - 20 });
  });

  let y = 168;
  const party = (label: string, name: string, cpf: string, x: number) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(gray).text(label, x, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F1C2A').text(name, x, y + 11, { width: W / 2 - 10 });
    doc.font('Helvetica').fontSize(9).text(`CPF ${formatCpf(cpf)}`, x, y + 25);
  };
  party('EMPREGADOR', p.employer.name, p.employer.document, 48);
  party('TRABALHADOR', p.employee.name, p.employee.cpf, 48 + W / 2);

  y = 218;
  doc.font('Helvetica-Bold').fontSize(7).fillColor(gray).text('DETALHES DA MARCAÇÃO', 48, y);
  y += 14;
  const rows: Array<[string, string]> = [
    ['Local', p.location ?? 'Outro local'],
    ['Localização no momento', GEO_STATUS_LABEL[p.geoStatus]],
    ['Origem', p.origin === 'online' ? 'Online, no momento da marcação' : 'Enviada após falta de conexão (hora de recebimento)'],
    ['Fuso horário', p.timezone],
    ['Data e hora UTC', p.serverTimeUtc],
  ];
  for (const [k, v] of rows) {
    doc.font('Helvetica').fontSize(9.5).fillColor(gray).text(k, 48, y);
    doc.font('Helvetica-Bold').fillColor('#0F1C2A').text(v, 48, y, { width: W, align: 'right' });
    y += 18;
    doc.moveTo(48, y - 4).lineTo(48 + W, y - 4).lineWidth(0.5).strokeColor('#D9E2EC').stroke();
  }

  y += 10;
  doc.roundedRect(48, y, W, 96, 6).lineWidth(0.8).strokeColor('#BCCCDC').stroke();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(gray).text('AUTENTICIDADE', 60, y + 10);
  doc.font('Helvetica').fontSize(9.5).fillColor('#0F1C2A').text('Código de verificação ', 60, y + 24, { continued: true }).font('Helvetica-Bold').fontSize(11).text(r.code, { continued: true }).font('Helvetica').fontSize(9.5).text(' — confira em /verificar');
  doc.font('Courier').fontSize(6.5).fillColor(gray);
  doc.text(`Hash do registro: ${p.punchHash}`, 60, y + 44, { width: W - 24 });
  doc.text(`Hash do comprovante (SHA-256): ${r.hash}`, { width: W - 24 });
  doc.text(`Assinatura ${r.algorithm} (chave ${r.keyId}): ${r.signature}`, { width: W - 24 });

  doc.font('Helvetica').fontSize(7).fillColor(gray).text(`${p.system.name} ${p.system.version} · ${p.system.modality}. Assinatura eletrônica do próprio sistema; não é certificado ICP-Brasil.`, 48, y + 112, { width: W });
  doc.end();
  return done;
}
