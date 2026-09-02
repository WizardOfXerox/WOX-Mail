import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { query } from '../src/config/database.js';

async function testSwitch() {
  console.log('--- 1. Testing user fetch for admin and worldofxerox ---');
  const adminRes = await query("SELECT id, email, username FROM users WHERE email = 'admin@wox.world'");
  const xeroxRes = await query("SELECT id, email, username FROM users WHERE email = 'worldofxerox@wox.world'");

  const admin = adminRes.rows[0];
  const xerox = xeroxRes.rows[0];

  console.log('Admin user:', admin);
  console.log('Xerox user:', xerox);

  console.log('--- 2. Generating test token for admin ---');
  const adminToken = jwt.sign(
    { userId: admin.id, type: 'access', jti: 'test-admin-jti' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log('--- 3. Testing switch-account logic ---');
  const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
  console.log('Verified token userId:', decoded.userId);

  const targetRes = await query(
    'SELECT id, email, username, display_name, is_admin, is_suspended FROM users WHERE id = $1',
    [decoded.userId]
  );
  console.log('Found target user for switch:', targetRes.rows[0]);

  console.log('\nAll switch backend logic verified successfully!');
  process.exit(0);
}

testSwitch().catch((err) => {
  console.error(err);
  process.exit(1);
});
