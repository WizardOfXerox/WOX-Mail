/**
 * @fileoverview WoxMail server entry point.
 * Express + EJS + Socket.IO + PostgreSQL + Redis.
 */

import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { initSocket } from './src/config/socket.js';
import { csrfProtection } from './src/middleware/csrf.js';
import { ipBlockCheck } from './src/middleware/ipBlock.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';
import { apiLimiter } from './src/middleware/rateLimit.js';

// Routes
import pagesRouter from './src/routes/pages.js';
import authRouter from './src/routes/auth.js';
import healthRouter from './src/routes/health.js';
import tempmailRouter from './src/routes/tempmail.js';
import mailRouter from './src/routes/mail.js';
import settingsRouter from './src/routes/settings.js';
import adminRouter from './src/routes/admin.js';
import woxauthRouter from './src/routes/woxauth.js';
import calendarRouter from './src/routes/calendar.js';
import aliasesRouter from './src/routes/aliases.js';
import smsRouter from './src/routes/sms.js';
import secureMessagesRouter from './src/routes/secureMessages.js';
import futureLettersRouter from './src/routes/futureLetters.js';
import cliRouter from './src/routes/cli.js';
import deadManRouter from './src/routes/deadMan.js';
import feedRssRouter from './src/routes/feedRss.js';
import ephemeralRouter from './src/routes/ephemeral.js';
import notesRouter from './src/routes/notes.js';
import gatekeeperRouter from './src/routes/gatekeeper.js';
import campaignsRouter from './src/routes/campaigns.js';
import supportRouter from './src/routes/support.js';
import autodiscoverRouter from './src/routes/autodiscover.js';
import verifyRouter from './src/routes/verify.js';
import docsRouter from './src/routes/docs.js';
import passkeysRouter from './src/routes/passkeys.js';
import dnsHealthRouter from './src/routes/dnsHealth.js';
import accountsRouter from './src/routes/accounts.js';
import analyticsRouter from './src/routes/analytics.js';
import templatesRouter from './src/routes/templates.js';
import protonProxyRouter from './src/routes/protonProxy.js';
import kanbanRouter from './src/routes/kanban.js';
import integrationsRouter from './src/routes/integrations.js';
import aiRouter from './src/routes/ai.js';
import exportRouter from './src/routes/export.js';
import secureAttachmentsRouter from './src/routes/secureAttachments.js';
import followupRouter from './src/routes/followup.js';
import deliverabilityRouter from './src/routes/deliverability.js';
import dossierRouter from './src/routes/dossier.js';
import snippetsRouter from './src/routes/snippets.js';
import { setVerificationSocketIO } from './src/services/verificationService.js';

// Background jobs
import { startJobs } from './src/jobs/scheduler.js';

export const logger = pino({
  name: 'woxmail',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export const app = express();
export const server = http.createServer(app);

// Enable trust proxy for Cloudflare Tunnel, CF-Connecting-IP, and X-Forwarded-Proto
app.set('trust proxy', 1);

// Broadcast RFC Onion-Location header to Tor Browser clients
app.use((req, res, next) => {
  const onionHost = process.env.DOMAIN_ONION || 'e6mph43cdahjoum7pbrs2gpzvb3edq3j2ob6hi5soihld4oid2fcwbad.onion';
  res.setHeader('Onion-Location', `http://${onionHost}${req.originalUrl || req.url}`);
  next();
});

// Initialize Socket.IO with JWT auth
export const io = initSocket(server);
setVerificationSocketIO(io);

// ─── View Engine ─────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Security Middleware ─────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'style-src-elem': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'script-src': ["'self'", "'unsafe-inline'", 'https://js.hcaptcha.com', 'https://static.cloudflareinsights.com'],
        'script-src-elem': ["'self'", "'unsafe-inline'", 'https://js.hcaptcha.com', 'https://static.cloudflareinsights.com'],
        'script-src-attr': ["'self'", "'unsafe-inline'"],
        'frame-src': ["'self'", 'https://newassets.hcaptcha.com', 'https://hcaptcha.com'],
        'connect-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://api.hcaptcha.com', 'https://static.cloudflareinsights.com', 'wss:', 'ws:'],
        'worker-src': ["'self'", 'blob:'],
        'upgrade-insecure-requests': null,
      },
    },
    hsts: false, // Cloudflare edge handles HTTPS HSTS for public domains; keep false locally for LAN HTTP
    crossOriginEmbedderPolicy: false,
  })
);

const ALLOWED_ORIGINS = [
  'https://mail.wox.world',
  'https://wox.world',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3001', 'http://localhost:5173', 'http://192.168.254.106:3001', 'http://192.168.254.103:3001'] : []),
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false); // Silently deny unknown origins without leaking stack traces
  },
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET));

// IP blocking (before any routes)
app.use(ipBlockCheck);

// CSRF protection (sets cookie on GET, validates on POST/PUT/DELETE)
app.use(csrfProtection);

// ─── Static Assets ───────────────────────────────────────
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'assets', 'favicon.svg'));
});

app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
  setHeaders: (res, filePath) => {
    if (process.env.NODE_ENV === 'development' || filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  },
}));

// ─── API Routes ──────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/auth/passkeys', passkeysRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings/passkeys', passkeysRouter);
app.use('/api/settings/dns-health', dnsHealthRouter);
app.use('/api/tempmail', tempmailRouter);
app.use('/api/secure', secureMessagesRouter);
app.use('/api/mail', secureMessagesRouter);
app.use('/api/mail', mailRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/woxauth', woxauthRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/aliases', aliasesRouter);
app.use('/api/sms', smsRouter);
app.use('/api/futureme', futureLettersRouter);
app.use('/api/cli', cliRouter);
app.use('/api/deadman', deadManRouter);
app.use('/feeds', feedRssRouter);
app.use('/api/settings/feed-rss', feedRssRouter);
app.use('/api/ephemeral', ephemeralRouter);
app.use('/api/notes', notesRouter);
app.use('/api/screener', gatekeeperRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/support', supportRouter);
app.use('/api/autodiscover', autodiscoverRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/docs', docsRouter);
app.use('/docs', docsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/kanban', kanbanRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);
app.use('/api/proton', protonProxyRouter);
app.use('/api/secure-attachments', secureAttachmentsRouter);
app.use('/api/followup', followupRouter);
app.use('/api/deliverability', deliverabilityRouter);
app.use('/api/dossier', dossierRouter);
app.use('/api/snippets', snippetsRouter);
app.use('/', autodiscoverRouter);

// Global API rate limiter (after specific route limiters)
app.use('/api', apiLimiter);

// ─── Page Routes ─────────────────────────────────────────
app.use('/', pagesRouter);

// ─── Error Handling ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use by another process.`);
  } else {
    logger.error({ err }, 'HTTP Server encountered an error');
  }
});

server.listen(PORT, () => {
  logger.info(`🚀 WoxMail server running at http://localhost:${PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Permanent domain: ${process.env.DOMAIN_PERMANENT || 'wox.world'}`);
  logger.info(`   Temp domain: ${process.env.DOMAIN_TEMP || 'mail.wox.world'}`);

  // Start background jobs (pool replenish, cleanup, purge)
  startJobs();
});

// ─── Graceful Shutdown ───────────────────────────────────
function gracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down...`);

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Shutdown error');
      process.exit(1);
    }
    logger.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown (timeout)');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Prevent uncaught errors from crashing the background server
process.on('uncaughtException', (err) => {
  logger.error({ err: err?.stack || err?.message || err }, 'Uncaught Exception detected — keeping server alive');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason?.stack || reason?.message || reason }, 'Unhandled Rejection detected — keeping server alive');
});

export default app;
