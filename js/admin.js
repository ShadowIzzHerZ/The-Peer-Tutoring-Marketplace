document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAdmin();
  if (!profile) return;

  async function renderStats() {
    const [{ data: users }, { data: requests }] = await Promise.all([
      sb.from('profiles').select('id').eq('is_admin', false),
      sb.from('requests').select('status'),
    ]);

    document.getElementById('stat-total-users').textContent = (users || []).length;
    document.getElementById('stat-total-requests').textContent = (requests || []).length;
    document.getElementById('stat-completed').textContent =
      (requests || []).filter((r) => r.status === 'completed').length;
    document.getElementById('stat-pending').textContent =
      (requests || []).filter((r) => r.status === 'pending').length;
  }

  async function renderUsersTable() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';

    const { data: users, error } = await sb.from('profiles').select('*').eq('is_admin', false);
    if (error || !users) return;

    for (const u of users) {
      const rating = await getAverageRating(u.id);
      const tr = document.createElement('tr');
      tr.className = 'border-b border-outline-variant last:border-0';
      tr.innerHTML = `
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${escapeHtml(u.name)}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(u.email)}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${(u.skills_teach || []).length}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${(u.skills_learn || []).length}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${rating ? rating.toFixed(1) : '—'}</td>
        <td class="py-2.5"><button type="button" class="px-3 py-1 border border-outline text-on-surface rounded-lg font-label-sm text-label-sm hover:bg-surface-container-low transition-all">${t('admin.remove')}</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => removeUser(u.id));
      tbody.appendChild(tr);
    }
  }

  async function renderRequestsTable() {
    const tbody = document.querySelector('#requests-table tbody');
    tbody.innerHTML = '';

    const { data: requests, error } = await sb
      .from('requests')
      .select(
        '*, from_profile:profiles!requests_from_user_id_fkey(name), to_profile:profiles!requests_to_user_id_fkey(name)'
      )
      .order('created_at', { ascending: false });

    if (error || !requests) return;

    requests.forEach((r) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-outline-variant last:border-0';
      tr.innerHTML = `
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${escapeHtml(r.from_profile ? r.from_profile.name : '—')}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${escapeHtml(r.to_profile ? r.to_profile.name : '—')}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface">${escapeHtml(r.skill)}</td>
        <td class="py-2.5 pr-4 font-body-sm text-body-sm text-on-surface-variant">${formatDate(r.proposed_date, r.proposed_time)}</td>
        <td class="py-2.5"><span class="${statusBadgeClass(r.status)}">${t('status.' + r.status)}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function removeUser(id) {
    if (!confirm(t('admin.removeConfirm'))) return;

    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) {
      showToast(error.message);
      return;
    }

    await Promise.all([renderStats(), renderUsersTable(), renderRequestsTable()]);
  }

  await Promise.all([renderStats(), renderUsersTable(), renderRequestsTable()]);
  document.addEventListener('zen:languagechange', () => {
    renderUsersTable();
    renderRequestsTable();
  });
});
