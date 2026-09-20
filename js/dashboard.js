document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAuth();
  if (!profile) return;

  document.getElementById('welcome-name').textContent = profile.name;
  document.getElementById('bio-text').textContent =
    profile.bio || 'No bio yet — add one on your profile page.';

  renderTagList('teach-tags', profile.skills_teach, 'teach');
  renderTagList('learn-tags', profile.skills_learn, 'learn');

  const [{ data: received }, { data: sent }] = await Promise.all([
    sb.from('requests').select('*').eq('to_user_id', profile.id),
    sb.from('requests').select('*').eq('from_user_id', profile.id),
  ]);

  const pendingReceived = (received || []).filter((r) => r.status === 'pending');
  const completed = (received || []).filter((r) => r.status === 'completed');

  document.getElementById('stat-pending').textContent = pendingReceived.length;
  document.getElementById('stat-sent').textContent = (sent || []).length;
  document.getElementById('stat-completed').textContent = completed.length;

  const avgRating = await getAverageRating(profile.id);
  document.getElementById('stat-rating').textContent = avgRating ? avgRating.toFixed(1) : '—';
});
