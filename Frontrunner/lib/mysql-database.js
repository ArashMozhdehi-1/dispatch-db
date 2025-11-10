const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql',
  port: process.env.MYSQL_PORT || 3306,
  database: process.env.MYSQL_DATABASE || 'kmtsdb',
  user: process.env.MYSQL_USER || 'kmtsuser',
  password: process.env.MYSQL_PASSWORD || 'kmtspass',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000
});

const query = async (sql, params) => {
  const start = Date.now();
  try {
    const [rows] = await pool.execute(sql, params);
    const duration = Date.now() - start;
    console.log('📊 MySQL Query executed:', { sql: sql.substring(0, 100) + '...', duration, rows: rows.length });
    return { rows };
  } catch (error) {
    console.error('❌ MySQL query error:', error);
    throw error;
  }
};

module.exports = {
  query,
  pool
};