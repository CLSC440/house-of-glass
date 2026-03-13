const { Client } = require('pg');

module.exports = async function handler(req, res) {
  // Connect to the AWS database
  const client = new Client({
    connectionString: "postgresql://glass_admin:@Hadysalah1@18.185.48.10:5432/glass_system?sslmode=disable",
  });

  try {
    await client.connect();
    // Get the latest server resources update
    const result = await client.query('SELECT * FROM public.server_metrics ORDER BY id DESC LIMIT 1;');

    if(result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Failed to connect' });
  } finally {
    await client.end().catch(() => {});
  }
};