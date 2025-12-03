
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.NEON_DB_URL,
  ssl: { rejectUnauthorized: false }
});
module.exports = pool;
