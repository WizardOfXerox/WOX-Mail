import { query } from '../src/config/database.js';

/**
 * Migration 003: Analytics tables.
 * Stores aggregated statistics for the admin dashboard.
 */
export async function up() {
  await query(`
    -- Daily aggregate stats
    CREATE TABLE IF NOT EXISTS daily_stats (
      id              SERIAL PRIMARY KEY,
      date            DATE UNIQUE NOT NULL,
      emails_received INTEGER DEFAULT 0,
      emails_sent     INTEGER DEFAULT 0,
      temp_public_created  INTEGER DEFAULT 0,
      temp_personal_created INTEGER DEFAULT 0,
      temp_expired    INTEGER DEFAULT 0,
      permanent_signups INTEGER DEFAULT 0,
      logins          INTEGER DEFAULT 0,
      failed_logins   INTEGER DEFAULT 0,
      blocked_services INTEGER DEFAULT 0,
      unique_ips      INTEGER DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date);

    -- Hourly stats (for traffic pattern charts)
    CREATE TABLE IF NOT EXISTS hourly_stats (
      id              SERIAL PRIMARY KEY,
      hour            TIMESTAMPTZ NOT NULL,
      emails_received INTEGER DEFAULT 0,
      emails_sent     INTEGER DEFAULT 0,
      temp_created    INTEGER DEFAULT 0,
      api_requests    INTEGER DEFAULT 0,
      UNIQUE(hour)
    );
    CREATE INDEX IF NOT EXISTS idx_hourly_hour ON hourly_stats(hour);

    -- Per-service block stats
    CREATE TABLE IF NOT EXISTS service_block_stats (
      id              SERIAL PRIMARY KEY,
      date            DATE NOT NULL,
      service_name    TEXT NOT NULL,
      tier            TEXT NOT NULL,
      blocked_count   INTEGER DEFAULT 0,
      UNIQUE(date, service_name, tier)
    );

    -- Geographic distribution (based on IP geo)
    CREATE TABLE IF NOT EXISTS geo_stats (
      id              SERIAL PRIMARY KEY,
      date            DATE NOT NULL,
      country_code    TEXT NOT NULL DEFAULT 'XX',
      request_count   INTEGER DEFAULT 0,
      UNIQUE(date, country_code)
    );
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS geo_stats CASCADE;
    DROP TABLE IF EXISTS service_block_stats CASCADE;
    DROP TABLE IF EXISTS hourly_stats CASCADE;
    DROP TABLE IF EXISTS daily_stats CASCADE;
  `);
}
