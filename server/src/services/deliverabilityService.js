/**
 * Pre-Flight Deliverability & Spam Score Inspector
 */

const HIGH_RISK_SPAM_WORDS = [
  '100% free', 'act now', 'apply now', 'as seen on', 'bad credit', 'best price',
  'big bucks', 'billion dollars', 'buy direct', 'call now', 'cash bonus',
  'cash prizes', 'cents on the dollar', 'certified', 'cheap', 'claim',
  'clearance', 'click below', 'click here', 'compare rates', 'congratulations',
  'credit card offers', 'cures', 'dear friend', 'direct email', 'direct marketing',
  'discount', 'double your income', 'earn extra cash', 'eliminate debt',
  'exclusive deal', 'expect to earn', 'extra income', 'fast cash', 'financial freedom',
  'free access', 'free consultation', 'free gift', 'free hosting', 'free info',
  'free membership', 'free money', 'free preview', 'free sample', 'free trial',
  'full refund', 'get out of debt', 'get paid', 'giveaway', 'guaranteed',
  'hidden assets', 'increase sales', 'instant', 'investment', 'join millions',
  'limited time', 'lowest price', 'make money', 'million dollars', 'miracle',
  'money back', 'mortgage rates', 'multi-level marketing', 'no catch',
  'no cost', 'no credit check', 'no experience', 'no fees', 'no gimmick',
  'no hidden costs', 'no obligation', 'no purchase necessary', 'no risk',
  'no strings attached', 'not spam', 'obligation', 'off shore', 'offer',
  'once in a lifetime', 'one time', 'online marketing', 'open immediately',
  'order now', 'passwords', 'pennies a day', 'potential earnings', 'prize',
  'promise you', 'pure profit', 'refund', 'removal instructions', 'remove',
  'reverse aging', 'risk free', 'save big', 'save money', 'score',
  'secret', 'see for yourself', 'send $', 'special promotion', 'stainless steel',
  'stock alert', 'stop snoring', 'terms and conditions', 'this isn\'t spam',
  'time limited', 'unlimited', 'unsolicited', 'urgent', 'valuable',
  'viagra', 'vicodin', 'warranty', 'weight loss', 'while supplies last',
  'win', 'winner', 'winning', 'wire transfer', 'work from home', 'you have been selected'
];

export function analyzeDeliverability({
  subject = '',
  bodyHtml = '',
  bodyText = '',
  fromEmail = '',
  toEmail = '',
}) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  const combinedText = `${subject} ${bodyText} ${bodyHtml.replace(/<[^>]*>/g, ' ')}`.toLowerCase();

  // 1. Subject checks
  if (!subject.trim()) {
    score -= 25;
    issues.push({ severity: 'high', type: 'empty_subject', message: 'Subject line is empty' });
    recommendations.push('Add a concise, informative subject line.');
  } else {
    // Check all-caps subject
    const letters = subject.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 5) {
      const upperCount = (subject.match(/[A-Z]/g) || []).length;
      if (upperCount / letters.length > 0.6) {
        score -= 15;
        issues.push({ severity: 'high', type: 'caps_subject', message: 'Subject has excessive capital letters' });
        recommendations.push('Use standard sentence case in your subject line.');
      }
    }

    // Excessive punctuation in subject
    if (/[!?$]{2,}/.test(subject)) {
      score -= 10;
      issues.push({ severity: 'medium', type: 'punctuation_subject', message: 'Subject contains repeated exclamation or question marks' });
      recommendations.push('Avoid repeated punctuation marks (!! or ???) in the subject.');
    }
  }

  // 2. Spam keyword detection
  const detectedSpamWords = [];
  for (const word of HIGH_RISK_SPAM_WORDS) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(combinedText)) {
      detectedSpamWords.push(word);
    }
  }

  if (detectedSpamWords.length > 0) {
    const deduction = Math.min(30, detectedSpamWords.length * 6);
    score -= deduction;
    issues.push({
      severity: detectedSpamWords.length > 2 ? 'high' : 'medium',
      type: 'spam_words',
      message: `Detected ${detectedSpamWords.length} potential spam trigger term(s): "${detectedSpamWords.slice(0, 4).join('", "')}"`,
      detectedWords: detectedSpamWords,
    });
    recommendations.push('Replace high-risk sales/spam trigger words with professional, conversational phrasing.');
  }

  // 3. HTML-to-Text ratio check
  if (bodyHtml && !bodyText) {
    const strippedText = bodyHtml.replace(/<[^>]*>/g, '').trim();
    if (strippedText.length < 50 && bodyHtml.includes('<img')) {
      score -= 15;
      issues.push({ severity: 'medium', type: 'image_heavy', message: 'Message is image-heavy with very little readable text' });
      recommendations.push('Include more descriptive body text alongside images to avoid image-spam filters.');
    }
  }

  // 4. Broken merge tags detection
  const mergeTagMatches = combinedText.match(/\{\{[a-z0-9_]+\}\}|\[[a-z0-9_ ]+\]/gi);
  if (mergeTagMatches && mergeTagMatches.length > 0) {
    score -= 10;
    issues.push({
      severity: 'medium',
      type: 'unfilled_merge_tags',
      message: `Found possible unfilled template variable(s): ${mergeTagMatches.slice(0, 3).join(', ')}`,
    });
    recommendations.push('Ensure all template placeholders (e.g. {{name}}) are populated before sending.');
  }

  // 5. Link density check
  const linkMatches = bodyHtml.match(/<a\s+(?:[^>]*?\s+)?href=/gi) || [];
  if (linkMatches.length > 8) {
    score -= 10;
    issues.push({ severity: 'low', type: 'high_link_count', message: `Contains ${linkMatches.length} links, which may trigger promotional filters` });
    recommendations.push('Limit the number of external links to keep the message focused.');
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, score));

  let grade = 'Excellent';
  if (score < 50) grade = 'High Risk';
  else if (score < 70) grade = 'Moderate';
  else if (score < 90) grade = 'Good';

  return {
    score,
    grade,
    isDeliverable: score >= 60,
    issues,
    recommendations: recommendations.length > 0 ? recommendations : ['Your message passes all deliverability and spam checks with flying colors.'],
    metrics: {
      spamWordCount: detectedSpamWords.length,
      linkCount: linkMatches.length,
      bodyLength: (bodyText || bodyHtml.replace(/<[^>]*>/g, '')).length,
    },
  };
}

export default {
  analyzeDeliverability,
};
