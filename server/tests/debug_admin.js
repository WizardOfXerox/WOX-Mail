import { apiRequest } from './test_helper.js';

async function check() {
  const adminPassword = (process.env.ADMIN_PASSWORD || 'woxmail_admin_secret_2026').replace(/^['"]|['"]$/g, '');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@wox.world';
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword },
  });
  console.log('Login status:', loginRes.status);
  const token = loginRes.body.token;
  const res = await apiRequest('/api/admin/invites', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { count: 1, expiresInDays: 30, note: 'Test' },
  });
  console.log('Invites status:', res.status, res.body);
  process.exit(0);
}

check();
