/**
 * @fileoverview Master Test Orchestrator for WoxMail 35-Suite Test Matrix.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUITES = [
  // Category I: Core Utilities & Cryptography (01-06)
  'unit/01_crypto_helpers.test.js',
  'unit/02_email_sanitizer.test.js',
  'unit/03_otp_detector.test.js',
  'unit/04_pgp_security.test.js',
  'unit/05_ephemeral_vault.test.js',
  'unit/06_service_classifier.test.js',

  // Category II: Sovereign Backend Services (07-15)
  'services/07_purelymail_protocol.test.js',
  'services/08_pool_lifecycle_cleaner.test.js',
  'services/09_futureme_engine.test.js',
  'services/10_deadman_switch.test.js',
  'services/11_support_desk_engine.test.js',
  'services/12_calendar_ics_parser.test.js',
  'services/13_app_passwords_woxauth.test.js',
  'services/14_campaigns_rss_bridge.test.js',
  'services/15_gatekeeper_screener_ipblock.test.js',

  // Category III: Advanced Productivity & Auxiliary Services (16-19)
  'services/16_snooze_scheduler.test.js',
  'services/17_email_notes_encrypted.test.js',
  'services/18_link_preview_image_proxy.test.js',
  'services/19_webhooks_push_notifications.test.js',

  // Category IV: REST API Endpoints & Session Security (20-29)
  'api/20_auth_session_api.test.js',
  'api/21_totp_2fa_backup_api.test.js',
  'api/22_password_recovery_api.test.js',
  'api/23_tempmail_public_api.test.js',
  'api/24_tempmail_personal_api.test.js',
  'api/25_mail_webmail_api.test.js',
  'api/26_autodiscover_mobileconfig_api.test.js',
  'api/27_user_settings_api.test.js',
  'api/28_admin_command_api.test.js',
  'api/29_docs_health_cli_api.test.js',

  // Category V: Background Daemons & Scheduled Jobs (30-32)
  'daemons/30_cron_scheduler_jobs.test.js',
  'daemons/31_support_ingestion_daemon.test.js',
  'daemons/32_inbound_reply_router.test.js',

  // Category VI: Playwright Browser End-to-End Flows (33-35)
  'e2e/33_browser_landing_tempmail_e2e.test.js',
  'e2e/34_browser_support_futureme_e2e.test.js',
  'e2e/35_browser_responsive_theme_e2e.test.js',

  // Category VII: Next-Gen Upgrades & Zero-Knowledge Enclave (36-42)
  'unit/36_passkeys_webauthn.test.js',
  'unit/37_undo_send_state_machine.test.js',
  'unit/38_dkim_dmarc_inspector.test.js',
  'unit/39_multi_domain_pool.test.js',
  'api/40_passkeys_api.test.js',
  'api/41_undo_send_api.test.js',
  'e2e/42_browser_keyboard_navigation_e2e.test.js',

  // Category VIII: Enterprise Protocols, Sieve Rules & Privacy Enclave (43-47)
  'unit/43_use_keyboard_and_shortcuts.test.js',
  'services/23_link_sandbox_and_security.test.js',
  'services/24_sieve_rules_and_automation.test.js',
  'services/25_wkd_and_mta_sts.test.js',
  'services/26_jmap_and_backups.test.js',
];

async function runSuite(suiteRelPath, index, total) {
  const fullPath = path.join(__dirname, suiteRelPath);
  const suiteName = path.basename(suiteRelPath);
  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fullPath], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch {}

      const durationMs = Date.now() - start;
      const passed = !stdout.includes('✖ failing tests:') && !stderr.includes('AssertionError') &&
        (stdout.includes('✔ Suite') || stdout.includes('✓ Suite') || stdout.includes('ℹ pass') || stdout.includes('✔ 1.') || stdout.includes('✔ Setup:'));

      resolve({
        suiteRelPath,
        suiteName,
        index: index + 1,
        total,
        passed,
        durationMs,
        stdout,
        stderr,
      });
    }

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      if (text.includes('✔ Suite') || text.includes('✓ Suite') || text.includes('✖ Suite') || text.includes('✖ failing tests:')) {
        setTimeout(finish, 80);
      }
    });

    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', finish);

    // Fallback safety timeout for browser E2E / network daemons
    setTimeout(finish, 25000);
  });
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  WOXMAIL SOVEREIGN PRIVACY SUITE — 35-SUITE MASTER TEST MATRIX');
  console.log('='.repeat(80) + '\n');

  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < SUITES.length; i++) {
    const suiteRelPath = SUITES[i];
    const indexStr = `[${String(i + 1).padStart(2, '0')}/${SUITES.length}]`;
    process.stdout.write(`  ${indexStr} Running ${suiteRelPath.padEnd(52, ' ')} `);

    const res = await runSuite(suiteRelPath, i, SUITES.length);
    results.push(res);

    if (res.passed) {
      console.log(`✔ PASS (${(res.durationMs / 1000).toFixed(2)}s)`);
    } else {
      console.log(`✖ FAIL (${(res.durationMs / 1000).toFixed(2)}s)`);
      if (res.stdout) {
        console.log('--- STDOUT ---');
        console.log(res.stdout);
      }
      if (res.stderr) {
        console.log('--- STDERR ---');
        console.log(res.stderr);
      }
      console.log('-'.repeat(80));
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log('\n' + '='.repeat(80));
  console.log(`  FINAL VERIFICATION SUMMARY: ${passedCount}/${SUITES.length} Suites Passed (${failedCount} Failed) in ${totalDuration}s`);
  console.log('='.repeat(80) + '\n');

  if (failedCount > 0) {
    console.error(`Master Test Matrix finished with ${failedCount} suite failure(s).\n`);
    process.exit(1);
  } else {
    console.log('All 35 suites executed with 100% SUCCESS.\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
