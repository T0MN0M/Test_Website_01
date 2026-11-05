const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};
const DB_NAME = process.env.DB_NAME || 'fun_test_site';

let pool;

// Creates the database + table if they don't exist yet, then opens a connection pool.
async function initDb() {
  if (!/^\w+$/.test(DB_NAME)) {
    throw new Error('DB_NAME may only contain letters, numbers, and underscores.');
  }

  const setup = await mysql.createConnection(config);
  await setup.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await setup.end();

  pool = mysql.createPool({ ...config, database: DB_NAME, connectionLimit: 10, charset: 'utf8mb4' });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(50)  NOT NULL,
      message    VARCHAR(280) NOT NULL,
      emoji      VARCHAR(16)  NOT NULL DEFAULT '🎉',
      color      VARCHAR(7)   NOT NULL DEFAULT '#ff6ec7',
      likes      INT          NOT NULL DEFAULT 0,
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Accounts. Passwords are never stored as plain text, only as a salted scrypt hash.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(30)  NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Login sessions. We store a SHA-256 hash of the cookie token, not the token itself.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64)  PRIMARY KEY,
      user_id    INT       NOT NULL,
      expires_at DATETIME  NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM messages');
  if (count === 0) {
    await pool.query(
      `INSERT INTO messages (name, message, emoji, color) VALUES
        ('Robo Bot', 'Welcome to the Good Vibes Wall! Leave a note!', '🤖', '#7c4dff'),
        ('Pizza Fan', 'This database is working! Pizza party time.', '🍕', '#ff9100')`
    );
  }
}

function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

module.exports = { initDb, getPool };
