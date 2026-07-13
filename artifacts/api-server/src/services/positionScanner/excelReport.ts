// ============================================================
// Business Scanner — Excel report generation (Phase 5 / A3c)
//
// Builds the "clean, orderly, professional, real, flawless English Excel
// report" the blueprint asks for: project description, company, person,
// project name, details, contact channels, website/email — one row per
// lead. Same S3 upload pattern content.ts's generate-image route already
// uses (PutObjectCommand via getS3Config()), so this doesn't invent a
// second way of talking to S3.
// ============================================================
import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import ExcelJS from 'exceljs';

import { db } from '../../db/db';
import { positionLeads, positionReports } from '../../db/schema';
import { getS3Config } from '../awsConfig';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger('PositionReport');

export interface GenerateReportOptions {
  /** Only include leads at or above this score. Default 20 — matches the
   * admin UI's own "Relevant only" default, so the report and what the
   * admin actually sees line up by default. */
  minScore?: number;
}

export interface GenerateReportResult {
  reportUrl: string;
  leadCount: number;
}

function contactsToText(contacts: unknown): string {
  if (!contacts || typeof contacts !== 'object') return '';
  const c = contacts as Record<string, string>;
  const parts = [c.email, c.phone, c.formUrl].filter(Boolean);
  return parts.join(' | ');
}

/** Builds the workbook, uploads it to S3, and records the report row.
 * Pulls every 'new' or 'reviewed' lead at/above minScore — 'dismissed'
 * leads are excluded on purpose, since the admin already said those
 * aren't worth the composer's time. */
export async function generateExcelReport(options: GenerateReportOptions = {}): Promise<GenerateReportResult> {
  const minScore = options.minScore ?? 20;

  const leads = await db.query.positionLeads.findMany({
    where: (l, { and, or, eq, gte, ne }) => and(gte(l.score, minScore), ne(l.status, 'dismissed')),
    orderBy: (l, { desc }) => [desc(l.score)],
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ACE Business Scanner';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Positions', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Project Description', key: 'details', width: 46 },
    { header: 'Company', key: 'company', width: 26 },
    { header: 'Person', key: 'person', width: 22 },
    { header: 'Project Name', key: 'project', width: 30 },
    { header: 'Language', key: 'lang', width: 10 },
    { header: 'Relevance Score', key: 'score', width: 14 },
    { header: 'Contact Channels', key: 'contacts', width: 34 },
    { header: 'Website / Source', key: 'url', width: 42 },
    { header: 'Source', key: 'source', width: 14 },
    { header: 'First Seen', key: 'firstSeen', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFD4AF37' } };

  for (const lead of leads) {
    sheet.addRow({
      details: lead.details || '',
      company: lead.company || '',
      person: lead.person || '',
      project: lead.project || '',
      lang: lead.lang || '',
      score: lead.score,
      contacts: contactsToText(lead.contacts),
      url: lead.url,
      source: lead.source,
      firstSeen: lead.firstSeen ? new Date(lead.firstSeen).toLocaleDateString('en-US') : '',
    });
  }

  // Light banding for readability — every other row a hair darker.
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rowNumber % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF161616' } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const s3 = await getS3Config();
  const s3Key = `reports/positions/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.xlsx`;
  await s3.client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: s3Key,
      Body: Buffer.from(buffer),
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  const reportUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${s3Key}`;

  await db.insert(positionReports).values({
    reportUrl,
    leadCount: leads.length,
    periodEnd: new Date(),
  });

  logger.info({ leadCount: leads.length, reportUrl }, 'Excel report generated.');
  return { reportUrl, leadCount: leads.length };
}
