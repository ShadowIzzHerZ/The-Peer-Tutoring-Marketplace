function splitTags(value) {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatDate(dateStr, timeStr) {
  if (!dateStr) return '—';
  return timeStr ? `${dateStr} at ${timeStr}` : dateStr;
}

function statusBadgeClass(status) {
  const base = 'inline-block px-2.5 py-0.5 rounded-full text-label-sm font-label-sm font-semibold capitalize';
  const variants = {
    pending: 'bg-status-pending-bg text-status-pending',
    accepted: 'bg-status-active-bg text-status-active',
    completed: 'bg-status-completed-bg text-status-completed',
    declined: 'bg-error-container text-on-error-container',
    cancelled: 'bg-error-container text-on-error-container',
  };
  return `${base} ${variants[status] || ''}`;
}

function renderTagList(containerId, tags, variant) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  const variantClass =
    variant === 'learn'
      ? 'bg-tag-learn-bg text-tag-learn-text border-tag-learn-border'
      : 'bg-tag-teach-bg text-tag-teach-text border-tag-teach-border';

  if (!tags || tags.length === 0) {
    el.innerHTML =
      '<span class="px-3 py-1 rounded-full border border-outline-variant bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm">None yet</span>';
    return;
  }

  tags.forEach((tag) => {
    const span = document.createElement('span');
    span.className = `px-3 py-1 rounded-full border text-label-sm font-label-sm font-medium ${variantClass}`;
    span.textContent = tag;
    el.appendChild(span);
  });
}

let toastTimer = null;
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

async function getAverageRating(userId) {
  const { data, error } = await sb
    .from('requests')
    .select('rating')
    .eq('to_user_id', userId)
    .eq('status', 'completed')
    .not('rating', 'is', null);

  if (error || !data || data.length === 0) return null;
  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return sum / data.length;
}
