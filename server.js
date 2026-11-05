require('dotenv').config();
const path = require('path');
const express = require('express');
const { initDb, getPool } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  const name = String(req.body.name || '').trim();
  const message = String(req.body.message || '').trim();
  const emoji = ALLOWED_EMOJIS.includes(req.body.emoji) ? req.body.emoji : '🎉';
  const color = ALLOWED_COLORS.includes(req.body.color) ? req.body.color : '#ff6ec7';

  if (!name || name.length > 50) {
    return res.status(400).json({ error: 'Name must be 1-50 characters' });
  }
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
