/**
 * WoxMail Responsive Email Template Compiler
 * Converts the visual block document tree into cross-client bulletproof HTML tables.
 * Tested across desktop Outlook (Word engine), Gmail, Apple Mail, and mobile clients.
 */

/**
 * Compile a block document array into a full HTML email string.
 * @param {Array<Object>} blocks - List of typed block objects
 * @param {Object} options - Compiler options (preheader, title, backgroundColor)
 * @returns {string} Full HTML document
 */
export function compileEmail(blocks = [], options = {}) {
  const {
    preheader = '',
    title = 'WoxMail Newsletter',
    backgroundColor = '#0f0f1a',
    contentWidth = 600
  } = options;

  const renderedBlocksHtml = blocks.map(renderBlock).join('\n');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${backgroundColor}; }
    @media screen and (max-width: 600px) {
      .responsive-table { width: 100% !important; max-width: 100% !important; }
      .responsive-column { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${backgroundColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  ${preheader ? `<div style="display: none; font-size: 1px; color: ${backgroundColor}; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${backgroundColor};">
    <tr>
      <td align="center" style="padding: 24px 8px;">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="${contentWidth}">
        <tr>
        <td align="center" valign="top" width="${contentWidth}">
        <![endif]-->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: ${contentWidth}px; background-color: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; overflow: hidden;" class="responsive-table">
          <tr>
            <td style="padding: 32px 24px;" class="mobile-padding">
              ${renderedBlocksHtml}
            </td>
          </tr>
        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Render a single block object to responsive HTML table snippet.
 */
export function renderBlock(block) {
  if (!block) return '';

  switch (block.type) {
    case 'header': {
      const align = block.align || 'center';
      const logoHtml = block.logoUrl
        ? `<img src="${escapeHtml(block.logoUrl)}" alt="${escapeHtml(block.title || 'Logo')}" width="${block.logoWidth || 140}" style="display: block; max-width: 100%; height: auto; margin: ${align === 'center' ? '0 auto' : '0'};" />`
        : `<h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #f0f0f5;">${escapeHtml(block.title || 'WoxMail')}</h1>`;

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
          <tr>
            <td align="${align}">
              ${logoHtml}
            </td>
          </tr>
        </table>`;
    }

    case 'heading': {
      const level = block.level || 1;
      const size = level === 1 ? '24px' : level === 2 ? '20px' : '16px';
      const weight = level === 1 ? '700' : '600';
      const align = block.align || 'left';
      const color = block.color || '#f0f0f5';

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
          <tr>
            <td align="${align}" style="font-size: ${size}; font-weight: ${weight}; line-height: 1.3; color: ${color}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${escapeHtml(block.text || '')}
            </td>
          </tr>
        </table>`;
    }

    case 'text': {
      const align = block.align || 'left';
      const color = block.color || '#9898b0';
      const fontSize = block.fontSize || '15px';
      const lineHeight = block.lineHeight || '1.6';

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
          <tr>
            <td align="${align}" style="font-size: ${fontSize}; line-height: ${lineHeight}; color: ${color}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${block.html || escapeHtml(block.text || '')}
            </td>
          </tr>
        </table>`;
    }

    case 'button': {
      const label = escapeHtml(block.label || 'Click Here');
      const url = escapeHtml(block.url || '#');
      const bgColor = block.bgColor || '#7c3aed';
      const textColor = block.textColor || '#ffffff';
      const radius = block.radius === 'pill' ? '9999px' : block.radius === 'square' ? '0px' : '8px';
      const align = block.align || 'center';

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
          <tr>
            <td align="${align}">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="15%" strokecolor="${bgColor}" fillcolor="${bgColor}">
                <w:anchorlock/>
                <center style="color:${textColor};font-family:sans-serif;font-size:14px;font-weight:bold;">${label}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${url}" target="_blank" style="display: inline-block; background-color: ${bgColor}; color: ${textColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; line-height: 44px; text-align: center; text-decoration: none; padding: 0 28px; border-radius: ${radius}; -webkit-text-size-adjust: none;">${label}</a>
              <!--<![endif]-->
            </td>
          </tr>
        </table>`;
    }

    case 'image': {
      const src = escapeHtml(block.src || '');
      const alt = escapeHtml(block.alt || 'Image');
      const align = block.align || 'center';
      const width = block.width || '100%';

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td align="${align}">
              ${block.url ? `<a href="${escapeHtml(block.url)}" target="_blank">` : ''}
                <img src="${src}" alt="${alt}" width="${width}" style="display: block; max-width: 100%; height: auto; border-radius: 8px; margin: ${align === 'center' ? '0 auto' : '0'};" />
              ${block.url ? `</a>` : ''}
            </td>
          </tr>
        </table>`;
    }

    case 'columns': {
      const cols = Array.isArray(block.columns) ? block.columns : [];
      const colCount = Math.max(1, cols.length);
      const colWidthPercent = Math.floor(100 / colCount);

      const colsHtml = cols.map((col) => {
        const innerBlocks = (col.blocks || []).map(renderBlock).join('');
        return `
          <td class="responsive-column" width="${colWidthPercent}%" valign="top" style="padding: 8px;">
            ${innerBlocks}
          </td>`;
      }).join('');

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            ${colsHtml}
          </tr>
        </table>`;
    }

    case 'divider': {
      const color = block.color || '#2a2a4a';
      const style = block.style || 'solid';

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
          <tr>
            <td style="border-top: 1px ${style} ${color}; font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>
        </table>`;
    }

    case 'spacer': {
      const height = block.height || 24;
      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td height="${height}" style="font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>
        </table>`;
    }

    case 'variable': {
      const key = escapeHtml(block.key || 'first_name');
      return `<span style="display: inline-block; background-color: rgba(124, 58, 237, 0.2); color: #8b5cf6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px;">{{${key}}}</span>`;
    }

    case 'social': {
      const links = Array.isArray(block.links) ? block.links : [];
      const align = block.align || 'center';

      const iconsHtml = links.map(link => {
        const platform = escapeHtml(link.platform || 'link');
        const url = escapeHtml(link.url || '#');
        return `
          <td style="padding: 0 8px;">
            <a href="${url}" target="_blank" style="color: #8b5cf6; text-decoration: none; font-size: 12px; font-weight: 600;">
              [${platform.toUpperCase()}]
            </a>
          </td>`;
      }).join('');

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 16px 0;">
          <tr>
            <td align="${align}">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  ${iconsHtml}
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
    }

    case 'footer': {
      const text = block.text || 'WoxMail Sovereign Email Infrastructure';
      const unsubText = block.unsubscribeText || 'Unsubscribe from these emails';

      return `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 32px; border-top: 1px solid #2a2a4a; padding-top: 20px;">
          <tr>
            <td align="center" style="font-size: 12px; line-height: 1.5; color: #6868a0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <p style="margin: 0 0 8px 0;">${escapeHtml(text)}</p>
              <p style="margin: 0;">
                <a href="{{unsubscribe_url}}" style="color: #8b5cf6; text-decoration: underline;">${escapeHtml(unsubText)}</a>
              </p>
            </td>
          </tr>
        </table>`;
    }

    default:
      return '';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
