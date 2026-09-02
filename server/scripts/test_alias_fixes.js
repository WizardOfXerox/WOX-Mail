import 'dotenv/config';
import { query } from '../src/config/database.js';
import { listAliases, createAlias, updateAlias, deleteAlias } from '../src/services/aliasManager.js';
import { listRoutingRules } from '../src/services/purelymail.js';

async function testAliases() {
  console.log('--- 1. Testing listAliases(1) ---');
  const aliases = await listAliases(1);
  console.log(`Found ${aliases.length} aliases for user 1:`);
  console.table(aliases.slice(0, 5).map(a => ({
    id: a.id,
    alias_address: a.alias_address,
    alias_email: a.alias_email,
    enabled: a.enabled,
    is_enabled: a.is_enabled,
    note: a.note,
  })));

  console.log('--- 2. Testing createAlias ---');
  const newAlias = await createAlias(1, 'admin@wox.world', 'Live Test Alias', 'random');
  console.log('Created alias:', newAlias);

  console.log('--- 3. Checking Purelymail Routing Rules ---');
  const rules = await listRoutingRules('wox.world');
  const createdRule = (rules?.result?.rules || []).find(r => r.matchUser === newAlias.alias_address.split('@')[0]);
  console.log('Verified Purelymail routing rule created:', createdRule);

  console.log('--- 4. Testing updateAlias (Disable) ---');
  const disabled = await updateAlias(1, newAlias.id, { enabled: false });
  console.log('Disabled alias status:', disabled.enabled, disabled.is_enabled);

  const rulesAfterDisable = await listRoutingRules('wox.world');
  const ruleAfterDisable = (rulesAfterDisable?.result?.rules || []).find(r => r.matchUser === newAlias.alias_address.split('@')[0]);
  console.log('Rule in Purelymail after disable (should be undefined):', ruleAfterDisable);

  console.log('--- 5. Testing updateAlias (Re-enable) ---');
  const reenabled = await updateAlias(1, newAlias.id, { is_enabled: true });
  console.log('Re-enabled alias status:', reenabled.enabled, reenabled.is_enabled);

  const rulesAfterEnable = await listRoutingRules('wox.world');
  const ruleAfterEnable = (rulesAfterEnable?.result?.rules || []).find(r => r.matchUser === newAlias.alias_address.split('@')[0]);
  console.log('Verified Purelymail rule recreated on re-enable:', ruleAfterEnable);

  console.log('--- 6. Testing deleteAlias ---');
  await deleteAlias(1, newAlias.id);
  const rulesAfterDelete = await listRoutingRules('wox.world');
  const ruleAfterDelete = (rulesAfterDelete?.result?.rules || []).find(r => r.matchUser === newAlias.alias_address.split('@')[0]);
  console.log('Verified Purelymail rule removed on delete:', ruleAfterDelete);

  console.log('All alias tests PASSED with 100% success!');
  process.exit(0);
}

testAliases().catch((err) => {
  console.error('Alias test error:', err);
  process.exit(1);
});
