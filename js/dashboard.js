document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAuth();
  if (!profile) return;

  document.getElementById('welcome-name').textContent = profile.name;
  document.getElementById('profile-name').textContent = profile.name;
  document.getElementById('bio-text').textContent =
    profile.bio || 'No bio yet — add one on your profile page.';

  const initials = profile.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  document.getElementById('avatar-initials').textContent = initials;

  renderTagList('teach-tags', profile.skills_teach, 'teach');
  renderTagList('learn-tags', profile.skills_learn, 'learn');

  const [{ data: received }, { data: sent }] = await Promise.all([
    sb
      .from('requests')
      .select('*, from_profile:profiles!requests_from_user_id_fkey(name)')
      .eq('to_user_id', profile.id)
      .order('created_at', { ascending: false }),
    sb.from('requests').select('*').eq('from_user_id', profile.id),
  ]);

  const pendingReceived = (received || []).filter((r) => r.status === 'pending');
  const completed = (received || []).filter((r) => r.status === 'completed');

  document.getElementById('stat-pending').textContent = pendingReceived.length;
  document.getElementById('stat-sent').textContent = (sent || []).length;
  document.getElementById('stat-completed').textContent = completed.length;

  const avgRating = await getAverageRating(profile.id);
  document.getElementById('stat-rating').textContent = avgRating ? avgRating.toFixed(1) : '—';

  const listEl = document.getElementById('recent-received-list');
  const emptyEl = document.getElementById('recent-received-empty');
  const recent = (received || []).slice(0, 3);

  emptyEl.classList.toggle('hidden', recent.length > 0);
  listEl.innerHTML = '';
  recent.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'bg-surface-container-low p-space-md rounded-lg border border-outline-variant flex items-center justify-between gap-space-sm';
    row.innerHTML = `
      <div>
        <p class="font-label-md text-label-md text-on-surface">${escapeHtml(r.from_profile ? r.from_profile.name : 'Unknown user')}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(r.skill)} · ${formatDate(r.proposed_date, r.proposed_time)}</p>
      </div>
      <span class="${statusBadgeClass(r.status)}">${r.status}</span>
    `;
    listEl.appendChild(row);
  });
});
