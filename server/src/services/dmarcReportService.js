/**
 * @fileoverview DMARC RUA Aggregate Report Analyzer Service.
 * Parses standard RFC 7489 DMARC XML aggregate feedback reports, stores them in memory/database,
 * and produces aggregated deliverability compliance metrics (SPF/DKIM pass rates, IP failure breakdown).
 */

import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:dmarc-service' });

// In-memory ring buffer for storing parsed DMARC reports
const MAX_IN_MEMORY_REPORTS = 500;
const inMemoryReports = [];

/**
 * Extracts inner text content of an XML tag.
 * @param {string} xml
 * @param {string} tag
 * @returns {string}
 */
function extractTag(xml, tag) {
  if (!xml) return '';
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

/**
 * Parses standard DMARC aggregate XML format into structured report metrics.
 * @param {string|Object} input XML string or JSON object representation
 * @returns {{
 *   orgName: string,
 *   reportId: string,
 *   domain: string,
 *   dateRange: { begin: number|string|null, end: number|string|null },
 *   totalMessages: number,
 *   passCount: number,
 *   failCount: number,
 *   records: Array<Object>
 * }}
 */
export function parseDmarcAggregateReport(input) {
  if (!input) {
    throw new Error('DMARC report input cannot be empty');
  }

  // Handle parsed JSON input if provided directly
  if (typeof input === 'object' && input !== null) {
    if (Array.isArray(input.records) && input.domain) {
      return {
        orgName: input.orgName || 'Unknown',
        reportId: input.reportId || `report-${Date.now()}`,
        domain: input.domain,
        dateRange: input.dateRange || { begin: null, end: null },
        totalMessages: input.totalMessages || input.records.reduce((acc, r) => acc + (r.count || 1), 0),
        passCount: input.passCount || 0,
        failCount: input.failCount || 0,
        records: input.records,
        createdAt: new Date().toISOString(),
      };
    }
  }

  let xmlString = String(input).trim();

  // Handle case where JSON string was passed containing XML or object
  if (xmlString.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(xmlString);
      if (parsedJson.xml || parsedJson.rawXml || parsedJson.content) {
        xmlString = parsedJson.xml || parsedJson.rawXml || parsedJson.content;
      } else if (parsedJson.records) {
        return parseDmarcAggregateReport(parsedJson);
      }
    } catch {
      // Continue treating as raw string
    }
  }

  // Metadata extraction
  const reportMetadataXml = extractTag(xmlString, 'report_metadata');
  const orgName = extractTag(reportMetadataXml || xmlString, 'org_name') || 'Unknown Org';
  const reportId = extractTag(reportMetadataXml || xmlString, 'report_id') || `dmarc-${Date.now()}`;

  const dateRangeXml = extractTag(reportMetadataXml || xmlString, 'date_range');
  const beginRaw = extractTag(dateRangeXml || xmlString, 'begin');
  const endRaw = extractTag(dateRangeXml || xmlString, 'end');
  const begin = beginRaw ? parseInt(beginRaw, 10) : null;
  const end = endRaw ? parseInt(endRaw, 10) : null;

  // Policy published extraction
  const policyPublishedXml = extractTag(xmlString, 'policy_published');
  let domain = extractTag(policyPublishedXml || xmlString, 'domain');

  // Record extraction
  const recordBlocks = xmlString.match(/<record[\s\S]*?<\/record>/gi) || [];
  const records = [];

  let totalMessages = 0;
  let passCount = 0;
  let failCount = 0;

  for (const block of recordBlocks) {
    const rowXml = extractTag(block, 'row');
    const sourceIp = extractTag(rowXml || block, 'source_ip') || '0.0.0.0';
    const count = parseInt(extractTag(rowXml || block, 'count'), 10) || 1;

    const policyEvaluatedXml = extractTag(rowXml || block, 'policy_evaluated');
    const disposition = (extractTag(policyEvaluatedXml, 'disposition') || 'none').toLowerCase();
    const dkim = (extractTag(policyEvaluatedXml, 'dkim') || 'fail').toLowerCase();
    const spf = (extractTag(policyEvaluatedXml, 'spf') || 'fail').toLowerCase();

    const identifiersXml = extractTag(block, 'identifiers');
    const headerFrom = extractTag(identifiersXml || block, 'header_from') || domain || '';

    if (!domain && headerFrom) {
      domain = headerFrom;
    }

    // Determine pass vs fail status
    // A record passes DMARC if both SPF and DKIM pass or if aligned disposition is 'none' with valid auth
    const isPass = (dkim === 'pass' && spf === 'pass') || (disposition === 'none' && (dkim === 'pass' || spf === 'pass'));

    totalMessages += count;
    if (isPass) {
      passCount += count;
    } else {
      failCount += count;
    }

    records.push({
      sourceIp,
      count,
      disposition,
      dkim,
      spf,
      headerFrom,
      isPass,
    });
  }

  // If no records were present in the XML, handle total count
  if (records.length === 0) {
    totalMessages = 0;
    passCount = 0;
    failCount = 0;
  }

  return {
    orgName,
    reportId,
    domain: domain || 'unknown',
    dateRange: { begin, end },
    totalMessages,
    passCount,
    failCount,
    records,
    createdAt: new Date().toISOString(),
  };
}

let dmarcTableChecked = false;
let dmarcTableExists = false;

async function checkDmarcTable() {
  if (dmarcTableChecked) return dmarcTableExists;
  try {
    const res = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'dmarc_reports' LIMIT 1`
    );
    dmarcTableExists = (res?.rows?.length > 0);
  } catch {
    dmarcTableExists = false;
  }
  dmarcTableChecked = true;
  return dmarcTableExists;
}

/**
 * Stores a parsed DMARC report in the in-memory ring buffer and optionally PostgreSQL.
 * @param {Object} reportData
 * @returns {Promise<Object>} Stored report data
 */
export async function storeDmarcReport(reportData) {
  if (!reportData || !reportData.reportId) {
    throw new Error('Invalid report data for storage');
  }

  // Deduplicate and store in ring buffer (newest first)
  const existingIndex = inMemoryReports.findIndex((r) => r.reportId === reportData.reportId);
  if (existingIndex !== -1) {
    inMemoryReports[existingIndex] = reportData;
  } else {
    inMemoryReports.unshift(reportData);
    if (inMemoryReports.length > MAX_IN_MEMORY_REPORTS) {
      inMemoryReports.pop();
    }
  }

  // Attempt database storage if dmarc_reports table exists
  if (await checkDmarcTable()) {
    try {
      const beginDate = reportData.dateRange?.begin ? new Date(reportData.dateRange.begin * 1000) : null;
      const endDate = reportData.dateRange?.end ? new Date(reportData.dateRange.end * 1000) : null;

      await query(
        `INSERT INTO dmarc_reports (report_id, org_name, domain, begin_date, end_date, total_messages, pass_count, fail_count, raw_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (report_id) DO UPDATE SET
           total_messages = EXCLUDED.total_messages,
           pass_count = EXCLUDED.pass_count,
           fail_count = EXCLUDED.fail_count,
           raw_data = EXCLUDED.raw_data`,
        [
          reportData.reportId,
          reportData.orgName,
          reportData.domain,
          beginDate,
          endDate,
          reportData.totalMessages,
          reportData.passCount,
          reportData.failCount,
          JSON.stringify(reportData),
        ]
      );
    } catch (dbErr) {
      logger.debug({ err: dbErr.message }, 'Database store for DMARC report skipped (in-memory store active)');
    }
  }

  logger.info(
    { reportId: reportData.reportId, org: reportData.orgName, totalMessages: reportData.totalMessages },
    'Stored DMARC aggregate report'
  );

  return reportData;
}

/**
 * Returns aggregated statistics: total evaluated, SPF pass rate %, DKIM pass rate %, failure breakdown by source IP.
 * @returns {Promise<{
 *   totalEvaluated: number,
 *   spfPassRate: number,
 *   dkimPassRate: number,
 *   overallPassRate: number,
 *   failureBreakdownByIp: Array<{ sourceIp: string, failCount: number, spfFailCount: number, dkimFailCount: number }>,
 *   reportsCount: number,
 *   recentReports: Array<Object>
 * }>}
 */
export async function getDmarcReportSummary() {
  let totalEvaluated = 0;
  let totalSpfPass = 0;
  let totalDkimPass = 0;
  let totalPass = 0;

  const failureMap = new Map();

  for (const report of inMemoryReports) {
    for (const record of report.records || []) {
      const count = record.count || 1;
      totalEvaluated += count;

      if (record.spf === 'pass') {
        totalSpfPass += count;
      }
      if (record.dkim === 'pass') {
        totalDkimPass += count;
      }
      if (record.isPass) {
        totalPass += count;
      } else {
        const ip = record.sourceIp || 'unknown';
        const existing = failureMap.get(ip) || {
          sourceIp: ip,
          failCount: 0,
          spfFailCount: 0,
          dkimFailCount: 0,
        };

        existing.failCount += count;
        if (record.spf !== 'pass') existing.spfFailCount += count;
        if (record.dkim !== 'pass') existing.dkimFailCount += count;

        failureMap.set(ip, existing);
      }
    }
  }

  const spfPassRate = totalEvaluated > 0 ? Number(((totalSpfPass / totalEvaluated) * 100).toFixed(2)) : 100;
  const dkimPassRate = totalEvaluated > 0 ? Number(((totalDkimPass / totalEvaluated) * 100).toFixed(2)) : 100;
  const overallPassRate = totalEvaluated > 0 ? Number(((totalPass / totalEvaluated) * 100).toFixed(2)) : 100;

  const failureBreakdownByIp = Array.from(failureMap.values()).sort((a, b) => b.failCount - a.failCount);

  return {
    totalEvaluated,
    spfPassRate,
    dkimPassRate,
    overallPassRate,
    failureBreakdownByIp,
    reportsCount: inMemoryReports.length,
    recentReports: inMemoryReports.slice(0, 20),
  };
}

export default {
  parseDmarcAggregateReport,
  storeDmarcReport,
  getDmarcReportSummary,
};
