document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAuth();
  if (!profile) return;

  const form = document.getElementById('profile-form');
  form.name.value = profile.name;
  form.email.value = profile.email;
  form.bio.value = profile.bio || '';
  form.skillsTeach.value = (profile.skills_teach || []).join(', ');
  form.skillsLearn.value = (profile.skills_learn || []).join(', ');

  const successEl = document.getElementById('profile-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    successEl.textContent = '';

    const { error } = await sb
      .from('profiles')
      .update({
        name: form.name.value.trim(),
        bio: form.bio.value.trim(),
        skills_teach: splitTags(form.skillsTeach.value),
        skills_learn: splitTags(form.skillsLearn.value),
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
    setTimeout(() => {
      successEl.textContent = '';
    }, 2500);
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
