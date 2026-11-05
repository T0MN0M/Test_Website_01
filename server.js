require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { initDb, getPool } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 7;

// ---------- Password + session helpers ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await getPool().execute(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)',
    [sha256(token), userId, SESSION_DAYS]
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// Attaches req.user if the visitor has a valid session cookie.
async function loadUser(req, res, next) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return next();
  try {
    const [[row]] = await getPool().execute(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > NOW()`,
      [sha256(token)]
    );
    if (row) req.user = row;
  } catch (err) {
    console.error(err);
  }
  next();
}

// Everything except these paths requires being logged in.
const PUBLIC_PATHS = new Set(['/login.html', '/auth.js', '/style.css', '/api/health', '/api/signup', '/api/login']);

function requireLogin(req, res, next) {
  if (req.user) {
    if (req.path === '/login.html') return res.redirect('/');
    return next();
  }
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please log in first' });
  res.redirect('/login.html');
}

app.use(express.json());
app.use(loadUser);
app.use(requireLogin);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth routes ----------

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

app.post('/api/signup', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 letters, numbers, or underscores' });
  }
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [result] = await getPool().execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );
    await startSession(res, result.insertId);
    res.status(201).json({ username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  try {
    const [[user]] = await getPool().execute(
      'SELECT id, username, password_hash FROM users WHERE username = ?',
      [username]
    );
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    await getPool().query('DELETE FROM sessions WHERE expires_at <= NOW()');
    await startSession(res, user.id);
    res.json({ username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in' });
  }
});

app.post('/api/logout', async (req, res) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) {
    await getPool().execute('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]).catch(console.error);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

app.get('/api/me', (req, res) => {
  res.json({ username: req.user.username });
});

// ---------- Message routes ----------

const ALLOWED_COLORS = ['#ff6ec7', '#7c4dff', '#00e5ff', '#76ff03', '#ffea00', '#ff9100'];
const ALLOWED_EMOJIS = ['🎉', '🌈', '🦄', '🍕', '🚀', '🤖', '🐸', '🌮', '⭐', '💖'];

// Health check: lets the page show whether the database is connected.
app.get('/api/health', async (req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'disconnected', error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, name, message, emoji, color, likes, created_at FROM messages ORDER BY created_at DESC, id DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  // Notes are signed with the logged-in username, so nobody can post as someone else.
  const name = req.user.username;
  const message = String(req.body.message || '').trim();
  const emoji = ALLOWED_EMOJIS.includes(req.body.emoji) ? req.body.emoji : '🎉';
  const color = ALLOWED_COLORS.includes(req.body.color) ? req.body.color : '#ff6ec7';

  if (!message || message.length > 280) {
    return res.status(400).json({ error: 'Message must be 1-280 characters' });
  }

  try {
    const [result] = await getPool().execute(
      'INSERT INTO messages (name, message, emoji, color) VALUES (?, ?, ?, ?)',
      [name, message, emoji, color]
    );
    const [[row]] = await getPool().execute('SELECT * FROM messages WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save message' });
  }
});

app.post('/api/messages/:id/like', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' });
  try {
    const [result] = await getPool().execute('UPDATE messages SET likes = likes + 1 WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    const [[row]] = await getPool().execute('SELECT likes FROM messages WHERE id = ?', [id]);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not like message' });
  }
});

app.delete('/api/messages/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' });
  try {
    await getPool().execute('DELETE FROM messages WHERE id = ?', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete message' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`🎉 Server running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('\n❌ Could not connect to MySQL:', err.message);
    console.error('   Check DB_USER / DB_PASSWORD in your .env file and that the MySQL80 service is running.\n');
    process.exit(1);
  });
