const mysql = require('mysql2/promise');
require('dotenv').config({ path: './env.local' });

let pool = null;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      database: process.env.MYSQL_DATABASE || 'frontrunner_db',
      user: process.env.MYSQL_USER || 'kmtsuser',
      password: process.env.MYSQL_PASSWORD || 'secret',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log('✅ MySQL connection pool created');
  }
  return pool;
};

const query = async (sql, params) => {
  const connection = await getPool().getConnection();
  try {
    const [results] = await connection.query(sql, params);
    return results;
  } catch (error) {
    console.error('❌ MySQL query error:', error);
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  query,
  getPool
};

