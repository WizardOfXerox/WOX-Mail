/**
 * Spam Score Analysis Service for WoxMail Newsletters & Campaigns
 * Provides rule-based heuristic scoring (0 to 10 scale).
 */

const SPAM_TRIGGER_WORDS = [
  { word: 'act now', weight: 1.2 },
  { word: 'free money', weight: 2.5 },
  { word: 'click here', weight: 0.8 },
  { word: 'no obligation', weight: 1.0 },
  { word: 'limited time', weight: 0.9 },
  { word: '100% free', weight: 1.8 },
  { word: 'guarantee', weight: 0.7 },
  { word: 'winner', weight: 2.0 },
  { word: 'risk-free', weight: 1.1 },
  { word: 'urgent', weight: 1.0 },
  { word: 'instant access', weight: 1.0 },
  { word: 'congratulations', weight: 1.2 },
  { word: 'make money', weight: 2.2 },
  { word: 'earn extra cash', weight: 2.2 },
  { word: 'exclusive deal', weight: 0.8 },
  { word: 'no cost', weight: 0.9 },
  { word: 'double your', weight: 1.8 },
  { word: 'unclaimed', weight: 1.5 },
  { word: 'prizes', weight: 1.4 }
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly',
  'is.gd', 'buff.ly', 'adf.ly', 'bit.do', 'shorturl.at'
];

/**
 * Calculate spam score and detailed breakdown for an email draft.
 * @param {Object} draft
 * @param {string} draft.subject
 * @param {string} draft.htmlContent
 * @param {string} draft.plainContent
 * @returns {Object} Score details, risk level, rules triggered, and recommendations
 */
export function calculateSpamScore({ subject = '', htmlContent = '', plainContent = '' }) {
  const rulesTriggered = [];
  let rawScore = 0;

  const cleanSubject = String(subject || '').trim();
  const cleanHtml = String(htmlContent || '');
  const cleanPlain = String(plainContent || '');

  // Extract raw text from HTML if plain text not provided
  const strippedHtml = cleanHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const textBody = cleanPlain.length > 0 ? cleanPlain : strippedHtml;
  const combinedText = `${cleanSubject} ${textBody}`.toLowerCase();

  // 1. Subject All Caps Check
  if (cleanSubject.length > 10) {
    const uppercaseCount = cleanSubject.replace(/[^A-Z]/g, '').length;
    const uppercaseRatio = uppercaseCount / cleanSubject.replace(/[^a-zA-Z]/g, '').length || 0;
    if (uppercaseRatio > 0.4) {
      const penalty = 2.0;
      rawScore += penalty;
      rulesTriggered.push({
        rule: 'EXCESSIVE_UPPERCASE_SUBJECT',
        name: 'Excessive Uppercase in Subject',
        penalty,
        description: `Subject line is ${(uppercaseRatio * 100).toFixed(0)}% uppercase characters.`,
        recommendation: 'Use sentence case or title case in subject lines.'
      });
    }
  }

  // 2. Exclamation & Question Mark Clutter
  const exclamations = (cleanSubject.match(/!{2,}/g) || []).length;
  const questionMarks = (cleanSubject.match(/\?{2,}/g) || []).length;
  if (exclamations > 0 || questionMarks > 0) {
    const penalty = 1.2;
    rawScore += penalty;
    rulesTriggered.push({
      rule: 'REPEATED_PUNCTUATION',
      name: 'Repeated Punctuation in Subject',
      penalty,
      description: 'Multiple exclamation points or question marks (e.g. "!!!" or "???") detected.',
      recommendation: 'Use single punctuation marks to avoid spam filters.'
    });
  }

  // 3. Spam Trigger Word Matches
  const detectedTriggers = [];
  for (const trigger of SPAM_TRIGGER_WORDS) {
    const regex = new RegExp(`\\b${trigger.word}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches && matches.length > 0) {
      detectedTriggers.push({ word: trigger.word, count: matches.length, weight: trigger.weight });
      rawScore += trigger.weight * Math.min(matches.length, 2);
    }
  }

  if (detectedTriggers.length > 0) {
    const totalTriggerPenalty = detectedTriggers.reduce((sum, t) => sum + t.weight * Math.min(t.count, 2), 0);
    rulesTriggered.push({
      rule: 'SPAM_TRIGGER_KEYWORDS',
      name: 'Spam Trigger Keywords Detected',
      penalty: Number(totalTriggerPenalty.toFixed(2)),
      description: `Found keywords: ${detectedTriggers.map(t => `"${t.word}"`).join(', ')}.`,
      recommendation: 'Replace high-pressure sales and urgent financial phrasing with authentic language.'
    });
  }

  // 4. URL Shortener Detection
  const shortenerMatches = [];
  for (const shortener of URL_SHORTENERS) {
    if (cleanHtml.includes(shortener) || cleanPlain.includes(shortener)) {
      shortenerMatches.push(shortener);
    }
  }
  if (shortenerMatches.length > 0) {
    const penalty = 2.5;
    rawScore += penalty;
    rulesTriggered.push({
      rule: 'URL_SHORTENER_DETECTED',
      name: 'Public URL Shorteners Used',
      penalty,
      description: `Links with shortened domains detected: ${shortenerMatches.join(', ')}.`,
      recommendation: 'Use direct, fully qualified domain links. Spam filters aggressively penalize shortened links.'
    });
  }

  // 5. HTML to Text Ratio (Image-Heavy / Thin Content)
  if (cleanHtml.length > 0) {
    const textLength = strippedHtml.length;
    const htmlLength = cleanHtml.length;
    const textRatio = textLength / (htmlLength || 1);

    if (textLength < 40 && htmlLength > 200) {
      const penalty = 1.5;
      rawScore += penalty;
      rulesTriggered.push({
        rule: 'LOW_TEXT_TO_HTML_RATIO',
        name: 'Low Text-to-HTML Ratio (Image-Only Draft)',
        penalty,
        description: 'Email contains heavy HTML markup or images with very little readable body text.',
        recommendation: 'Include descriptive body paragraphs alongside your images.'
      });
    }
  }

  // 6. Link Density Check
  const linkCount = (cleanHtml.match(/href=/gi) || []).length;
  const wordCount = strippedHtml.split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && linkCount > 8 && (linkCount / wordCount) > 0.15) {
    const penalty = 1.3;
    rawScore += penalty;
    rulesTriggered.push({
      rule: 'EXCESSIVE_LINK_DENSITY',
      name: 'Excessive Link Density',
      penalty,
      description: `Email has ${linkCount} links for only ${wordCount} words.`,
      recommendation: 'Limit call-to-action links to 2-4 focused destinations.'
    });
  }

  // 7. Unsubscribe Tag Check (RFC Compliance)
  if (cleanHtml.length > 0 && !cleanHtml.includes('{{unsubscribe_url}}') && !cleanHtml.toLowerCase().includes('unsubscribe')) {
    const penalty = 1.0;
    rawScore += penalty;
    rulesTriggered.push({
      rule: 'MISSING_UNSUBSCRIBE_LINK',
      name: 'Missing Unsubscribe Directive',
      penalty,
      description: 'Body text does not contain {{unsubscribe_url}} or an unsubscribe notice.',
      recommendation: 'Add {{unsubscribe_url}} in your footer to comply with CAN-SPAM and RFC 8058.'
    });
  }

  // Calculate final bounded score (0 to 10)
  const score = Math.min(10, Math.max(0, Number(rawScore.toFixed(1))));

  let riskLevel = 'LOW';
  let badge = '[PASS: LOW RISK]';
  if (score >= 6.0) {
    riskLevel = 'HIGH';
    badge = '[FAIL: HIGH RISK]';
  } else if (score >= 3.0) {
    riskLevel = 'MODERATE';
    badge = '[WARN: MODERATE RISK]';
  }

  return {
    score,
    riskLevel,
    badge,
    rulesTriggered,
    isCompliant: score < 6.0
  };
}
