document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAuth();
  if (!profile) return;

  const form = document.getElementById('profile-form');
  form.name.value = profile.name;
  form.email.value = (await sb.auth.getSession()).data.session.user.email;
  form.bio.value = profile.bio || '';
  const teach = setupChips(form.skillsTeach, document.getElementById('skillsTeachChips'), profile.skills_teach || []);
  const learn = setupChips(form.skillsLearn, document.getElementById('skillsLearnChips'), profile.skills_learn || []);

  const successEl = document.getElementById('profile-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    successEl.textContent = '';

    const { error } = await sb
      .from('profiles')
      .update({
        name: form.name.value.trim(),
        bio: form.bio.value.trim(),
        skills_teach: teach.get(),
        skills_learn: learn.get(),
      })
      .eq('id', profile.id);

    if (error) {
      successEl.classList.add('text-error');
      successEl.classList.remove('text-status-active');
      successEl.textContent = error.message;
      return;
    }

    successEl.classList.remove('text-error');
    successEl.classList.add('text-status-active');
    successEl.textContent = 'Profile updated.';
    window.location.href = 'dashboard.html';
  });

  const passwordForm = document.getElementById('password-form');
  const passwordError = document.getElementById('password-error');
  const passwordSuccess = document.getElementById('password-success');

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordError.textContent = '';
    passwordSuccess.textContent = '';

    const next = passwordForm.newPassword.value;
    const confirmNext = passwordForm.confirmNewPassword.value;

    if (next.length < 6) {
      passwordError.textContent = 'New password must be at least 6 characters.';
      return;
    }
    if (next !== confirmNext) {
      passwordError.textContent = 'Passwords do not match.';
      return;
    }

    const { error } = await sb.auth.updateUser({ password: next });
    if (error) {
      passwordError.textContent = error.message;
      return;
    }

    passwordForm.reset();
    passwordSuccess.textContent = 'Password changed.';
  });
});
