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
      tr.innerHTML = `
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${(u.skills_teach || []).length}</td>
        <td>${(u.skills_learn || []).length}</td>
        <td>${rating ? rating.toFixed(1) : '—'}</td>
        <td><button class="btn btn-outline btn-sm" type="button">Remove</button></td>
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
      tr.innerHTML = `
        <td>${escapeHtml(r.from_profile ? r.from_profile.name : '—')}</td>
        <td>${escapeHtml(r.to_profile ? r.to_profile.name : '—')}</td>
        <td>${escapeHtml(r.skill)}</td>
        <td>${formatDate(r.proposed_date, r.proposed_time)}</td>
        <td><span class="${statusBadgeClass(r.status)}">${r.status}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function removeUser(id) {
    if (!confirm('Remove this user from the marketplace? This cannot be undone.')) return;

    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) {
      showToast(error.message);
      return;
    }

    await Promise.all([renderStats(), renderUsersTable(), renderRequestsTable()]);
  }

  await Promise.all([renderStats(), renderUsersTable(), renderRequestsTable()]);
});
