/**
 * Email Client HTML/CSS Compatibility Validator
 * Analyzes compiled email markup for cross-client rendering pitfalls across Outlook, Gmail, Apple Mail, and Yahoo.
 */

export function validateEmailHtml(htmlString = '') {
  const issues = [];
  const html = String(htmlString);

  // 1. Forbidden Active Content (All Clients Strip)
  if (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(html)) {
    issues.push({
      client: 'All Clients',
      level: 'FAIL',
      feature: '<script> Tags',
      message: 'JavaScript is completely stripped by all email clients for security.',
      suggestion: 'Remove all script tags. Use HTML links and buttons for interactivity.'
    });
  }

  if (/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi.test(html)) {
    issues.push({
      client: 'All Clients',
      level: 'FAIL',
      feature: '<iframe> Tags',
      message: 'Embedded iframes are blocked by all major email clients.',
      suggestion: 'Replace iframes with static images linked to external destinations.'
    });
  }

  if (/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi.test(html)) {
    issues.push({
      client: 'All Clients',
      level: 'FAIL',
      feature: '<form> Inputs',
      message: 'Interactive forms are stripped or flagged as phishing in webmail.',
      suggestion: 'Link out to a hosted landing page or web form.'
    });
  }

  // 2. Outlook Desktop (Word HTML Rendering Engine)
  if (/display\s*:\s*flex/gi.test(html)) {
    issues.push({
      client: 'Outlook',
      level: 'WARN',
      feature: 'CSS Flexbox',
      message: 'Outlook does not support CSS Flexbox and will ignore flex containers.',
      suggestion: 'Use nested <table> with align="left" or <td> widths for columnar layouts.'
    });
  }

  if (/display\s*:\s*grid/gi.test(html)) {
    issues.push({
      client: 'Outlook',
      level: 'WARN',
      feature: 'CSS Grid',
      message: 'CSS Grid is unsupported in Microsoft Outlook.',
      suggestion: 'Use HTML table rows and cells for grid structures.'
    });
  }

  if (/border-radius/gi.test(html) && !/urn:schemas-microsoft-com:vml/gi.test(html)) {
    issues.push({
      client: 'Outlook',
      level: 'WARN',
      feature: 'CSS border-radius',
      message: 'Outlook ignores CSS border-radius and renders square corners unless VML roundrect is provided.',
      suggestion: 'Use VML fallbacks (v:roundrect) for rounded CTA buttons.'
    });
  }

  if (/<video\b/gi.test(html)) {
    issues.push({
      client: 'Outlook & Gmail',
      level: 'WARN',
      feature: '<video> Tag',
      message: 'HTML5 video is unsupported in Outlook and Gmail.',
      suggestion: 'Use an animated GIF or a thumbnail with a play button overlay.'
    });
  }

  // 3. Gmail Specifics
  if (/position\s*:\s*(absolute|fixed)/gi.test(html)) {
    issues.push({
      client: 'Gmail',
      level: 'WARN',
      feature: 'CSS position: absolute/fixed',
      message: 'Gmail strips absolute and fixed positioning.',
      suggestion: 'Rely on table-based flow and margins.'
    });
  }

  // 4. Client Matrix Breakdown
  const clientMatrix = {
    gmail: {
      status: 'PASS',
      issues: issues.filter(i => i.client === 'Gmail' || i.client === 'All Clients' || i.client === 'Outlook & Gmail')
    },
    outlook: {
      status: 'PASS',
      issues: issues.filter(i => i.client === 'Outlook' || i.client === 'All Clients' || i.client === 'Outlook & Gmail')
    },
    apple: {
      status: 'PASS',
      issues: issues.filter(i => i.client === 'Apple Mail' || i.client === 'All Clients')
    },
    yahoo: {
      status: 'PASS',
      issues: issues.filter(i => i.client === 'Yahoo' || i.client === 'All Clients')
    }
  };

  for (const [client, data] of Object.entries(clientMatrix)) {
    if (data.issues.some(i => i.level === 'FAIL')) {
      data.status = 'FAIL';
    } else if (data.issues.some(i => i.level === 'WARN')) {
      data.status = 'WARN';
    }
  }

  let overallStatus = 'PASS';
  if (issues.some(i => i.level === 'FAIL')) {
    overallStatus = 'FAIL';
  } else if (issues.some(i => i.level === 'WARN')) {
    overallStatus = 'WARN';
  }

  return {
    overallStatus,
    clientMatrix,
    issues,
    totalIssues: issues.length
  };
}
