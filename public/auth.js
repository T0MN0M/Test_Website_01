const form = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmLabel = document.getElementById('confirm-label');
const confirmInput = document.getElementById('confirm');
const hint = document.getElementById('auth-hint');
const submitBtn = document.getElementById('auth-submit');
const errorEl = document.getElementById('auth-error');
const tabs = document.querySelectorAll('.tab');

let mode = 'login';

function setMode(newMode) {
  mode = newMode;
  const signup = mode === 'signup';
  tabs.forEach((t) => {
    const active = t.dataset.mode === mode;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  confirmLabel.hidden = !signup;
  confirmInput.required = signup;
  hint.hidden = !signup;
  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  submitBtn.textContent = signup ? 'Create account 🎉' : 'Log in 🚀';
  errorEl.textContent = '';
}

tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';

  if (mode === 'signup' && passwordInput.value !== confirmInput.value) {
    errorEl.textContent = 'Passwords do not match';
    return;
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch(mode === 'signup' ? '/api/signup' : '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    window.location.href = '/';
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});
