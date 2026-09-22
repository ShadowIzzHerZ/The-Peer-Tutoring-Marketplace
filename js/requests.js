document.addEventListener('DOMContentLoaded', async () => {
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const tabs = document.querySelectorAll('.tab-btn');
  const activeClasses = ['text-primary', 'border-primary'];
  const inactiveClasses = ['text-on-surface-variant', 'border-transparent'];

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove(...activeClasses);
        t.classList.add(...inactiveClasses);
      });
      tab.classList.remove(...inactiveClasses);
      tab.classList.add(...activeClasses);

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

  function makeActionButton(label, variant, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className =
      variant === 'primary'
        ? 'px-3 py-1.5 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-label-sm text-label-sm transition-all'
        : 'px-3 py-1.5 border border-outline text-on-surface rounded-lg font-label-sm text-label-sm hover:bg-surface-container-low transition-all';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buildRatingWidget(r) {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-2';
    let selected = 0;

    const starsWrap = document.createElement('div');
    starsWrap.className = 'flex items-center gap-0.5';
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '☆';
      star.addEventListener('click', () => {
        selected = i;
        starsWrap.querySelectorAll('.star').forEach((s, idx) => {
          s.textContent = idx < selected ? '★' : '☆';
        });
      });
      starsWrap.appendChild(star);
    }
    wrap.appendChild(starsWrap);

    wrap.appendChild(
      makeActionButton(t('requests.submitRating'), 'primary', () => {
        if (selected === 0) {
          showToast(t('requests.pickStarFirst'));
          return;
        }
        updateRequest(r.id, { rating: selected });
      })
    );
    return wrap;
  }

  function buildCard(r, otherName, actionsBuilder) {
    const card = document.createElement('div');
    card.className = 'bg-surface-container-lowest border border-outline-variant rounded-xl p-space-lg';
    card.innerHTML = `
      <div class="flex items-center justify-between mb-space-sm">
        <strong class="font-headline-sm text-headline-sm text-on-surface">${escapeHtml(otherName)}</strong>
        <span class="${statusBadgeClass(r.status)}">${t('status.' + r.status)}</span>
      </div>
      <p class="font-body-md text-body-md text-on-surface"><strong>${t('admin.skill')}:</strong> ${escapeHtml(r.skill)}</p>
      <p class="font-body-md text-body-md text-on-surface-variant"><strong>${t('admin.proposed')}:</strong> ${formatDate(r.proposed_date, r.proposed_time)}</p>
      ${r.message ? `<p class="font-body-sm text-body-sm text-on-surface-variant italic mt-1">"${escapeHtml(r.message)}"</p>` : ''}
      <div class="request-actions flex items-center gap-2 mt-space-md flex-wrap"></div>
    `;

    const actions = card.querySelector('.request-actions');
    actionsBuilder(actions);
    return card;
  }

  function makeMessageButton(peerId) {
    return makeActionButton(t('requests.message'), 'outline', () => {
      window.location.href = `messages.html?to=${peerId}`;
    });
  }

  function buildReceivedCard(r) {
    return buildCard(r, r.from_profile ? r.from_profile.name : 'Unknown user', (actions) => {
      if (r.status === 'pending') {
        actions.appendChild(makeActionButton(t('requests.accept'), 'primary', () => updateRequest(r.id, { status: 'accepted' })));
        actions.appendChild(makeActionButton(t('requests.decline'), 'outline', () => updateRequest(r.id, { status: 'declined' })));
      } else if (r.status === 'accepted') {
        actions.appendChild(
          makeActionButton(t('requests.markCompleted'), 'primary', () => updateRequest(r.id, { status: 'completed' }))
        );
      }
      actions.appendChild(makeMessageButton(r.from_user_id));
    });
  }

  function buildSentCard(r) {
    return buildCard(r, r.to_profile ? r.to_profile.name : 'Unknown user', (actions) => {
      if (r.status === 'pending') {
        actions.appendChild(makeActionButton(t('requests.cancel'), 'outline', () => updateRequest(r.id, { status: 'cancelled' })));
      } else if (r.status === 'completed' && r.rating == null) {
        actions.appendChild(buildRatingWidget(r));
      } else if (r.status === 'completed' && r.rating != null) {
        const p = document.createElement('p');
        p.className = 'font-body-sm text-body-sm text-on-surface-variant';
        p.textContent = `${t('requests.youRated')} ${r.rating}/5`;
        actions.appendChild(p);
      }
      actions.appendChild(makeMessageButton(r.to_user_id));
    });
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
  document.addEventListener('zen:languagechange', render);
});
