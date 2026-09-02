/**
 * @fileoverview Email Aliases routes — hide-my-email.
 * 5 endpoints for generating, managing, and deleting aliases.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as aliasManager from '../services/aliasManager.js';
import { getProtonAddresses } from '../services/protonServerSync.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/aliases
 * List all aliases for the current user.
 */
router.get('/', async (req, res, next) => {
  try {
    const aliases = await aliasManager.listAliases(req.user.id);
    
    // If user has a Proton email, append Proton aliases
    const userEmail = (req.user.email || '').toLowerCase();
    if (userEmail.includes('@proton.') || userEmail.includes('@pm.me')) {
      try {
        const protonRes = await getProtonAddresses(userEmail);
        if (protonRes?.addresses) {
          const existingAddrs = new Set(aliases.map((a) => (a.alias_address || a.address || '').toLowerCase()));
          for (const pa of protonRes.addresses) {
            if (!existingAddrs.has(pa.alias_address.toLowerCase())) {
              aliases.unshift(pa);
            }
          }
        }
      } catch (pErr) {
        // Fallback standard Proton aliases if session is asleep
        const username = userEmail.split('@')[0];
        const defaultProtonAliases = [
          {
            id: 'proton-pm',
            address: `${username}@pm.me`,
            alias_address: `${username}@pm.me`,
            alias_email: `${username}@pm.me`,
            note: 'Proton Short Alias (@pm.me)',
            source: 'proton',
            enabled: true,
            is_enabled: true,
            created_at: new Date().toISOString(),
          },
          {
            id: 'proton-com',
            address: `${username}@protonmail.com`,
            alias_address: `${username}@protonmail.com`,
            alias_email: `${username}@protonmail.com`,
            note: 'Proton Classic Alias (@protonmail.com)',
            source: 'proton',
            enabled: true,
            is_enabled: true,
            created_at: new Date().toISOString(),
          }
        ];
        const existingAddrs = new Set(aliases.map((a) => (a.alias_address || a.address || '').toLowerCase()));
        for (const pa of defaultProtonAliases) {
          if (!existingAddrs.has(pa.alias_address.toLowerCase())) {
            aliases.unshift(pa);
          }
        }
      }
    }

    res.json({ aliases });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/aliases/check-availability
 * Pre-flight check if a custom alias handle/address is available.
 * Query params: ?handle=xyz&domainChoice=main|subdomain
 */
router.get('/check-availability', async (req, res, next) => {
  try {
    const { handle, domainChoice = 'main' } = req.query;
    if (!handle) {
      return res.status(400).json({ available: false, reason: 'Handle is required' });
    }
    const result = await aliasManager.checkAliasAvailability(req.user.email, handle, domainChoice);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/aliases
 * Generate a new random or custom alias.
 */
router.post('/',
  validate({
    note: { type: 'string', max: 200 },
    style: { type: 'string', enum: ['random', 'words', 'subdomain', 'plus', 'custom'] },
    customHandle: { type: 'string', max: 64 },
    prefix: { type: 'string', max: 30 },
    domainChoice: { type: 'string', enum: ['main', 'subdomain'] },
  }),
  async (req, res, next) => {
    try {
      const alias = await aliasManager.createAlias(
        req.user.id,
        req.user.email,
        req.body.note || null,
        req.body.style || 'random',
        req.body.prefix || null,
        req.body.customHandle || null,
        req.body.domainChoice || 'main'
      );
      res.status(201).json({ alias });
    } catch (err) {
      if (
        err.message.includes('Maximum') ||
        err.message.includes('available') ||
        err.message.includes('characters') ||
        err.message.includes('reserved') ||
        err.message.includes('taken') ||
        err.message.includes('contain')
      ) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  }
);

/**
 * PUT /api/aliases/:id
 * Edit alias (note, enabled/disabled).
 */
router.put('/:id', async (req, res, next) => {
  try {
    const alias = await aliasManager.updateAlias(
      req.user.id,
      parseInt(req.params.id, 10),
      req.body
    );
    if (!alias) return res.status(404).json({ error: 'Alias not found' });
    res.json({ alias });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/aliases/:id
 * Remove alias and Purelymail routing rule.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await aliasManager.deleteAlias(req.user.id, parseInt(req.params.id, 10));
    if (!deleted) return res.status(404).json({ error: 'Alias not found' });
    res.json({ message: 'Alias deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/aliases/:id/stats
 * Per-alias stats (received count).
 */
router.get('/:id/stats', async (req, res, next) => {
  try {
    const stats = await aliasManager.getAliasStats(req.user.id, parseInt(req.params.id, 10));
    if (!stats) return res.status(404).json({ error: 'Alias not found' });
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

export default router;
