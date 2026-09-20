document.addEventListener('DOMContentLoaded', async () => {
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const searchInput = document.getElementById('search-input');
  const skillFilter = document.getElementById('skill-filter');
  const grid = document.getElementById('browse-grid');
  const emptyState = document.getElementById('browse-empty');

  const { data: profiles, error } = await sb
    .from('profiles')
    .select('*')
    .eq('is_admin', false)
    .neq('id', currentUser.id);

  if (error) {
    showToast('Could not load the marketplace.');
    return;
  }

  const ratingCache = {};
  await Promise.all(
    profiles.map(async (u) => {
      ratingCache[u.id] = await getAverageRating(u.id);
    })
  );

  const allSkills = Array.from(new Set(profiles.flatMap((u) => u.skills_teach || []))).sort();
  allSkills.forEach((skill) => {
    const opt = document.createElement('option');
    opt.value = skill;
    opt.textContent = skill;
    skillFilter.appendChild(opt);
  });

  function tagPills(skills, variant) {
    const cls =
      variant === 'learn'
        ? 'bg-tag-learn-bg text-tag-learn-text border-tag-learn-border'
        : 'bg-tag-teach-bg text-tag-teach-text border-tag-teach-border';
    if (!skills || skills.length === 0) {
      return `<span class="px-2.5 py-1 rounded-full border border-outline-variant bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm">${t('browse.none')}</span>`;
    }
    return skills
      .map(
        (s) =>
          `<span class="px-2.5 py-1 rounded-full border text-label-sm font-label-sm font-medium ${cls}">${escapeHtml(s)}</span>`
      )
      .join('');
  }

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const skill = skillFilter.value;

    const filtered = profiles.filter((u) => {
      const matchesSkill = !skill || (u.skills_teach || []).includes(skill);
      const haystack = [u.name, u.bio, ...(u.skills_teach || []), ...(u.skills_learn || [])]
        .join(' ')
        .toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesSkill && matchesQuery;
    });

    grid.innerHTML = '';
    emptyState.classList.toggle('hidden', filtered.length > 0);
    filtered.forEach((u) => grid.appendChild(buildProfileCard(u)));
  }

  function buildProfileCard(u) {
    const card = document.createElement('div');
    card.className =
      'custom-warm-card bg-surface-container-lowest border border-outline-variant rounded-xl p-space-lg flex flex-col justify-between';

    const rating = ratingCache[u.id];
    const initials = u.name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    card.innerHTML = `
      <div>
        <div class="flex items-center gap-space-sm mb-space-md">
          <div class="w-12 h-12 rounded-full bg-tag-teach-bg border border-outline-variant flex items-center justify-center font-headline-sm text-headline-sm font-bold text-tag-teach-text flex-shrink-0">${escapeHtml(initials)}</div>
          <div>
            <h3 class="font-headline-sm text-headline-sm text-on-surface">${escapeHtml(u.name)}</h3>
            <div class="font-body-sm text-body-sm text-secondary flex items-center gap-1">
              ${rating ? `<span class="material-symbols-outlined text-[16px] text-primary">star</span>${rating.toFixed(1)}` : t('browse.noRatingsYet')}
            </div>
          </div>
        </div>
        <p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md min-h-[40px]">${escapeHtml(u.bio) || t('browse.noBioProvided')}</p>
        <div class="mb-space-sm">
          <p class="font-label-sm text-label-sm text-on-primary-fixed-variant font-bold uppercase tracking-wider mb-1.5">${t('browse.canTeach')}</p>
          <div class="flex flex-wrap gap-1.5">${tagPills(u.skills_teach, 'teach')}</div>
        </div>
        <div class="mb-space-md">
          <p class="font-label-sm text-label-sm text-tag-learn-text font-bold uppercase tracking-wider mb-1.5">${t('browse.wantsToLearn')}</p>
          <div class="flex flex-wrap gap-1.5">${tagPills(u.skills_learn, 'learn')}</div>
        </div>
      </div>
      <button type="button" class="request-btn w-full py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-label-md text-label-md transition-all">${t('browse.requestSession')}</button>
    `;

    card.querySelector('.request-btn').addEventListener('click', () => openRequestModal(u));
    return card;
  }

  function openRequestModal(tutor) {
    const modal = document.getElementById('request-modal');
    const form = document.getElementById('request-form');
    const skillSelect = form.skill;
    const titleEl = document.getElementById('request-modal-title');

    titleEl.textContent = `${t('browse.requestSessionWith')} ${tutor.name}`;
    skillSelect.innerHTML = '';
    (tutor.skills_teach && tutor.skills_teach.length ? tutor.skills_teach : ['General']).forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      skillSelect.appendChild(opt);
    });
    form.dataset.tutorId = tutor.id;
    modal.classList.remove('hidden');
  }

  function closeRequestModal() {
    document.getElementById('request-modal').classList.add('hidden');
    document.getElementById('request-form').reset();
  }

  document.getElementById('modal-close').addEventListener('click', closeRequestModal);
  document.getElementById('request-modal').addEventListener('click', (e) => {
    if (e.target.id === 'request-modal') closeRequestModal();
  });

  document.getElementById('request-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const tutorId = form.dataset.tutorId;
    const submitBtn = form.querySelector('button[type="submit"]');

    submitBtn.disabled = true;

    const { error: insertError } = await sb.from('requests').insert({
      from_user_id: currentUser.id,
      to_user_id: tutorId,
      skill: form.skill.value,
      proposed_date: form.date.value || null,
      proposed_time: form.time.value || null,
      message: form.message.value.trim(),
    });

    submitBtn.disabled = false;

    if (insertError) {
      showToast(insertError.message);
      return;
    }

    closeRequestModal();
    showToast(t('browse.sessionRequestSent'));
  });

  searchInput.addEventListener('input', render);
  skillFilter.addEventListener('change', render);
  render();
  document.addEventListener('zen:languagechange', render);
});
