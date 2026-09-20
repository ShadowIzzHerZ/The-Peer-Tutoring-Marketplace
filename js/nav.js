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

async function initNav() {
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
