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
    card.className = 'card profile-card';

    const rating = ratingCache[u.id];
    const initials = u.name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    card.innerHTML = `
      <div class="profile-card-header">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div>
          <h3>${escapeHtml(u.name)}</h3>
          <div class="rating-line">${rating ? '⭐ ' + rating.toFixed(1) : 'No ratings yet'}</div>
        </div>
      </div>
      <p class="profile-bio">${escapeHtml(u.bio || 'No bio provided.')}</p>
      <div class="skill-block">
        <span class="skill-label">Can teach</span>
        <div class="tag-list">${
          (u.skills_teach || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join('') ||
          '<span class="tag tag-empty">None</span>'
        }</div>
      </div>
      <div class="skill-block">
        <span class="skill-label">Wants to learn</span>
        <div class="tag-list">${
          (u.skills_learn || [])
            .map((s) => `<span class="tag tag-outline">${escapeHtml(s)}</span>`)
            .join('') || '<span class="tag tag-empty">None</span>'
        }</div>
      </div>
      <button class="btn btn-primary request-btn" type="button">Request Session</button>
    `;

    card.querySelector('.request-btn').addEventListener('click', () => openRequestModal(u));
    return card;
  }

  function openRequestModal(tutor) {
    const modal = document.getElementById('request-modal');
    const form = document.getElementById('request-form');
    const skillSelect = form.skill;
    const titleEl = document.getElementById('request-modal-title');

    titleEl.textContent = `Request a session with ${tutor.name}`;
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

    const { error } = await sb.from('requests').insert({
      from_user_id: currentUser.id,
      to_user_id: tutorId,
      skill: form.skill.value,
      proposed_date: form.date.value || null,
      proposed_time: form.time.value || null,
      message: form.message.value.trim(),
    });

    submitBtn.disabled = false;

    if (error) {
      showToast(error.message);
      return;
    }

    closeRequestModal();
    showToast('Session request sent!');
  });

  searchInput.addEventListener('input', render);
  skillFilter.addEventListener('change', render);
  render();
});
