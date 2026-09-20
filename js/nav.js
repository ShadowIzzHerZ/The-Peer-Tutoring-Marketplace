async function getSessionProfile() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return profile || null;
}

async function requireAuth() {
  const profile = await getSessionProfile();
  if (!profile) {
    window.location.href = 'login.html';
    return null;
  }
  return profile;
}

async function requireAdmin() {
  const profile = await requireAuth();
  if (profile && !profile.is_admin) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return profile;
}

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const icon = toggle.querySelector('.theme-icon');

  function updateIcon() {
    icon.textContent = document.documentElement.classList.contains('dark') ? 'light_mode' : 'dark_mode';
  }
  updateIcon();

  toggle.addEventListener('click', () => {
    toggle.classList.add('switching');
    setTimeout(() => {
      document.documentElement.classList.toggle('dark');
      try {
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      } catch (e) {
        /* localStorage unavailable */
      }
      updateIcon();
      toggle.classList.remove('switching');
    }, 150);
  });
}

async function initNav() {
  initThemeToggle();

  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  const profile = await getSessionProfile();

  document.querySelectorAll('.nav-guest-only').forEach((el) => {
    el.classList.toggle('hidden', !!profile);
  });
  document.querySelectorAll('.nav-auth-only').forEach((el) => {
    el.classList.toggle('hidden', !profile);
  });
  document.querySelectorAll('.nav-admin-only').forEach((el) => {
    el.classList.toggle('hidden', !(profile && profile.is_admin));
  });

  const userNameEl = document.getElementById('nav-user-name');
  if (userNameEl && profile) userNameEl.textContent = profile.name;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await sb.auth.signOut();
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', initNav);
