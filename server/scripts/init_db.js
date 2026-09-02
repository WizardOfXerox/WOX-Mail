import pg from 'pg';

async function init() {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });

  await client.connect();
  console.log('Connected to PostgreSQL as postgres');

  try {
    await client.query("CREATE USER woxmail WITH PASSWORD 'woxmail'");
    console.log('✓ Created user woxmail');
  } catch (err) {
    if (err.code === '42710') {
      console.log('✓ User woxmail already exists');
    } else {
      console.log('User note:', err.message);
    }
  }

  try {
    await client.query('CREATE DATABASE woxmail OWNER woxmail');
    console.log('✓ Created database woxmail');
  } catch (err) {
    if (err.code === '42P04') {
      console.log('✓ Database woxmail already exists');
    } else {
      console.log('Database note:', err.message);
    }
  }

  await client.query('GRANT ALL PRIVILEGES ON DATABASE woxmail TO woxmail');
  console.log('✓ Granted privileges on woxmail to woxmail');
  await client.end();
}

init().catch((err) => {
  console.error('Init DB error:', err);
  process.exit(1);
});
