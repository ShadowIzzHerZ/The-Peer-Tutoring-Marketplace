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

// One query for every user's average rating: { userId: average }.
async function getAverageRatings() {
  const { data } = await sb
    .from('requests')
    .select('to_user_id, rating')
    .eq('status', 'completed')
    .not('rating', 'is', null);
  const sums = {};
  (data || []).forEach((r) => {
    const s = (sums[r.to_user_id] = sums[r.to_user_id] || { n: 0, total: 0 });
    s.n += 1;
    s.total += r.rating;
  });
  return Object.fromEntries(Object.entries(sums).map(([id, s]) => [id, s.total / s.n]));
}

// Turns a text input into a chip input: comma or Enter commits the typed skill as a removable block.
function setupChips(input, box, initial) {
  const items = [];
  const render = () => {
    box.innerHTML = '';
    items.forEach((t, i) => {
      const chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-outline-variant bg-surface-container text-label-md';
      chip.textContent = t;
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.addEventListener('click', () => { items.splice(i, 1); render(); });
      chip.appendChild(x);
      box.appendChild(chip);
    });
  };
  const commit = (text) => {
    const t = text.trim();
    if (t && !items.some((s) => s.toLowerCase() === t.toLowerCase())) items.push(t);
    render();
  };
  initial.forEach(commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      commit(input.value);
      input.value = '';
    } else if (e.key === 'Backspace' && !input.value && items.length) {
      items.pop();
      render();
    }
  });
  input.addEventListener('input', () => {
    if (input.value.includes(',')) {
      input.value.split(',').slice(0, -1).forEach(commit);
      input.value = input.value.split(',').pop();
    }
  });
  return { get: () => { commit(input.value); input.value = ''; return items.slice(); } };
}

