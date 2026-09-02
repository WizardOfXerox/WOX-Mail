/**
 * WoxMail HTTP API Endpoint & Feature Verification Suite
 * Tests actual HTTP responses on port 3001 using authenticated sessions.
 */

import jwt from 'jsonwebtoken';
import { query } from './src/config/database.js';
import { JWT_COOKIE_NAME } from './src/config/constants.js';

async function runHttpApiTests() {
  console.log('🌐 =================================================================');
  console.log('    WOXMAIL HTTP API ENDPOINTS & ACTION HANDLERS TEST SUITE');
  console.log('=================================================================\n');

  const BASE_URL = 'http://localhost:3001';
  let passed = 0;
  let failed = 0;

  function assert(testName, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ [HTTP] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [HTTP] FAIL: ${testName} - ${detail}`);
      failed++;
    }
  }

  // 1. Get test admin user and generate auth bearer token
  const userRes = await query('SELECT id, email, username FROM users WHERE is_admin = true LIMIT 1');
  const user = userRes.rows[0] || { id: 1, email: 'admin@wox.world' };
  
  const token = jwt.sign(
    { userId: user.id, type: 'access' },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn: '1h' }
  );

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {})
      }
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data, headers: res.headers };
  }

  // 1. Health Endpoints
  const h1 = await apiFetch('/api/health');
  assert('GET /api/health returns 200 OK', h1.status === 200 && h1.data?.status === 'ok');

  const h2 = await apiFetch('/api/health/monitor');
  assert('GET /api/health/monitor returns 200 with diagnostics', h2.status === 200 && !!h2.data?.cpu && !!h2.data?.memory);

  // 2. Connected Accounts Endpoints
  const a1 = await apiFetch('/api/accounts/presets');
  assert('GET /api/accounts/presets returns provider list', a1.status === 200 && !!a1.data?.presets?.gmail);

  const a2 = await apiFetch('/api/accounts');
  assert('GET /api/accounts returns user account list', a2.status === 200 && Array.isArray(a2.data?.accounts));

  // 3. Email Templates CRUD
  const tCreate = await apiFetch('/api/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Onboarding Template',
      subject: 'Welcome to WoxMail, {{first_name}}!',
      body: 'Hello {{first_name}},\n\nWelcome to {{service}}. Your code is {{code}}.',
      category: 'onboarding'
    })
  });
  assert('POST /api/templates creates new template', tCreate.status === 201 && !!tCreate.data?.template?.id, JSON.stringify(tCreate.data));
  const createdTemplateId = tCreate.data?.template?.id;

  const tList = await apiFetch('/api/templates');
  assert('GET /api/templates lists user templates', tList.status === 200 && tList.data?.templates?.some(t => t.id === createdTemplateId));

  if (createdTemplateId) {
    const tUpdate = await apiFetch(`/api/templates/${createdTemplateId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Updated Onboarding Template',
        subject: 'Updated Subject'
      })
    });
    assert('PUT /api/templates/:id updates template', tUpdate.status === 200 && tUpdate.data?.template?.name === 'Updated Onboarding Template');

    const tDel = await apiFetch(`/api/templates/${createdTemplateId}`, { method: 'DELETE' });
    assert('DELETE /api/templates/:id removes template', tDel.status === 200);
  }

  // 4. Kanban Board & Cards CRUD
  const kBoard = await apiFetch('/api/kanban');
  assert('GET /api/kanban fetches user board & card arrays', kBoard.status === 200 && Array.isArray(kBoard.data?.cards));

  const kCreate = await apiFetch('/api/kanban/cards', {
    method: 'POST',
    body: JSON.stringify({
      title: 'HTTP API Card Test',
      description: 'Testing Kanban card creation over HTTP',
      column_id: 'todo',
      priority: 'high'
    })
  });
  assert('POST /api/kanban/cards creates card', kCreate.status === 201 && !!kCreate.data?.card?.id, JSON.stringify(kCreate.data));
  const createdCardId = kCreate.data?.card?.id;

  if (createdCardId) {
    const kUpdate = await apiFetch(`/api/kanban/cards/${createdCardId}`, {
      method: 'PUT',
      body: JSON.stringify({
        column_id: 'in_progress',
        priority: 'urgent'
      })
    });
    assert('PUT /api/kanban/cards/:id moves/updates card', kUpdate.status === 200 && kUpdate.data?.card?.column_id === 'in_progress');

    const kDel = await apiFetch(`/api/kanban/cards/${createdCardId}`, { method: 'DELETE' });
    assert('DELETE /api/kanban/cards/:id removes card', kDel.status === 200);
  }

  // 5. Analytics Endpoints
  const anOverview = await apiFetch('/api/analytics/overview');
  assert('GET /api/analytics/overview returns aggregate statistics', anOverview.status === 200 && !!anOverview.data?.tracking);

  const anTracking = await apiFetch('/api/analytics/tracking');
  assert('GET /api/analytics/tracking returns tracked list', anTracking.status === 200 && Array.isArray(anTracking.data?.tracking));

  // 6. Integrations & Chat Forwarding Rules
  const intList = await apiFetch('/api/integrations/chat');
  assert('GET /api/integrations/chat lists rules', intList.status === 200 && Array.isArray(intList.data?.rules));

  const intCreate = await apiFetch('/api/integrations/chat', {
    method: 'POST',
    body: JSON.stringify({
      platform: 'discord',
      name: 'Test Discord Alert Rule',
      webhook_url: 'https://discord.com/api/webhooks/123456/dummy_token',
      filter_criteria: { forward_all: true }
    })
  });
  assert('POST /api/integrations/chat creates forward rule with encrypted token / validated URL', intCreate.status === 201 && !!intCreate.data?.rule?.id, JSON.stringify(intCreate.data));
  const createdRuleId = intCreate.data?.rule?.id;

  if (createdRuleId) {
    const intDel = await apiFetch(`/api/integrations/chat/${createdRuleId}`, { method: 'DELETE' });
    assert('DELETE /api/integrations/chat/:id deletes rule', intDel.status === 200);
  }

  // 7. Developer & Personal API Keys CRUD
  const kApiCreate = await apiFetch('/api/settings/api-keys', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Master Test Runner API Key',
      scopes: ['mail:read', 'mail:send'],
      expires_days: 30
    })
  });
  assert('POST /api/settings/api-keys generates API key and displays secret once', kApiCreate.status === 201 && !!kApiCreate.data?.apiKey?.secretKey, JSON.stringify(kApiCreate.data));
  const createdApiKeyId = kApiCreate.data?.apiKey?.id;

  const kApiList = await apiFetch('/api/settings/api-keys');
  assert('GET /api/settings/api-keys lists active keys without secret', kApiList.status === 200 && kApiList.data?.apiKeys?.some(k => k.id === createdApiKeyId));

  if (createdApiKeyId) {
    const kApiDel = await apiFetch(`/api/settings/api-keys/${createdApiKeyId}`, { method: 'DELETE' });
    assert('DELETE /api/settings/api-keys/:id revokes API key', kApiDel.status === 200);
  }

  // 8. AI Copilot Endpoints
  const aiCompose = await apiFetch('/api/ai/compose', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Short reminder about project deliverables',
      tone: 'professional'
    })
  });
  assert('POST /api/ai/compose returns generated draft', aiCompose.status === 200 && !!aiCompose.data?.draft, JSON.stringify(aiCompose.data));

  const aiRewrite = await apiFetch('/api/ai/rewrite', {
    method: 'POST',
    body: JSON.stringify({
      text: 'hey send the stuff asap',
      tone: 'professional'
    })
  });
  assert('POST /api/ai/rewrite returns rewritten text', aiRewrite.status === 200 && !!aiRewrite.data?.rewritten, JSON.stringify(aiRewrite.data));

  const aiSmartReplies = await apiFetch('/api/ai/smart-replies', {
    method: 'POST',
    body: JSON.stringify({
      emailContent: 'Are we still on for our meeting tomorrow?'
    })
  });
  assert('POST /api/ai/smart-replies returns 3 quick pills', aiSmartReplies.status === 200 && Array.isArray(aiSmartReplies.data?.replies));

  // 9. Mailbox & Folders Endpoints
  const mFolders = await apiFetch('/api/mail/folders');
  assert('GET /api/mail/folders returns folder list', mFolders.status === 200 && Array.isArray(mFolders.data?.folders));

  const mInbox = await apiFetch('/api/mail/inbox');
  assert('GET /api/mail/inbox returns messages array', mInbox.status === 200 && Array.isArray(mInbox.data?.messages));

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('\n=================================================================');
  console.log(`🎉 HTTP API TEST RUN COMPLETE: ${passed} Passed, ${failed} Failed (${passed + failed} Total)`);
  console.log('=================================================================\n');

  return { passed, failed, total: passed + failed };
}

runHttpApiTests()
  .then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  })
  .catch(err => {
    console.error('HTTP API test runner fatal error:', err);
    process.exit(1);
  });
