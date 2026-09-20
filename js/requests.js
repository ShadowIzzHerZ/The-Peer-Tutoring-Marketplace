document.addEventListener('DOMContentLoaded', async () => {
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
      document.getElementById(tab.dataset.target).classList.remove('hidden');
    });
  });

  async function loadReceived() {
    const { data, error } = await sb
      .from('requests')
      .select('*, from_profile:profiles!requests_from_user_id_fkey(name)')
      .eq('to_user_id', currentUser.id)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  async function loadSent() {
    const { data, error } = await sb
      .from('requests')
      .select('*, to_profile:profiles!requests_to_user_id_fkey(name)')
      .eq('from_user_id', currentUser.id)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  function makeActionButton(label, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = `btn ${cls} btn-sm`;
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buildRatingWidget(r) {
    const wrap = document.createElement('div');
    wrap.className = 'rating-widget';
    let selected = 0;

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '☆';
      star.addEventListener('click', () => {
        selected = i;
        wrap.querySelectorAll('.star').forEach((s, idx) => {
          s.textContent = idx < selected ? '★' : '☆';
        });
      });
      wrap.appendChild(star);
    }

    wrap.appendChild(
      makeActionButton('Submit Rating', 'btn-primary', () => {
        if (selected === 0) {
          showToast('Pick a star rating first.');
          return;
        }
        updateRequest(r.id, { rating: selected });
      })
    );
    return wrap;
  }

  function buildReceivedCard(r) {
    const card = document.createElement('div');
    card.className = 'card request-card';
    card.innerHTML = `
      <div class="request-card-header">
        <strong>${escapeHtml(r.from_profile ? r.from_profile.name : 'Unknown user')}</strong>
        <span class="${statusBadgeClass(r.status)}">${r.status}</span>
      </div>
      <p><strong>Skill:</strong> ${escapeHtml(r.skill)}</p>
      <p><strong>Proposed:</strong> ${formatDate(r.proposed_date, r.proposed_time)}</p>
      ${r.message ? `<p class="request-message">"${escapeHtml(r.message)}"</p>` : ''}
      <div class="request-actions"></div>
    `;

    const actions = card.querySelector('.request-actions');
    if (r.status === 'pending') {
      actions.appendChild(makeActionButton('Accept', 'btn-primary', () => updateRequest(r.id, { status: 'accepted' })));
      actions.appendChild(makeActionButton('Decline', 'btn-outline', () => updateRequest(r.id, { status: 'declined' })));
    } else if (r.status === 'accepted') {
      actions.appendChild(
        makeActionButton('Mark Completed', 'btn-primary', () => updateRequest(r.id, { status: 'completed' }))
      );
    }
    return card;
  }

  function buildSentCard(r) {
    const card = document.createElement('div');
    card.className = 'card request-card';
    card.innerHTML = `
      <div class="request-card-header">
        <strong>${escapeHtml(r.to_profile ? r.to_profile.name : 'Unknown user')}</strong>
        <span class="${statusBadgeClass(r.status)}">${r.status}</span>
      </div>
      <p><strong>Skill:</strong> ${escapeHtml(r.skill)}</p>
      <p><strong>Proposed:</strong> ${formatDate(r.proposed_date, r.proposed_time)}</p>
      ${r.message ? `<p class="request-message">"${escapeHtml(r.message)}"</p>` : ''}
      <div class="request-actions"></div>
    `;

    const actions = card.querySelector('.request-actions');
    if (r.status === 'pending') {
      actions.appendChild(makeActionButton('Cancel', 'btn-outline', () => updateRequest(r.id, { status: 'cancelled' })));
    } else if (r.status === 'completed' && r.rating == null) {
      actions.appendChild(buildRatingWidget(r));
    } else if (r.status === 'completed' && r.rating != null) {
      const p = document.createElement('p');
      p.className = 'rating-line';
      p.textContent = `You rated this session ${r.rating}/5`;
      actions.appendChild(p);
    }
    return card;
  }

  async function updateRequest(id, changes) {
    const { error } = await sb.from('requests').update(changes).eq('id', id);
    if (error) {
      showToast(error.message);
      return;
    }
    render();
  }

  async function render() {
    const receivedList = document.getElementById('received-list');
    const sentList = document.getElementById('sent-list');
    const receivedEmpty = document.getElementById('received-empty');
    const sentEmpty = document.getElementById('sent-empty');

    const [received, sent] = await Promise.all([loadReceived(), loadSent()]);

    receivedList.innerHTML = '';
    receivedEmpty.classList.toggle('hidden', received.length > 0);
    received.forEach((r) => receivedList.appendChild(buildReceivedCard(r)));

    sentList.innerHTML = '';
    sentEmpty.classList.toggle('hidden', sent.length > 0);
    sent.forEach((r) => sentList.appendChild(buildSentCard(r)));
  }

  render();
});
