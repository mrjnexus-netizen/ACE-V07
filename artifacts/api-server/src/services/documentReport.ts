// ============================================================
// Document Assistant — PDF report generation, 2026-07-16.
// Upgraded from the original bare bullet-list export into a properly
// formatted, sectioned report matching the professional-document bar
// the rest of this project holds itself to (Business Scanner's Excel
// report, Poster Studio's exports).
// ============================================================
// Matches the exact default-import style the project's original PDF
// generator already used (`import pdfkit from 'pdfkit'`) — kept
// consistent rather than switching to a named `PDFDocument` import, to
// avoid any risk of a typecheck mismatch against this project's pinned
// @types/pdfkit version.
import pdfkit from 'pdfkit';

import type { ChecklistItem } from './documentAnalysis';
import type { TrackMatch } from './documentTrackMatcher';


export interface AnalysisForPdf {
  filename: string;
  createdAt: Date | string;
  summary: string | null;
  parties: { name: string; role: string }[];
  deliverables: string[];
  deadlines: { item: string; date: string; parsedDate?: string | null }[];
  paymentTerms: string[];
  timecodes: string[];
  risks: string[];
  checklist: ChecklistItem[];
  trackMatches?: TrackMatch[];
}

const INK = '#1a1712';
const MUTED = '#6b6455';
const ACCENT = '#a9812f';
const RULE = '#d9cfb8';

const PRIORITY_LABEL: Record<string, string> = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const PRIORITY_COLOR: Record<string, string> = { high: '#b23a2f', medium: '#a9812f', low: '#5c7a5c' };

function sectionHeading(doc: InstanceType<typeof pdfkit>, title: string) {
  doc.moveDown(0.8);
  doc.fillColor(ACCENT).fontSize(12).font('Helvetica-Bold').text(title.toUpperCase(), { characterSpacing: 1.2 });
  const y = doc.y + 2;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(RULE).lineWidth(0.75).stroke();
  doc.moveDown(0.6);
  doc.fillColor(INK).font('Helvetica').fontSize(10.5);
}

function bulletList(doc: InstanceType<typeof pdfkit>, items: string[]) {
  if (items.length === 0) {
    doc.fillColor(MUTED).fontSize(9.5).text('None identified.', { indent: 12 });
    doc.fillColor(INK).fontSize(10.5);
    return;
  }
  items.forEach((item) => {
    doc.text(`•  ${item}`, { indent: 12, lineGap: 3 });
  });
}

export async function generateAnalysisPdf(analysis: AnalysisForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new pdfkit({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(9).text('ACE · DOCUMENT ASSISTANT', { characterSpacing: 2 });
    doc.moveDown(0.3);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('Project Brief Analysis');
    doc.moveDown(0.15);
    const created = typeof analysis.createdAt === 'string' ? new Date(analysis.createdAt) : analysis.createdAt;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9.5)
      .text(`${analysis.filename}  ·  Analyzed ${created.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);

    doc.moveDown(0.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(ACCENT).lineWidth(1.2).stroke();

    // Summary
    if (analysis.summary) {
      sectionHeading(doc, 'Summary');
      doc.text(analysis.summary, { lineGap: 3 });
    }

    // Referenced Tracks (Track Intelligence, 2026-07-16)
    if (analysis.trackMatches && analysis.trackMatches.length > 0) {
      sectionHeading(doc, 'Referenced Tracks');
      analysis.trackMatches.forEach((t) => {
        const facts = [
          t.genre ? `Genre: ${t.genre}` : null,
          t.bpm ? `BPM: ${t.bpm}` : null,
          t.mood ? `Mood: ${t.mood}` : null,
          t.keySignature ? `Key: ${t.keySignature}` : null,
        ]
          .filter(Boolean)
          .join('  ·  ');
        doc.font('Helvetica-Bold').text(`•  ${t.title}`, { indent: 12, lineGap: 2, continued: false });
        doc.font('Helvetica');
        if (facts) doc.fillColor(MUTED).fontSize(9).text(facts, { indent: 24, lineGap: 2 });
        if (t.fitAssessment) doc.fillColor(ACCENT).fontSize(9).text(t.fitAssessment, { indent: 24, lineGap: 2 });
        doc.fillColor(INK).fontSize(10.5);
        doc.moveDown(0.3);
      });
    }

    // Parties
    sectionHeading(doc, 'Parties');
    if (analysis.parties.length === 0) {
      doc.fillColor(MUTED).fontSize(9.5).text('None identified.', { indent: 12 });
      doc.fillColor(INK).fontSize(10.5);
    } else {
      analysis.parties.forEach((p) => doc.text(`•  ${p.name} — ${p.role}`, { indent: 12, lineGap: 3 }));
    }

    // Deliverables
    sectionHeading(doc, 'Deliverables');
    bulletList(doc, analysis.deliverables);

    // Deadlines
    sectionHeading(doc, 'Deadlines');
    if (analysis.deadlines.length === 0) {
      doc.fillColor(MUTED).fontSize(9.5).text('None identified.', { indent: 12 });
      doc.fillColor(INK).fontSize(10.5);
    } else {
      // Entries with a confidently-resolved calendar date sort first
      // (soonest first); entries the AI couldn't confidently resolve
      // keep their original order after them — never fabricating a
      // ranking for a date that isn't actually known.
      const sorted = [...analysis.deadlines].sort((a, b) => {
        if (a.parsedDate && b.parsedDate) return a.parsedDate.localeCompare(b.parsedDate);
        if (a.parsedDate && !b.parsedDate) return -1;
        if (!a.parsedDate && b.parsedDate) return 1;
        return 0;
      });
      sorted.forEach((d) => doc.text(`•  ${d.item}  —  ${d.date}`, { indent: 12, lineGap: 3 }));
    }

    // Payment terms
    sectionHeading(doc, 'Payment Terms');
    bulletList(doc, analysis.paymentTerms);

    // Timecodes
    if (analysis.timecodes.length > 0) {
      sectionHeading(doc, 'Timecodes');
      bulletList(doc, analysis.timecodes);
    }

    // Risks / notes
    if (analysis.risks.length > 0) {
      sectionHeading(doc, 'Risks & Notes');
      bulletList(doc, analysis.risks);
    }

    // Checklist
    sectionHeading(doc, 'Action Checklist');
    if (analysis.checklist.length === 0) {
      doc.fillColor(MUTED).fontSize(9.5).text('No checklist items.', { indent: 12 });
    } else {
      analysis.checklist.forEach((item) => {
        const box = item.done ? '☑' : '☐';
        const color = PRIORITY_COLOR[item.priority] ?? MUTED;
        const startY = doc.y;
        doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(`${box}  ${item.text}`, { indent: 12, lineGap: 2, continued: false });
        doc
          .fillColor(color)
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(`[${PRIORITY_LABEL[item.priority] ?? 'MEDIUM'}] ${item.category}`, doc.page.margins.left + 12, startY - 1, {
            width: 0,
          });
        doc.fillColor(INK).font('Helvetica').fontSize(10.5);
        doc.moveDown(0.15);
      });
    }

    // Footer
    doc.fillColor(MUTED).fontSize(7.5).text('Generated automatically by the ACE Document Assistant. Verify all extracted details before relying on them.', doc.page.margins.left, doc.page.height - 40, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center',
    });

    doc.end();
  });
}
