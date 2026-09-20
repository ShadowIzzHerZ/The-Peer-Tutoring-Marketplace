function makeSkillPill(text, variant, onRemove) {
  const bg = variant === 'teach' ? 'bg-tag-teach-bg text-tag-teach-text border-tag-teach-border' : 'bg-tag-learn-bg text-tag-learn-text border-tag-learn-border';
  const pill = document.createElement('span');
  pill.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-label-md font-label-md ${bg}`;
  pill.dataset.value = text;

  const label = document.createElement('span');
  label.textContent = text;
  pill.appendChild(label);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'hover:opacity-70 transition-opacity';
  removeBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">close</span>';
  removeBtn.addEventListener('click', () => {
    pill.remove();
    onRemove();
  });
  pill.appendChild(removeBtn);

  return pill;
}

function setupSkillInput(inputId, btnId, listId, variant) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const list = document.getElementById(listId);

  function addSkill() {
    const text = input.value.trim();
    if (!text) return;
    const existing = Array.from(list.children).map((el) => el.dataset.value.toLowerCase());
    if (existing.includes(text.toLowerCase())) {
      input.value = '';
      return;
    }
    list.appendChild(makeSkillPill(text, variant, () => {}));
    input.value = '';
  }

  btn.addEventListener('click', addSkill);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSkill();
    }
  });
}

function getSkillValues(listId) {
  return Array.from(document.getElementById(listId).children).map((el) => el.dataset.value);
}

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

  setupSkillInput('addTeachInput', 'addTeachBtn', 'teachSkillsList', 'teach');
  setupSkillInput('addLearnInput', 'addLearnBtn', 'learnSkillsList', 'learn');

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
    const skillsTeach = getSkillValues('teachSkillsList');
    const skillsLearn = getSkillValues('learnSkillsList');

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

    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-60');

    if (error) {
      showRegisterError(error.message);
      return;
    }

    if (!data.session) {
      document.getElementById('displayEmail').textContent = email;
      document.getElementById('registrationState').classList.add('hidden');
      document.getElementById('confirmState').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    window.location.href = 'dashboard.html';
  });
});
