document.addEventListener('DOMContentLoaded', async () => {
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const conversationList = document.getElementById('conversation-list');
  const conversationsEmpty = document.getElementById('conversations-empty');
  const peerSearchInput = document.getElementById('peer-search-input');
  const peerSearchResults = document.getElementById('peer-search-results');
  const chatEmpty = document.getElementById('chat-empty');
  const chatPanel = document.getElementById('chat-panel');
  const chatPeerName = document.getElementById('chat-peer-name');
  const chatPeerInitials = document.getElementById('chat-peer-initials');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  const profiles = {};
  let activePeerId = null;
  let conversations = [];

  function initials(name) {
    return (name || '?')
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  async function fetchProfile(id) {
    if (profiles[id]) return profiles[id];
    const { data } = await sb.from('profiles').select('id, name').eq('id', id).single();
    if (data) profiles[id] = data;
    return data;
  }

  async function loadConversations() {
    const { data, error } = await sb
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error || !data) return [];

    const map = new Map();
    data.forEach((m) => {
      const peerId = m.sender_id === currentUser.id ? m.recipient_id : m.sender_id;
      if (!map.has(peerId)) {
        map.set(peerId, { peerId, lastMessage: m.content, lastAt: m.created_at, unread: 0 });
      }
      if (m.recipient_id === currentUser.id && !m.read_at) {
        map.get(peerId).unread += 1;
      }
    });

    await Promise.all(Array.from(map.keys()).map(fetchProfile));
    return Array.from(map.values());
  }

  function renderConversations() {
    conversationList.innerHTML = '';
    conversationsEmpty.classList.toggle('hidden', conversations.length > 0);

    conversations
      .slice()
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
      .forEach((c) => {
        const p = profiles[c.peerId];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `w-full text-left flex items-center gap-space-sm p-space-sm rounded-lg transition-colors ${
          c.peerId === activePeerId ? 'bg-surface-container-low' : 'hover:bg-surface-container-low'
        }`;
        btn.innerHTML = `
          <div class="w-10 h-10 rounded-full bg-tag-teach-bg border border-outline-variant flex items-center justify-center font-label-md text-label-md font-bold text-tag-teach-text flex-shrink-0">${escapeHtml(initials(p && p.name))}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-label-md text-label-md text-on-surface truncate">${escapeHtml(p ? p.name : '...')}</span>
              ${c.unread > 0 ? `<span class="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">${c.unread}</span>` : ''}
            </div>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${escapeHtml(c.lastMessage)}</p>
          </div>
        `;
        btn.addEventListener('click', () => openConversation(c.peerId));
        conversationList.appendChild(btn);
      });
  }

  function buildBubble(m) {
    const mine = m.sender_id === currentUser.id;
    const wrap = document.createElement('div');
    wrap.className = `flex ${mine ? 'justify-end' : 'justify-start'}`;
    wrap.innerHTML = `
      <div class="max-w-[75%] px-space-md py-2 rounded-xl ${
        mine ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container-low text-on-surface rounded-bl-sm'
      }">
        <p class="font-body-sm text-body-sm whitespace-pre-wrap break-words">${escapeHtml(m.content)}</p>
      </div>
    `;
    return wrap;
  }

  async function loadThread(peerId) {
    const { data, error } = await sb
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true });
    if (error || !data) return;

    chatMessages.innerHTML = '';
    data.forEach((m) => chatMessages.appendChild(buildBubble(m)));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function markRead(peerId) {
    await sb
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', peerId)
      .eq('recipient_id', currentUser.id)
      .is('read_at', null);

    const c = conversations.find((x) => x.peerId === peerId);
    if (c) c.unread = 0;
    renderConversations();
  }

  async function openConversation(peerId) {
    activePeerId = peerId;
    peerSearchInput.value = '';
    peerSearchResults.classList.add('hidden');
    history.replaceState(null, '', `messages.html?to=${peerId}`);

    const p = await fetchProfile(peerId);
    chatEmpty.classList.add('hidden');
    chatPanel.classList.remove('hidden');
    chatPeerName.textContent = p ? p.name : '...';
    chatPeerInitials.textContent = initials(p && p.name);

    renderConversations();
    await loadThread(peerId);
    await markRead(peerId);
    chatInput.focus();
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = chatInput.value.trim();
    if (!content || !activePeerId) return;
    chatInput.value = '';

    const { data, error } = await sb
      .from('messages')
      .insert({ sender_id: currentUser.id, recipient_id: activePeerId, content })
      .select()
      .single();

    if (error) {
      showToast(error.message);
      return;
    }

    chatMessages.appendChild(buildBubble(data));
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let c = conversations.find((x) => x.peerId === activePeerId);
    if (!c) {
      c = { peerId: activePeerId, unread: 0 };
      conversations.push(c);
    }
    c.lastMessage = content;
    c.lastAt = data.created_at;
    renderConversations();
  });

  let searchDebounce = null;
  peerSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = peerSearchInput.value.trim();
    if (!q) {
      peerSearchResults.classList.add('hidden');
      return;
    }
    searchDebounce = setTimeout(async () => {
      const { data } = await sb
        .from('profiles')
        .select('id, name')
        .neq('id', currentUser.id)
        .ilike('name', `%${q}%`)
        .limit(8);

      peerSearchResults.innerHTML = '';
      if (!data || data.length === 0) {
        peerSearchResults.innerHTML = `<p class="p-space-sm font-body-sm text-body-sm text-on-surface-variant">${t('messages.noPeersFound')}</p>`;
      } else {
        data.forEach((p) => {
          profiles[p.id] = p;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'w-full text-left px-space-sm py-2 hover:bg-surface-container-low font-body-sm text-body-sm text-on-surface';
          btn.textContent = p.name;
          btn.addEventListener('click', () => openConversation(p.id));
          peerSearchResults.appendChild(btn);
        });
      }
      peerSearchResults.classList.remove('hidden');
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== peerSearchInput && !peerSearchResults.contains(e.target)) {
      peerSearchResults.classList.add('hidden');
    }
  });

  sb.channel(`messages-inbox-${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${currentUser.id}` },
      async (payload) => {
        const m = payload.new;
        await fetchProfile(m.sender_id);

        let c = conversations.find((x) => x.peerId === m.sender_id);
        if (!c) {
          c = { peerId: m.sender_id, unread: 0 };
          conversations.push(c);
        }
        c.lastMessage = m.content;
        c.lastAt = m.created_at;

        if (m.sender_id === activePeerId) {
          chatMessages.appendChild(buildBubble(m));
          chatMessages.scrollTop = chatMessages.scrollHeight;
          await markRead(activePeerId);
        } else {
          c.unread += 1;
          renderConversations();
        }
      }
    )
    .subscribe();

  conversations = await loadConversations();
  renderConversations();

  const toParam = new URLSearchParams(window.location.search).get('to');
  if (toParam) await openConversation(toParam);

  document.addEventListener('zen:languagechange', renderConversations);
});
