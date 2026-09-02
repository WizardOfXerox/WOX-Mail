import cron from 'node-cron';
import { cyclePoolMaintenance, replenishPool } from '../services/pool.js';
import { processDueEmails } from '../services/schedulerService.js';
import { processDueSnoozes } from '../services/snoozeService.js';
import { processReminders } from '../services/calendarService.js';
import { deliverDueLetters } from '../services/futureLetterService.js';
import { processDeadManSwitches } from '../services/deadManService.js';
import { dailyCleanup } from '../services/cleanup.js';
import { runBackupCycle } from '../../jobs/backup.js';
import { runNightlyAggregation } from '../../jobs/analytics-aggregate.js';
import { processPendingCampaigns } from '../services/campaignService.js';
import { processInboundSupportEmails } from './supportIngestionJob.js';
import { processInboundVerificationReplies } from './inboundReplyJob.js';
import { checkDueFollowUps } from '../services/followUpService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:jobs' });

/**
 * Background job scheduler.
 * Runs periodic tasks for pool management, cleanup, scheduled send,
 * snooze processing, calendar reminders, backups, analytics, campaign broadcasts, and support ingestion.
 */

/**
 * Start all background jobs.
 */
export function startJobs() {
  // Every 10 seconds: process inbound email verification replies (Dual-Mode Inbound Challenge)
  cron.schedule('*/10 * * * * *', async () => {
    try {
      const count = await processInboundVerificationReplies();
      if (count > 0) logger.info({ count }, 'Verification: processed inbound reply confirmations');
    } catch (err) {
      logger.debug({ err: err.message }, 'Verification reply ingestion notice');
    }
  });

  // Every 10 seconds: dispatch batches of pending campaigns
  cron.schedule('*/10 * * * * *', async () => {
    try {
      const count = await processPendingCampaigns();
      if (count > 0) logger.info({ count }, 'Campaign broadcaster: batch dispatched');
    } catch (err) {
      logger.error({ err }, 'Campaign dispatch job failed');
    }
  });

  // Every 3 minutes: ingest inbound support emails
  cron.schedule('*/3 * * * *', async () => {
    try {
      const count = await processInboundSupportEmails();
      if (count > 0) logger.info({ count }, 'Support desk: processed inbound tickets');
    } catch (err) {
      logger.error({ err }, 'Support email ingestion job failed');
    }
  });

  // Every 5 minutes: check Dead Man's Switch warnings & triggers
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processDeadManSwitches();
    } catch (err) {
      logger.error({ err }, 'Dead Man Switch check job failed');
    }
  });

  // Every 1 minute: deliver due future letters (FutureMe time capsules)
  cron.schedule('* * * * *', async () => {
    try {
      const count = await deliverDueLetters();
      if (count > 0) logger.info({ count }, 'FutureMe: delivered time-capsule letters from the past');
    } catch (err) {
      logger.error({ err }, 'FutureMe delivery job failed');
    }
  });

  // Every 1 minute: send due scheduled emails
  cron.schedule('* * * * *', async () => {
    try {
      const count = await processDueEmails();
      if (count > 0) logger.info({ count }, 'Scheduled send: dispatched');
    } catch (err) {
      logger.error({ err }, 'Scheduled send job failed');
    }
  });

  // Every 1 minute: unsnooze due emails
  cron.schedule('* * * * *', async () => {
    try {
      const count = await processDueSnoozes();
      if (count > 0) logger.info({ count }, 'Snooze: unsnoozed');
    } catch (err) {
      logger.error({ err }, 'Snooze check job failed');
    }
  });

  // Every 1 minute: check due "Bump If No Reply" reminders
  cron.schedule('* * * * *', async () => {
    try {
      const triggered = await checkDueFollowUps();
      if (triggered.length > 0) logger.info({ count: triggered.length }, 'Follow-up reminders: triggered');
    } catch (err) {
      logger.error({ err }, 'Follow-up check job failed');
    }
  });

  // Every 5 minutes: calendar reminders
  cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await processReminders();
      if (count > 0) logger.info({ count }, 'Calendar: reminders sent');
    } catch (err) {
      logger.error({ err }, 'Calendar reminder job failed');
    }
  });

  // Every 15 minutes: cycle stale unclaimed pool addresses & replenish available standby accounts
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await cyclePoolMaintenance(24);
      if (result.purged > 0 || result.replenished > 0) {
        logger.info(result, 'Pool maintenance cleaner: cycled stale & replenished standby pool');
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Pool maintenance cleaner cycle failed');
    }
  });

  // Daily at midnight: clean old records
  cron.schedule('0 0 * * *', async () => {
    try {
      await dailyCleanup();
      logger.info('Daily cleanup: old records purged');
    } catch (err) {
      logger.error({ err }, 'Daily cleanup failed');
    }
  });

  // Nightly at 03:00: analytics aggregation
  cron.schedule('0 3 * * *', async () => {
    try {
      await runNightlyAggregation();
      logger.info('Analytics: nightly aggregation complete');
    } catch (err) {
      logger.error({ err }, 'Analytics aggregation failed');
    }
  });

  // Configurable: database backup (default: daily at 04:00)
  const backupSchedule = process.env.BACKUP_SCHEDULE || '0 4 * * *';
  cron.schedule(backupSchedule, () => {
    try {
      runBackupCycle();
      logger.info('Backup: cycle complete');
    } catch (err) {
      logger.error({ err }, 'Backup job failed');
    }
  });

  logger.info('Background jobs started (11 cron tasks)');
}

export default { startJobs };
