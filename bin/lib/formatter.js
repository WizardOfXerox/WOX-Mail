export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  purple: '\x1b[38;2;124;58;237m',
  purpleLight: '\x1b[38;2;167;139;250m',
  green: '\x1b[32m',
  amber: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export function banner() {
  console.log([
    `${colors.purple}╔══════════════════════════════════════════════════════════════════╗${colors.reset}`,
    `${colors.purple}║   ${colors.bold}${colors.purpleLight}WOXMAIL SOVEREIGN CLI${colors.reset}${colors.purple} — Private, Ephemeral & Permanent Email  ║${colors.reset}`,
    `${colors.purple}╚══════════════════════════════════════════════════════════════════╝${colors.reset}`,
  ].join('\n'));
}

export function printTable(headers, rows) {
  if (!rows || rows.length === 0) {
    console.log(`${colors.gray}(No records found)${colors.reset}`);
    return;
  }

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxRowLen = Math.max(...rows.map((r) => String(r[i] || '').length));
    return Math.max(h.length, maxRowLen);
  });

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const sepLine = colWidths.map((w) => '─'.repeat(w)).join('─┼─');

  console.log(`${colors.bold}${headerLine}${colors.reset}`);
  console.log(`${colors.gray}${sepLine}${colors.reset}`);

  rows.forEach((row) => {
    const rowLine = row.map((c, i) => String(c || '').padEnd(colWidths[i])).join(' | ');
    console.log(rowLine);
  });
}
