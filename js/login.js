function showLoginError(message) {
  const banner = document.getElementById('login-error-banner');
  const text = document.getElementById('login-error-text');
  text.textContent = message;
  banner.classList.remove('hidden');
}

function hideLoginError() {
  document.getElementById('login-error-banner').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getSessionProfile();
  if (profile) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60');

    const { error } = await sb.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-60');

    if (error) {
      showLoginError(error.message);
      return;
    }

    window.location.href = 'dashboard.html';
  });
});
