import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from './database.js';
import { JWT_COOKIE_NAME } from './constants.js';
import * as liveMailWatcher from '../services/liveMailWatcher.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:socket' });

/** @type {Server} */
let io;

/**
 * Return allowed CORS origins for both Express and Socket.IO.
 * @returns {string[]}
 */
export function getAllowedOrigins() {
  const origins = [
    'https://mail.wox.world',
    'https://wox.world',
  ];
  if (process.env.DOMAIN_ONION) {
    origins.push(`https://${process.env.DOMAIN_ONION}`, `http://${process.env.DOMAIN_ONION}`);
  }
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    origins.push(
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:5173',
      'http://192.168.254.106:3001',
      'http://192.168.254.103:3001'
    );
  }
  return origins;
}

function extractCookieToken(cookieHeader, cookieName) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const prefix = `${cookieName}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const rawVal = trimmed.slice(prefix.length);
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

/**
 * Initialize Socket.IO server on the HTTP server instance.
 * Sets up JWT authentication middleware for socket connections.
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocket(httpServer) {
  const allowedOrigins = getAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Origin not allowed'));
      },
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT auth middleware for socket connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || extractCookieToken(socket.handshake.headers?.cookie, JWT_COOKIE_NAME);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.jti && !decoded.impersonated) {
        const sessRes = await query(
          'SELECT is_revoked, expires_at FROM user_sessions WHERE id = $1',
          [decoded.jti]
        );
        if (
          sessRes.rows.length === 0 ||
          sessRes.rows[0].is_revoked === true ||
          new Date(sessRes.rows[0].expires_at) <= new Date()
        ) {
          return next(new Error('Session revoked or expired'));
        }
      }

      const result = await query(
        'SELECT id, email, username, is_admin FROM users WHERE id = $1 AND is_suspended = FALSE',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return next(new Error('User not found'));
      }

      socket.user = result.rows[0];
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    logger.info({ userId: user.id, email: user.email }, 'Socket connected');

    // Join user-specific room for targeted events
    socket.join(`user:${user.id}`);

    // Register user for live background mail watching while connected
    liveMailWatcher.registerUser(user.id, user.email);

    // Admin room
    if (user.is_admin) {
      socket.join('admin');
    }

    socket.on('disconnect', () => {
      logger.debug({ userId: user.id }, 'Socket disconnected');
      liveMailWatcher.unregisterUser(user.id);
    });
  });

  // Start the background mail watcher loop
  liveMailWatcher.startWatcher();

  return io;
}

/**
 * Get the Socket.IO server instance.
 * @returns {Server}
 */
export function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

/**
 * Emit an event to a specific user by their user ID.
 * @param {number} userId
 * @param {string} event
 * @param {any} data
 */
export function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emit an event to all admin users.
 * @param {string} event
 * @param {any} data
 */
export function emitToAdmins(event, data) {
  if (io) io.to('admin').emit(event, data);
}
