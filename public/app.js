const COLORS = ['#ff6ec7', '#7c4dff', '#00e5ff', '#76ff03', '#ffea00', '#ff9100'];
const EMOJIS = ['🎉', '🌈', '🦄', '🍕', '🚀', '🤖', '🐸', '🌮', '⭐', '💖'];
// Darker colors need white text to stay readable.
const DARK_COLORS = ['#7c4dff'];

let selectedEmoji = EMOJIS[0];
let selectedColor = COLORS[0];

const form = document.getElementById('message-form');
const messageInput = document.getElementById('message');
const charCount = document.getElementById('char-count');
const formError = document.getElementById('form-error');
const wall = document.getElementById('wall');
const dbStatus = document.getElementById('db-status');
const currentUser = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');

// If the session has expired, any API call returns 401: send the user back to the login page.
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await originalFetch(...args);
  if (res.status === 401) window.location.href = '/login.html';
  return res;
};

async function loadCurrentUser() {
  const res = await fetch('/api/me');
  if (res.ok) currentUser.textContent = (await res.json()).username;
}

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

function buildPicker(containerId, items, render, onPick) {
  const container = document.getElementById(containerId);
  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    render(btn, item);
    if (i === 0) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      onPick(item);
    });
    container.appendChild(btn);
  });
}

buildPicker('emoji-picker', EMOJIS,
  (btn, e) => { btn.textContent = e; btn.setAttribute('aria-label', e); },
  (e) => { selectedEmoji = e; });

buildPicker('color-picker', COLORS,
  (btn, c) => { btn.style.background = c; btn.setAttribute('aria-label', c); },
  (c) => { selectedColor = c; });

messageInput.addEventListener('input', () => {
  charCount.textContent = messageInput.value.length;
});

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function createNote(msg) {
  const note = document.createElement('article');
  note.className = 'note';
  note.style.background = msg.color;
  note.style.setProperty('--tilt', `${(Math.random() * 6 - 3).toFixed(1)}deg`);
  if (DARK_COLORS.includes(msg.color)) note.style.color = 'white';

  // textContent (not innerHTML) so user input can't inject HTML.
  const emoji = document.createElement('div');
  emoji.className = 'emoji';
  emoji.textContent = msg.emoji;

  const text = document.createElement('p');
  text.className = 'text';
  text.textContent = msg.message;

  const meta = document.createElement('div');
  meta.className = 'meta';

  const author = document.createElement('span');
  author.innerHTML = '<span class="author"></span> · <span class="when"></span>';
  author.querySelector('.author').textContent = msg.name;
  author.querySelector('.when').textContent = timeAgo(msg.created_at);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const likeBtn = document.createElement('button');
  likeBtn.textContent = `❤️ ${msg.likes}`;
  likeBtn.title = 'Like';
  likeBtn.addEventListener('click', async () => {
    const res = await fetch(`/api/messages/${msg.id}/like`, { method: 'POST' });
    if (res.ok) {
      const { likes } = await res.json();
      likeBtn.textContent = `❤️ ${likes}`;
      burstConfetti(likeBtn);
    }
  });

  const delBtn = document.createElement('button');
  delBtn.textContent = '✖';
  delBtn.title = 'Delete';
  delBtn.addEventListener('click', async () => {
    if (!confirm('Delete this note?')) return;
    const res = await fetch(`/api/messages/${msg.id}`, { method: 'DELETE' });
    if (res.ok) {
      note.remove();
      if (!wall.children.length) showEmpty();
    }
  });

  actions.append(likeBtn, delBtn);
  meta.append(author, actions);
  note.append(emoji, text, meta);
  return note;
}

function showEmpty() {
  wall.innerHTML = '<p class="empty">No vibes yet. Be the first! 🌟</p>';
}

async function loadMessages() {
  try {
    const res = await fetch('/api/messages');
    if (!res.ok) throw new Error();
    const messages = await res.json();
    wall.innerHTML = '';
    if (!messages.length) return showEmpty();
    messages.forEach((m) => wall.appendChild(createNote(m)));
  } catch {
    wall.innerHTML = '<p class="empty">Could not load messages 😢</p>';
  }
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok) {
      dbStatus.textContent = '✅ MySQL connected';
      dbStatus.className = 'status ok';
    } else {
      throw new Error(data.error);
    }
  } catch {
    dbStatus.textContent = '❌ Database not connected';
    dbStatus.className = 'status bad';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageInput.value,
        emoji: selectedEmoji,
        color: selectedColor,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    wall.querySelector('.empty')?.remove();
    wall.prepend(createNote(data));
    messageInput.value = '';
    charCount.textContent = '0';
    burstConfetti(submitBtn);
  } catch (err) {
    formError.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

// Tiny confetti burst, no libraries needed.
function burstConfetti(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement('div');
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 90;
    Object.assign(piece.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: '10px',
      height: '10px',
      background: COLORS[i % COLORS.length],
      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      pointerEvents: 'none',
      zIndex: 999,
    });
    document.body.appendChild(piece);
    piece.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + 60}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.4,1)' }
    ).onfinish = () => piece.remove();
  }
}

loadCurrentUser();
checkHealth();
loadMessages();
