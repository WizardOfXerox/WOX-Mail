/**
 * Smart Expense & Receipt Extractor (Paper Trail Intelligence)
 * Parses transactional receipts and invoices to extract structured financial data.
 */

const KNOWN_VENDORS = [
  'Amazon', 'Apple', 'Google', 'Microsoft', 'Uber', 'Lyft', 'Stripe', 'GitHub',
  'Vercel', 'Supabase', 'Cloudflare', 'DigitalOcean', 'Purelymail', 'Spaceship',
  'Namecheap', 'OpenAI', 'Anthropic', 'Midjourney', 'Figma', 'Zoom', 'Netflix',
  'Spotify', 'Steam', 'Airbnb', 'Hostinger', 'PayPal', 'Shopify', 'AWS'
];

/**
 * Extract financial transaction details from email subject and body
 */
export function extractExpenseData(message) {
  const subject = message.subject || '';
  const text = message.text || '';
  const sender = (message.from?.name || message.from?.address || '').trim();
  const fullContent = `${subject}\n${sender}\n${text}`;

  // 1. Detect Vendor
  let vendor = KNOWN_VENDORS.find(v =>
    new RegExp(`\\b${v}\\b`, 'i').test(sender) || new RegExp(`\\b${v}\\b`, 'i').test(subject)
  );
  if (!vendor) {
    vendor = message.from?.name || message.from?.address?.split('@')[1] || 'Unknown Merchant';
  }

  // 2. Detect Amount & Currency
  let amount = 0;
  let currency = 'USD';

  const usdMatch = fullContent.match(/(?:\$|USD\s*)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
  const eurMatch = fullContent.match(/(?:€|EUR\s*)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
  const gbpMatch = fullContent.match(/(?:£|GBP\s*)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);

  if (usdMatch) {
    amount = parseFloat(usdMatch[1].replace(/,/g, ''));
    currency = 'USD';
  } else if (eurMatch) {
    amount = parseFloat(eurMatch[1].replace(/,/g, ''));
    currency = 'EUR';
  } else if (gbpMatch) {
    amount = parseFloat(gbpMatch[1].replace(/,/g, ''));
    currency = 'GBP';
  }

  // 3. Detect Order / Invoice ID
  const orderMatch = fullContent.match(/(?:order|invoice|receipt|reference|transaction)\s*(?:#|no\.?|id|number)?\s*[:#\s]?\s*([A-Za-z0-9\-]{4,35})/i);
  const invoiceId = orderMatch ? orderMatch[1] : null;

  return {
    uid: message.uid,
    vendor,
    amount,
    currency,
    invoiceId,
    date: message.date ? new Date(message.date).toISOString() : new Date().toISOString(),
    subject,
  };
}

/**
 * Format an array of expense records into a downloadable CSV string
 */
export function formatExpensesToCsv(expenses = []) {
  const headers = ['Date', 'Merchant / Vendor', 'Amount', 'Currency', 'Invoice ID', 'Subject'];
  const rows = expenses.map(e => [
    `"${new Date(e.date).toLocaleDateString()}"`,
    `"${(e.vendor || '').replace(/"/g, '""')}"`,
    `"${e.amount.toFixed(2)}"`,
    `"${e.currency}"`,
    `"${(e.invoiceId || 'N/A').replace(/"/g, '""')}"`,
    `"${(e.subject || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
