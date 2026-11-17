function showRegisterError(message) {
  const banner = document.getElementById('register-error-banner');
  const text = document.getElementById('register-error-text');
  text.textContent = message;
  banner.classList.remove('hidden');
}

function hideRegisterError() {
  document.getElementById('register-error-banner').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getSessionProfile();
  if (profile) {
    window.location.href = 'dashboard.html';
    return;
  }

  const teach = setupChips(document.getElementById('addTeachInput'), document.getElementById('teachSkillsList'), []);
  const learn = setupChips(document.getElementById('addLearnInput'), document.getElementById('learnSkillsList'), []);
  document.getElementById('addTeachBtn').addEventListener('click', teach.get);
  document.getElementById('addLearnBtn').addEventListener('click', learn.get);

  const form = document.getElementById('register-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideRegisterError();

    const name = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const bio = document.getElementById('bio').value.trim();
    const skillsTeach = teach.get();
    const skillsLearn = learn.get();

    if (!name || !email || !password) {
      showRegisterError('Name, email and password are required.');
      return;
    }
    if (password.length < 6) {
      showRegisterError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showRegisterError('Passwords do not match.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60');

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { name, bio, skills_teach: skillsTeach, skills_learn: skillsLearn },
      },
    });

    let session = data && data.session;
    // DB trigger auto-confirms emails, so signing in right away works even when Confirm email is on.
    if (!error && !session) {
      const res = await sb.auth.signInWithPassword({ email, password });
      session = res.data && res.data.session;
    }

    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-60');

    if (error) {
      showRegisterError(error.message);
      return;
    }

    if (!session) {
      document.getElementById('displayEmail').textContent = email;
      document.getElementById('registrationState').classList.add('hidden');
      document.getElementById('confirmState').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    window.location.href = 'dashboard.html';
  });
});
