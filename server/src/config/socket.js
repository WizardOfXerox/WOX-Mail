import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from './database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:socket' });

/** @type {Server} */
let io;

/**
 * Initialize Socket.IO server on the HTTP server instance.
 * Sets up JWT authentication middleware for socket connections.
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT auth middleware for socket connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie
      ?.split('; ')
      .find((c) => c.startsWith('woxmail_token='))
      ?.split('=')[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

    // Admin room
    if (user.is_admin) {
      socket.join('admin');
    }

    socket.on('disconnect', () => {
      logger.debug({ userId: user.id }, 'Socket disconnected');
    });
  });

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
