/* ═══════════════════════════════════════════════════════════════
   MLSN Franchising Solution Corporation — PWA Application
   app.js  |  Vanilla JS + Supabase + Google Maps
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── 0. CONFIGURATION ──────────────────────────────────────── */
const CONFIG = {
  SUPABASE_URL:    'https://nvrsifwguywmuvaraveo.supabase.co/rest/v1/',
  SUPABASE_ANON:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cnNpZndndXl3bXV2YXJhdmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2Njc1MzYsImV4cCI6MjA5ODI0MzUzNn0.8YwK28pqDolGi71VcDATrNk3ruMQc93M6tRpob-8Qdk',
  MAPS_API_KEY:    'YOUR_GOOGLE_MAPS_API_KEY',
  MAPS_CENTER:     { lat: 14.5995, lng: 120.9842 }, // Manila default
  PAGE_SIZE:       15,
  PRESENCE_CHANNEL:'mlsn-presence',
  APP_VERSION:     '1.0.0',
};

/* ── 1. SUPABASE CLIENT ────────────────────────────────────── */
const sb = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  }
);
window.supabase = sb;

/* ── 2. APP STATE ──────────────────────────────────────────── */
const State = {
  user:            null,   // Supabase auth user
  profile:         null,   // profiles row
  role:            null,   // string role
  currentView:     'dashboard',
  maps:            {},     // map instances keyed by id
  markers:         {},     // map markers keyed by map id
  realtimeSubs:    [],     // active supabase channels
  presenceChannel: null,
  onlineUsers:     {},     // uid → { name, role, online_at }
  chatThread:      null,   // active conversation id
  notifCount:      0,
  confirmCallback: null,   // pending confirm action
  deliveries:      { page: 1, total: 0, filter: '', status: '' },
  customers:       { page: 1, total: 0, filter: '' },
  logs:            { page: 1, total: 0, filter: '', role: '' },
  users:           { page: 1, total: 0, filter: '', role: '' },
};

/* ── 3. ROLE DEFINITIONS ───────────────────────────────────── */
const ROLES = {
  supervisor:          { label: 'Supervisor',           color: '#7c3aed' },
  admin_assistant:     { label: 'Admin Assistant',      color: '#0284c7' },
  accounting:          { label: 'Accounting',           color: '#16a34a' },
  cashier:             { label: 'Cashier',              color: '#d97706' },
  warehouse_supervisor:{ label: 'Warehouse Supervisor', color: '#dc2626' },
  warehouse_staff:     { label: 'Warehouse Staff',      color: '#ea580c' },
  customer:            { label: 'Customer',             color: '#64748b' },
};

const ROLE_STATS = {
  supervisor: [
    { label: 'Total Users',      key: 'total_users',      icon: 'users',    color: 'blue'  },
    { label: 'Active Deliveries',key: 'active_deliveries',icon: 'truck',    color: 'amber' },
    { label: 'Customers',        key: 'total_customers',  icon: 'customer', color: 'green' },
    { label: 'Online Now',       key: 'online_now',       icon: 'online',   color: 'green' },
  ],
  admin_assistant: [
    { label: 'Active Deliveries',key: 'active_deliveries',icon: 'truck',    color: 'amber' },
    { label: 'Pending Chats',    key: 'pending_chats',    icon: 'chat',     color: 'blue'  },
    { label: 'Announcements',    key: 'announcements',    icon: 'bell',     color: 'blue'  },
    { label: 'Customers',        key: 'total_customers',  icon: 'customer', color: 'green' },
  ],
  accounting: [
    { label: 'Pending Payments', key: 'pending_payments', icon: 'card',     color: 'amber' },
    { label: 'Paid This Month',  key: 'paid_month',       icon: 'card',     color: 'green' },
    { label: 'Overdue',          key: 'overdue',          icon: 'card',     color: 'red'   },
    { label: 'Total Customers',  key: 'total_customers',  icon: 'customer', color: 'blue'  },
  ],
  cashier: [
    { label: 'Today\'s Payments',key: 'today_payments',   icon: 'card',     color: 'green' },
    { label: 'Pending',          key: 'pending_payments', icon: 'card',     color: 'amber' },
    { label: 'Total Collected',  key: 'total_collected',  icon: 'card',     color: 'blue'  },
    { label: 'Customers Served', key: 'customers_served', icon: 'customer', color: 'green' },
  ],
  warehouse_supervisor: [
    { label: 'Active Deliveries',key: 'active_deliveries',icon: 'truck',    color: 'amber' },
    { label: 'Delivered Today',  key: 'delivered_today',  icon: 'truck',    color: 'green' },
    { label: 'Low Stock Items',  key: 'low_stock',        icon: 'box',      color: 'red'   },
    { label: 'Total Items',      key: 'total_inventory',  icon: 'box',      color: 'blue'  },
  ],
  warehouse_staff: [
    { label: 'My Deliveries',    key: 'my_deliveries',    icon: 'truck',    color: 'blue'  },
    { label: 'In Transit',       key: 'in_transit',       icon: 'truck',    color: 'amber' },
    { label: 'Delivered Today',  key: 'delivered_today',  icon: 'truck',    color: 'green' },
    { label: 'Pending',          key: 'pending',          icon: 'truck',    color: 'red'   },
  ],
  customer: [
    { label: 'My Deliveries',    key: 'my_deliveries',    icon: 'truck',    color: 'blue'  },
    { label: 'In Transit',       key: 'in_transit',       icon: 'truck',    color: 'amber' },
    { label: 'Delivered',        key: 'delivered',        icon: 'truck',    color: 'green' },
    { label: 'Unread Messages',  key: 'unread_messages',  icon: 'chat',     color: 'blue'  },
  ],
};

/* ────────────────────────────────────────────────────────────
   STAT ICONS SVG MAP
──────────────────────────────────────────────────────────── */
const STAT_ICONS = {
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  truck:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  customer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  online:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  chat:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  bell:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>`,
  card:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  box:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
};

/* ════════════════════════════════════════════════════════════
   4. BOOTSTRAP — entry point
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  loadGoogleMaps();
  bindGlobalUI();

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await bootApp(session.user);
  } else {
    showScreen('auth');
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await bootApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      teardown();
      showScreen('auth');
    } else if (event === 'PASSWORD_RECOVERY') {
      showScreen('auth');
      showForgotForm();
    }
  });
});

/* ── Service Worker ─────────────────────────────────────── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(err => console.warn('SW registration failed:', err));
  }
}

/* ── Boot App ───────────────────────────────────────────── */
async function bootApp(authUser) {
  try {
    State.user = authUser;
    const profile = await fetchProfile(authUser.id);
    if (!profile) {
      showToast('error', 'Account not found', 'Contact your administrator.');
      await supabase.auth.signOut();
      return;
    }
    State.profile = profile;
    State.role = profile.role;

    populateSidebarUser();
    applyRoleVisibility();
    showScreen('app');
    hideLoading();
    navigateTo('dashboard');
    startPresence();
    subscribeRealtime();
    loadNotifications();

    // Date in topbar
    document.getElementById('dashboard-date').textContent =
      new Date().toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  } catch (err) {
    console.error('Boot error:', err);
    showToast('error', 'Failed to load', err.message);
    hideLoading();
  }
}

/* ── Teardown on logout ─────────────────────────────────── */
function teardown() {
  State.realtimeSubs.forEach(ch => supabase.removeChannel(ch));
  State.realtimeSubs = [];
  if (State.presenceChannel) {
    supabase.removeChannel(State.presenceChannel);
    State.presenceChannel = null;
  }
  State.user = State.profile = State.role = null;
  State.onlineUsers = {};
  State.maps = {};
  State.markers = {};
}

/* ════════════════════════════════════════════════════════════
   5. SCREEN / VIEW ROUTING
════════════════════════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
}

function navigateTo(viewName) {
  State.currentView = viewName;

  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update topbar title
  const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  const titleEl = document.getElementById('topbar-page-title');
  if (navItem && titleEl) {
    titleEl.textContent = navItem.querySelector('span:not(.nav-badge):not(.online-pulse)')?.textContent || viewName;
  }

  closeSidebar();
  closeAllDropdowns();

  // Load view data
  loadView(viewName);
}

function loadView(viewName) {
  switch (viewName) {
    case 'dashboard':     loadDashboard();     break;
    case 'deliveries':    loadDeliveries();    break;
    case 'customers':     loadCustomers();     break;
    case 'chat':          loadChat();          break;
    case 'announcements': loadAnnouncements(); break;
    case 'inventory':     loadInventory();     break;
    case 'payments':      loadPayments();      break;
    case 'logs':          loadLogs();          break;
    case 'users':         loadUsers();         break;
    case 'monitor':       loadMonitor();       break;
  }
}

/* ════════════════════════════════════════════════════════════
   6. GLOBAL UI BINDINGS
════════════════════════════════════════════════════════════ */
function bindGlobalUI() {
  // Sidebar toggle
  document.getElementById('btn-menu')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Nav items
  document.getElementById('sidebar-nav')?.addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (item?.dataset.view) { e.preventDefault(); navigateTo(item.dataset.view); }
  });

  // Card links (e.g. "View all" on dashboard)
  document.getElementById('content-area')?.addEventListener('click', e => {
    const link = e.target.closest('[data-view]');
    if (link && !link.classList.contains('nav-item')) {
      e.preventDefault();
      navigateTo(link.dataset.view);
    }
  });

  // Auth — Login
  document.getElementById('btn-login')?.addEventListener('click', handleLogin);
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Auth — Forgot
  document.getElementById('btn-forgot')?.addEventListener('click', showForgotForm);
  document.getElementById('btn-back-login')?.addEventListener('click', showLoginForm);
  document.getElementById('btn-forgot-submit')?.addEventListener('click', handleForgotPassword);

  // Password toggle
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('dd-logout')?.addEventListener('click', handleLogout);

  // Notifications
  document.getElementById('btn-notifications')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleNotificationPanel();
  });
  document.getElementById('btn-mark-all-read')?.addEventListener('click', markAllNotificationsRead);

  // User dropdown
  document.getElementById('btn-user-menu')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('user-dropdown')?.classList.toggle('hidden');
    document.getElementById('notification-panel')?.classList.add('hidden');
  });
  document.getElementById('dd-profile')?.addEventListener('click', openProfileModal);
  document.getElementById('dd-change-password')?.addEventListener('click', () => openModal('modal-change-password'));

  // Close dropdowns on outside click
  document.addEventListener('click', closeAllDropdowns);

  // Modal close buttons
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal || btn.closest('.modal')?.id));
  });
  document.getElementById('modal-backdrop')?.addEventListener('click', closeTopModal);

  // Profile save
  document.getElementById('btn-save-profile')?.addEventListener('click', handleSaveProfile);

  // Password change
  document.getElementById('btn-save-password')?.addEventListener('click', handleChangePassword);

  // Delivery modal
  document.getElementById('btn-add-delivery')?.addEventListener('click', openDeliveryModal);
  document.getElementById('btn-save-delivery')?.addEventListener('click', handleSaveDelivery);
  document.getElementById('btn-close-tracker')?.addEventListener('click', closeTracker);
  document.getElementById('btn-update-delivery-status')?.addEventListener('click', handleUpdateDeliveryStatus);

  // Delivery filters
  document.getElementById('delivery-search')?.addEventListener('input', debounce(e => {
    State.deliveries.filter = e.target.value;
    State.deliveries.page = 1;
    loadDeliveries();
  }, 350));
  document.getElementById('delivery-filter-status')?.addEventListener('change', e => {
    State.deliveries.status = e.target.value;
    State.deliveries.page = 1;
    loadDeliveries();
  });

  // Customer modal
  document.getElementById('btn-add-customer')?.addEventListener('click', () => openCustomerModal());
  document.getElementById('btn-save-customer')?.addEventListener('click', handleSaveCustomer);

  // Customer search
  document.getElementById('customer-search')?.addEventListener('input', debounce(e => {
    State.customers.filter = e.target.value;
    State.customers.page = 1;
    loadCustomers();
  }, 350));

  // Chat
  document.getElementById('btn-chat-send')?.addEventListener('click', handleSendMessage);
  document.getElementById('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  });
  document.getElementById('chat-input')?.addEventListener('input', autoResizeTextarea);
  document.getElementById('chat-search')?.addEventListener('input', debounce(e => {
    filterConversations(e.target.value);
  }, 250));

  // Announcements
  document.getElementById('btn-add-announcement')?.addEventListener('click', () => openAnnouncementModal());
  document.getElementById('btn-save-announcement')?.addEventListener('click', handleSaveAnnouncement);

  // Inventory
  document.getElementById('btn-add-inventory')?.addEventListener('click', () => openInventoryModal());
  document.getElementById('btn-save-inventory')?.addEventListener('click', handleSaveInventory);
  document.getElementById('inventory-search')?.addEventListener('input', debounce(() => loadInventory(), 350));

  // Payments
  document.getElementById('btn-add-payment')?.addEventListener('click', () => openPaymentModal());
  document.getElementById('btn-save-payment')?.addEventListener('click', handleSavePayment);
  document.getElementById('payment-filter-status')?.addEventListener('change', () => loadPayments());

  // Logs
  document.getElementById('logs-search')?.addEventListener('input', debounce(() => {
    State.logs.page = 1; loadLogs();
  }, 350));
  document.getElementById('logs-filter-role')?.addEventListener('change', e => {
    State.logs.role = e.target.value;
    State.logs.page = 1;
    loadLogs();
  });
  document.getElementById('btn-export-logs')?.addEventListener('click', exportLogsCSV);

  // Users
  document.getElementById('btn-add-user')?.addEventListener('click', () => openUserModal());
  document.getElementById('btn-save-user')?.addEventListener('click', handleSaveUser);
  document.getElementById('users-search')?.addEventListener('input', debounce(() => {
    State.users.page = 1; loadUsers();
  }, 350));
  document.getElementById('users-filter-role')?.addEventListener('change', e => {
    State.users.role = e.target.value;
    State.users.page = 1;
    loadUsers();
  });

  // Reset password
  document.getElementById('btn-confirm-reset-password')?.addEventListener('click', handleResetPassword);

  // Confirm modal
  document.getElementById('btn-confirm-action')?.addEventListener('click', () => {
    if (typeof State.confirmCallback === 'function') State.confirmCallback();
    closeModal('modal-confirm');
  });
}

/* ════════════════════════════════════════════════════════════
   7. AUTH HANDLERS
════════════════════════════════════════════════════════════ */
async function handleLogin() {
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  if (!email || !password) { errEl.textContent = 'Email and password are required.'; return; }
  errEl.textContent = '';
  setButtonLoading(btn, true);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setButtonLoading(btn, false);

  if (error) {
    errEl.textContent = error.message === 'Invalid login credentials'
      ? 'Incorrect email or password.'
      : error.message;
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
}

async function handleForgotPassword() {
  const email   = document.getElementById('forgot-email')?.value.trim();
  const errEl   = document.getElementById('forgot-error');
  const succEl  = document.getElementById('forgot-success');
  const btn     = document.getElementById('btn-forgot-submit');

  if (!email) { errEl.textContent = 'Enter your email address.'; return; }
  errEl.textContent = '';
  succEl.textContent = '';
  setButtonLoading(btn, true);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  setButtonLoading(btn, false);

  if (error) {
    errEl.textContent = error.message;
  } else {
    succEl.textContent = 'Reset link sent — check your inbox.';
    document.getElementById('forgot-email').value = '';
  }
}

function showLoginForm() {
  document.getElementById('tab-login')?.classList.add('active');
  document.getElementById('tab-forgot')?.classList.remove('active');
}

function showForgotForm() {
  document.getElementById('tab-login')?.classList.remove('active');
  document.getElementById('tab-forgot')?.classList.add('active');
}

/* ════════════════════════════════════════════════════════════
   8. PROFILE & PASSWORD
════════════════════════════════════════════════════════════ */
async function fetchProfile(uid) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single();
  if (error) throw error;
  return data;
}

function populateSidebarUser() {
  const p = State.profile;
  const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email;
  const initials = getInitials(fullName);
  const roleLabel = ROLES[State.role]?.label || State.role;

  el('sidebar-avatar').textContent      = initials;
  el('sidebar-name').textContent        = fullName;
  el('sidebar-role').textContent        = roleLabel;
  el('topbar-avatar').textContent       = initials;
  el('dropdown-name').textContent       = fullName;
  el('dropdown-email').textContent      = p.email || '';
  el('dropdown-role').textContent       = roleLabel;
}

function openProfileModal() {
  const p = State.profile;
  const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  el('profile-avatar-large').textContent = getInitials(fullName || p.email);
  el('profile-full-name').textContent    = fullName || p.email;
  el('profile-role-label').textContent   = ROLES[State.role]?.label || State.role;
  el('profile-first-name').value = p.first_name || '';
  el('profile-last-name').value  = p.last_name  || '';
  el('profile-phone').value      = p.phone      || '';
  el('profile-address').value    = p.address    || '';
  el('profile-error').textContent   = '';
  el('profile-success').textContent = '';
  openModal('modal-profile');
  closeAllDropdowns();
}

async function handleSaveProfile() {
  const btn = document.getElementById('btn-save-profile');
  const errEl  = el('profile-error');
  const succEl = el('profile-success');
  errEl.textContent  = '';
  succEl.textContent = '';
  setButtonLoading(btn, true);

  const updates = {
    first_name: el('profile-first-name').value.trim(),
    last_name:  el('profile-last-name').value.trim(),
    phone:      el('profile-phone').value.trim(),
    address:    el('profile-address').value.trim(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('profiles').update(updates).eq('id', State.user.id);
  setButtonLoading(btn, false);

  if (error) {
    errEl.textContent = error.message;
  } else {
    State.profile = { ...State.profile, ...updates };
    populateSidebarUser();
    succEl.textContent = 'Profile updated.';
    showToast('success', 'Profile saved', 'Your changes have been saved.');
    await logActivity('update_profile', 'profiles', State.user.id);
  }
}

async function handleChangePassword() {
  const btn     = document.getElementById('btn-save-password');
  const current = el('cp-current').value;
  const newPw   = el('cp-new').value;
  const confirm = el('cp-confirm').value;
  const errEl   = el('cp-error');
  const succEl  = el('cp-success');

  errEl.textContent  = '';
  succEl.textContent = '';

  if (!current || !newPw || !confirm) { errEl.textContent = 'All fields are required.'; return; }
  if (newPw.length < 8)              { errEl.textContent = 'New password must be at least 8 characters.'; return; }
  if (newPw !== confirm)             { errEl.textContent = 'Passwords do not match.'; return; }

  setButtonLoading(btn, true);

  // Re-authenticate then update
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: State.user.email, password: current,
  });

  if (signInErr) {
    setButtonLoading(btn, false);
    errEl.textContent = 'Current password is incorrect.';
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: newPw });
  setButtonLoading(btn, false);

  if (error) {
    errEl.textContent = error.message;
  } else {
    succEl.textContent = 'Password updated successfully.';
    el('cp-current').value = el('cp-new').value = el('cp-confirm').value = '';
    showToast('success', 'Password changed', 'Your password has been updated.');
    await logActivity('change_password', 'auth', State.user.id);
  }
}

/* ════════════════════════════════════════════════════════════
   9. ROLE-BASED VISIBILITY
════════════════════════════════════════════════════════════ */
function applyRoleVisibility() {
  const role = State.role;

  // Nav items
  document.querySelectorAll('.nav-item[data-roles]').forEach(item => {
    const allowed = item.dataset.roles.split(',').map(r => r.trim());
    item.style.display = allowed.includes(role) ? '' : 'none';
  });

  // Action buttons with data-roles
  document.querySelectorAll('[data-roles]').forEach(el => {
    if (el.classList.contains('nav-item')) return; // already handled
    const allowed = el.dataset.roles.split(',').map(r => r.trim());
    el.style.display = allowed.includes(role) ? '' : 'none';
  });
}

function canDo(...roles) {
  return roles.includes(State.role);
}

/* ════════════════════════════════════════════════════════════
   10. DASHBOARD
════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  renderStatCards();
  loadDashboardMap();
  loadRecentActivity();
  loadActiveDeliveryStrip();
}

async function renderStatCards() {
  const grid = el('stat-grid');
  const stats = ROLE_STATS[State.role] || [];
  grid.innerHTML = stats.map(s => `
    <div class="stat-card" id="stat-${s.key}">
      <div class="stat-card-icon ${s.color}">${STAT_ICONS[s.icon] || ''}</div>
      <span class="stat-card-label">${s.label}</span>
      <span class="stat-card-value" id="stat-val-${s.key}">—</span>
    </div>
  `).join('');

  // Fetch real values
  await fetchStatValues();
}

async function fetchStatValues() {
  const role = State.role;
  const uid  = State.user.id;

  try {
    if (role === 'supervisor' || role === 'admin_assistant') {
      const [usersRes, delivRes, custRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('deliveries').select('id', { count: 'exact', head: true }).in('status', ['pending','processing','in_transit']),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
      ]);
      setStatVal('total_users',       usersRes.count ?? 0);
      setStatVal('active_deliveries', delivRes.count ?? 0);
      setStatVal('total_customers',   custRes.count  ?? 0);
      setStatVal('online_now', Object.keys(State.onlineUsers).length);
      setStatVal('announcements', await countTable('announcements'));
      setStatVal('pending_chats', await countUnreadChats());
    }

    if (role === 'accounting' || role === 'cashier') {
      const [pendRes, paidRes, overdueRes, custRes] = await Promise.all([
        supabase.from('payments').select('id', { count:'exact', head:true }).eq('status','pending'),
        supabase.from('payments').select('amount').eq('status','paid').gte('created_at', startOfMonth()),
        supabase.from('payments').select('id', { count:'exact', head:true }).eq('status','overdue'),
        supabase.from('customers').select('id', { count:'exact', head:true }),
      ]);
      setStatVal('pending_payments', pendRes.count ?? 0);
      setStatVal('paid_month', '₱' + sumField(paidRes.data, 'amount'));
      setStatVal('overdue',    overdueRes.count ?? 0);
      setStatVal('total_customers', custRes.count ?? 0);

      const todayPaid = await supabase.from('payments').select('amount').eq('status','paid')
        .gte('created_at', startOfDay());
      setStatVal('today_payments', '₱' + sumField(todayPaid.data, 'amount'));
      setStatVal('total_collected', '₱' + sumField(paidRes.data, 'amount'));
      setStatVal('customers_served', todayPaid.data?.length ?? 0);
    }

    if (role === 'warehouse_supervisor' || role === 'warehouse_staff') {
      const today = new Date(); today.setHours(0,0,0,0);
      const [activeRes, todayRes, invRes] = await Promise.all([
        supabase.from('deliveries').select('id', { count:'exact', head:true }).in('status', ['pending','processing','in_transit']),
        supabase.from('deliveries').select('id', { count:'exact', head:true }).eq('status','delivered').gte('updated_at', today.toISOString()),
        supabase.from('inventory').select('id, quantity, reorder_level'),
      ]);
      setStatVal('active_deliveries', activeRes.count ?? 0);
      setStatVal('delivered_today',   todayRes.count  ?? 0);
      const lowStock = (invRes.data || []).filter(i => i.quantity <= i.reorder_level).length;
      setStatVal('low_stock',       lowStock);
      setStatVal('total_inventory', invRes.data?.length ?? 0);

      if (role === 'warehouse_staff') {
        const myDelivRes = await supabase.from('deliveries').select('id, status', { count:'exact' }).eq('driver_id', uid);
        const myD = myDelivRes.data || [];
        setStatVal('my_deliveries', myD.length);
        setStatVal('in_transit',    myD.filter(d => d.status === 'in_transit').length);
        setStatVal('pending',       myD.filter(d => d.status === 'pending').length);
      }
    }

    if (role === 'customer') {
      const custRow = await supabase.from('customers').select('id').eq('user_id', uid).single();
      if (custRow.data) {
        const [delivRes, unreadRes] = await Promise.all([
          supabase.from('deliveries').select('id, status').eq('customer_id', custRow.data.id),
          supabase.from('messages').select('id', { count:'exact', head:true }).eq('recipient_id', uid).eq('read', false),
        ]);
        const d = delivRes.data || [];
        setStatVal('my_deliveries',   d.length);
        setStatVal('in_transit',      d.filter(x => x.status === 'in_transit').length);
        setStatVal('delivered',       d.filter(x => x.status === 'delivered').length);
        setStatVal('unread_messages', unreadRes.count ?? 0);
      }
    }
  } catch (err) {
    console.warn('Stat fetch error:', err.message);
  }
}

function setStatVal(key, val) {
  const el2 = document.getElementById(`stat-val-${key}`);
  if (el2) el2.textContent = val ?? '—';
}

async function loadRecentActivity() {
  const list = el('recent-activity-list');
  try {
    const { data } = await supabase
      .from('activity_logs')
      .select('*, profiles(first_name, last_name, role)')
      .order('created_at', { ascending: false })
      .limit(8);

    if (!data?.length) {
      list.innerHTML = '<div class="activity-item"><span style="color:var(--muted);font-size:var(--text-sm)">No recent activity</span></div>';
      return;
    }

    list.innerHTML = data.map(log => {
      const name = log.profiles ? `${log.profiles.first_name || ''} ${log.profiles.last_name || ''}`.trim() : 'System';
      return `<div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-text">
          <div class="activity-msg">${escHtml(name)} — ${formatAction(log.action)}</div>
          <div class="activity-time">${timeAgo(log.created_at)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<div class="activity-item"><span style="color:var(--muted)">Unable to load activity</span></div>';
  }
}

async function loadActiveDeliveryStrip() {
  const strip = el('active-deliveries-strip');
  try {
    let q = supabase.from('deliveries')
      .select('id, tracking_number, status, eta, customers(first_name, last_name)')
      .in('status', ['pending','processing','in_transit'])
      .order('eta', { ascending: true })
      .limit(10);

    if (State.role === 'customer') {
      const custRow = await supabase.from('customers').select('id').eq('user_id', State.user.id).single();
      if (custRow.data) q = q.eq('customer_id', custRow.data.id);
    }
    if (State.role === 'warehouse_staff') {
      q = q.eq('driver_id', State.user.id);
    }

    const { data } = await q;
    if (!data?.length) {
      strip.innerHTML = '<span style="padding:1rem;color:var(--muted);font-size:var(--text-sm)">No active deliveries</span>';
      el('map-delivery-count').textContent = '0';
      return;
    }

    el('map-delivery-count').textContent = data.length;
    strip.innerHTML = data.map(d => {
      const cust = d.customers ? `${d.customers.first_name || ''} ${d.customers.last_name || ''}`.trim() : '—';
      return `<div class="delivery-eta-card" data-id="${d.id}" onclick="openDeliveryTracker('${d.id}')">
        <span class="delivery-eta-id">#${d.tracking_number || d.id.slice(0,8).toUpperCase()}</span>
        <span class="delivery-eta-customer">${escHtml(cust)}</span>
        <span class="delivery-eta-time">ETA: ${d.eta ? formatDateTime(d.eta) : 'TBD'}</span>
        <span class="delivery-eta-status">${statusBadge(d.status)}</span>
      </div>`;
    }).join('');
  } catch (err) {
    strip.innerHTML = '<span style="padding:1rem;color:var(--muted);font-size:var(--text-sm)">Failed to load</span>';
  }
}

/* ════════════════════════════════════════════════════════════
   11. GOOGLE MAPS
════════════════════════════════════════════════════════════ */
function loadGoogleMaps() {
  if (window.__mapsLoaded || document.getElementById('google-maps-script')) return;
  const script = document.createElement('script');
  script.id  = 'google-maps-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAPS_API_KEY}&libraries=geometry&callback=initGoogleMaps`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function initMapInstance(containerId, options = {}) {
  if (!window.__mapsLoaded || !window.google?.maps) return null;
  const container = document.getElementById(containerId);
  if (!container) return null;
  if (State.maps[containerId]) return State.maps[containerId];

  const map = new google.maps.Map(container, {
    center:            options.center || CONFIG.MAPS_CENTER,
    zoom:              options.zoom   || 12,
    disableDefaultUI:  false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    ],
  });
  State.maps[containerId] = map;
  State.markers[containerId] = [];
  return map;
}

function loadDashboardMap() {
  document.addEventListener('maps:ready', () => {
    const map = initMapInstance('dashboard-map', { zoom: 11 });
    if (map) plotActiveDeliveriesOnMap(map, 'dashboard-map');
  }, { once: true });

  if (window.__mapsLoaded) {
    const map = initMapInstance('dashboard-map', { zoom: 11 });
    if (map) plotActiveDeliveriesOnMap(map, 'dashboard-map');
  }
}

async function plotActiveDeliveriesOnMap(map, mapId) {
  clearMarkers(mapId);
  const { data } = await supabase
    .from('deliveries')
    .select('id, tracking_number, lat, lng, status, customers(first_name, last_name)')
    .in('status', ['pending','processing','in_transit'])
    .not('lat', 'is', null);

  if (!data?.length) return;

  const bounds = new google.maps.LatLngBounds();
  data.forEach(d => {
    if (!d.lat || !d.lng) return;
    const pos = { lat: parseFloat(d.lat), lng: parseFloat(d.lng) };
    const cust = d.customers ? `${d.customers.first_name || ''} ${d.customers.last_name || ''}`.trim() : '';
    const marker = new google.maps.Marker({
      position: pos,
      map,
      title:    `#${d.tracking_number || d.id.slice(0,8)} — ${cust}`,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: statusColor(d.status),
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 9,
      },
    });
    const info = new google.maps.InfoWindow({
      content: `<div style="font-family:Inter,sans-serif;font-size:13px;padding:4px 2px">
        <strong>#${d.tracking_number || d.id.slice(0,8).toUpperCase()}</strong><br>
        ${escHtml(cust)}<br>
        <span style="color:${statusColor(d.status)};font-weight:600;text-transform:capitalize">${d.status.replace('_',' ')}</span>
      </div>`,
    });
    marker.addListener('click', () => info.open(map, marker));
    State.markers[mapId].push(marker);
    bounds.extend(pos);
  });
  if (!bounds.isEmpty()) map.fitBounds(bounds);
}

function clearMarkers(mapId) {
  (State.markers[mapId] || []).forEach(m => m.setMap(null));
  State.markers[mapId] = [];
}

function loadCustomersMap(data) {
  const ready = () => {
    const map = initMapInstance('customers-map', { zoom: 11 });
    if (!map) return;
    clearMarkers('customers-map');
    const bounds = new google.maps.LatLngBounds();

    data.filter(c => c.lat && c.lng).forEach(c => {
      const pos  = { lat: parseFloat(c.lat), lng: parseFloat(c.lng) };
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      const marker = new google.maps.Marker({ position: pos, map, title: name });
      const info = new google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;font-size:13px;padding:4px 2px">
          <strong>${escHtml(name)}</strong><br>${escHtml(c.address || '')}
        </div>`,
      });
      marker.addListener('click', () => info.open(map, marker));
      State.markers['customers-map'].push(marker);
      bounds.extend(pos);
    });

    if (!bounds.isEmpty()) map.fitBounds(bounds);
  };

  if (window.__mapsLoaded) { ready(); }
  else { document.addEventListener('maps:ready', ready, { once: true }); }
}

async function openDeliveryTracker(deliveryId) {
  const { data: d } = await supabase
    .from('deliveries')
    .select('*, customers(first_name, last_name, address)')
    .eq('id', deliveryId)
    .single();
  if (!d) return;

  el('tracker-id').textContent      = `#${d.tracking_number || d.id.slice(0,8).toUpperCase()}`;
  el('tracker-customer').textContent = d.customers ? `${d.customers.first_name||''} ${d.customers.last_name||''}`.trim() : '—';
  el('tracker-status').innerHTML    = statusBadge(d.status);
  el('tracker-eta').textContent     = d.eta ? formatDateTime(d.eta) : 'TBD';
  el('tracker-driver').textContent  = d.driver_name || '—';
  el('tracker-address').textContent = d.delivery_address || d.customers?.address || '—';

  updateProgressSteps(d.status);

  const panel = el('delivery-tracker-panel');
  panel.classList.remove('hidden');

  // Only show status update for staff roles
  const actEl = el('tracker-actions');
  if (actEl) {
    actEl.style.display = canDo('supervisor','admin_assistant','warehouse_supervisor','warehouse_staff') ? 'flex' : 'none';
    el('tracker-status-update').dataset.deliveryId = deliveryId;
  }

  // Init tracker map
  const mapReady = () => {
    const map = initMapInstance('tracker-map', { zoom: 14 });
    if (map && d.lat && d.lng) {
      const pos = { lat: parseFloat(d.lat), lng: parseFloat(d.lng) };
      map.setCenter(pos);
      clearMarkers('tracker-map');
      const marker = new google.maps.Marker({ position: pos, map, title: d.tracking_number });
      State.markers['tracker-map'].push(marker);
    }
  };
  if (window.__mapsLoaded) mapReady();
  else document.addEventListener('maps:ready', mapReady, { once: true });
}

function updateProgressSteps(status) {
  const ORDER = ['pending', 'processing', 'in_transit', 'delivered'];
  const idx   = ORDER.indexOf(status);
  document.querySelectorAll('.progress-step').forEach((step, i) => {
    step.classList.remove('done', 'current');
    if (i < idx)  step.classList.add('done');
    if (i === idx) step.classList.add('current');
  });
}

function closeTracker() {
  el('delivery-tracker-panel')?.classList.add('hidden');
}

async function handleUpdateDeliveryStatus() {
  const select = el('tracker-status-update');
  const newStatus = select.value;
  const delivId   = select.dataset.deliveryId;
  if (!newStatus || !delivId) return;

  const { error } = await supabase.from('deliveries')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', delivId);

  if (error) { showToast('error', 'Update failed', error.message); return; }
  showToast('success', 'Status updated', `Delivery marked as ${newStatus.replace('_',' ')}.`);
  el('tracker-status').innerHTML = statusBadge(newStatus);
  updateProgressSteps(newStatus);
  select.value = '';
  await logActivity('update_delivery_status', 'deliveries', delivId, { status: newStatus });
  loadDeliveries();
}

/* ════════════════════════════════════════════════════════════
   12. DELIVERIES VIEW
════════════════════════════════════════════════════════════ */
async function loadDeliveries() {
  const tbody = el('deliveries-tbody');
  tbody.innerHTML = `<tr class="table-empty"><td colspan="7">Loading…</td></tr>`;

  try {
    const { page, filter, status } = State.deliveries;
    const from = (page - 1) * CONFIG.PAGE_SIZE;
    const to   = from + CONFIG.PAGE_SIZE - 1;

    let q = supabase
      .from('deliveries')
      .select('*, customers(first_name, last_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filter) q = q.or(`tracking_number.ilike.%${filter}%,delivery_address.ilike.%${filter}%`);
    if (status) q = q.eq('status', status);

    if (State.role === 'customer') {
      const custRow = await supabase.from('customers').select('id').eq('user_id', State.user.id).single();
      if (custRow.data) q = q.eq('customer_id', custRow.data.id);
    }
    if (State.role === 'warehouse_staff') {
      q = q.eq('driver_id', State.user.id);
    }

    const { data, count, error } = await q;
    if (error) throw error;

    State.deliveries.total = count || 0;

    if (!data?.length) {
      tbody.innerHTML = `<tr class="table-empty"><td colspan="7">No deliveries found</td></tr>`;
      el('deliveries-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(d => {
      const cust = d.customers ? `${d.customers.first_name||''} ${d.customers.last_name||''}`.trim() : '—';
      const canAct = canDo('supervisor','admin_assistant','warehouse_supervisor','warehouse_staff');
      return `<tr>
        <td><span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--blue);font-weight:600">#${d.tracking_number || d.id.slice(0,8).toUpperCase()}</span></td>
        <td>${escHtml(cust)}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(d.delivery_address || '—')}</td>
        <td>${statusBadge(d.status)}</td>
        <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${d.eta ? formatDateTime(d.eta) : '—'}</td>
        <td>${escHtml(d.driver_name || '—')}</td>
        <td>
          <div class="table-actions">
            <button class="table-btn primary" onclick="openDeliveryTracker('${d.id}')">Track</button>
            ${canAct ? `<button class="table-btn" onclick="openDeliveryModal('${d.id}')">Edit</button>` : ''}
            ${canDo('supervisor') ? `<button class="table-btn danger" onclick="confirmDelete('deliveries','${d.id}','delivery #${d.tracking_number||d.id.slice(0,8)}')">Delete</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    renderPagination('deliveries-pagination', State.deliveries.page, Math.ceil(State.deliveries.total / CONFIG.PAGE_SIZE), p => {
      State.deliveries.page = p; loadDeliveries();
    });

  } catch (err) {
    tbody.innerHTML = `<tr class="table-empty"><td colspan="7">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

async function openDeliveryModal(deliveryId = null) {
  el('delivery-modal-error').textContent = '';
  el('modal-delivery-title').textContent = deliveryId ? 'Edit Delivery' : 'New Delivery';
  el('delivery-edit-id').value = deliveryId || '';

  // Populate customer dropdown
  const { data: customers } = await supabase.from('customers').select('id, first_name, last_name').order('first_name');
  el('delivery-customer-select').innerHTML =
    `<option value="">Select customer…</option>` +
    (customers || []).map(c => `<option value="${c.id}">${escHtml(`${c.first_name||''} ${c.last_name||''}`.trim())}</option>`).join('');

  // Populate driver dropdown from warehouse staff
  const { data: drivers } = await supabase.from('profiles').select('id, first_name, last_name')
    .in('role', ['warehouse_staff','warehouse_supervisor']);
  el('delivery-driver').innerHTML =
    `<option value="">Select driver…</option>` +
    (drivers || []).map(d => `<option value="${d.id}">${escHtml(`${d.first_name||''} ${d.last_name||''}`.trim())}</option>`).join('');

  if (deliveryId) {
    const { data: d } = await supabase.from('deliveries').select('*').eq('id', deliveryId).single();
    if (d) {
      el('delivery-customer-select').value = d.customer_id || '';
      el('delivery-address').value         = d.delivery_address || '';
      el('delivery-driver').value          = d.driver_id || '';
      el('delivery-eta').value             = d.eta ? d.eta.slice(0,16) : '';
      el('delivery-notes').value           = d.notes || '';
    }
  } else {
    el('delivery-address').value = '';
    el('delivery-eta').value     = '';
    el('delivery-notes').value   = '';
  }

  openModal('modal-delivery');
}

async function handleSaveDelivery() {
  const btn     = el('btn-save-delivery');
  const errEl   = el('delivery-modal-error');
  const id      = el('delivery-edit-id').value;
  const custId  = el('delivery-customer-select').value;
  const address = el('delivery-address').value.trim();
  const driverId= el('delivery-driver').value;
  const eta     = el('delivery-eta').value;
  const notes   = el('delivery-notes').value.trim();

  errEl.textContent = '';
  if (!custId || !address) { errEl.textContent = 'Customer and address are required.'; return; }

  setButtonLoading(btn, true);

  // Get driver name
  let driverName = '';
  if (driverId) {
    const { data: dp } = await supabase.from('profiles').select('first_name, last_name').eq('id', driverId).single();
    if (dp) driverName = `${dp.first_name||''} ${dp.last_name||''}`.trim();
  }

  const payload = {
    customer_id:      custId,
    delivery_address: address,
    driver_id:        driverId || null,
    driver_name:      driverName,
    eta:              eta || null,
    notes,
    updated_at:       new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('deliveries').update(payload).eq('id', id));
  } else {
    payload.status          = 'pending';
    payload.tracking_number = generateTracking();
    payload.created_by      = State.user.id;
    ({ error } = await supabase.from('deliveries').insert(payload));
  }

  setButtonLoading(btn, false);

  if (error) { errEl.textContent = error.message; return; }

  showToast('success', id ? 'Delivery updated' : 'Delivery created', `Tracking #${payload.tracking_number || ''}`);
  closeModal('modal-delivery');
  loadDeliveries();
  await logActivity(id ? 'update_delivery' : 'create_delivery', 'deliveries', id || 'new', { address });
}

/* ════════════════════════════════════════════════════════════
   13. CUSTOMERS VIEW
════════════════════════════════════════════════════════════ */
async function loadCustomers() {
  const tbody = el('customers-tbody');
  tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Loading…</td></tr>`;

  try {
    const { page, filter } = State.customers;
    const from = (page - 1) * CONFIG.PAGE_SIZE;
    const to   = from + CONFIG.PAGE_SIZE - 1;

    let q = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filter) q = q.or(`first_name.ilike.%${filter}%,last_name.ilike.%${filter}%,email.ilike.%${filter}%,phone.ilike.%${filter}%`);

    const { data, count, error } = await q;
    if (error) throw error;

    State.customers.total = count || 0;

    if (!data?.length) {
      tbody.innerHTML = `<tr class="table-empty"><td colspan="6">No customers found</td></tr>`;
      el('customers-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(c => {
      const name = `${c.first_name||''} ${c.last_name||''}`.trim();
      const canAct = canDo('supervisor','admin_assistant');
      return `<tr>
        <td style="font-weight:600">${escHtml(name)}</td>
        <td>${escHtml(c.email || '—')}</td>
        <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${escHtml(c.phone || '—')}</td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.address || '—')}</td>
        <td><span class="badge ${c.is_active ? 'badge-active' : 'badge-inactive'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="table-actions">
            ${canAct ? `<button class="table-btn" onclick="openCustomerModal('${c.id}')">Edit</button>` : ''}
            ${canDo('supervisor') ? `<button class="table-btn danger" onclick="confirmDelete('customers','${c.id}','${escHtml(name)}')">Delete</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    loadCustomersMap(data);

    renderPagination('customers-pagination', State.customers.page, Math.ceil(State.customers.total / CONFIG.PAGE_SIZE), p => {
      State.customers.page = p; loadCustomers();
    });

  } catch (err) {
    tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

async function openCustomerModal(customerId = null) {
  el('customer-modal-error').textContent = '';
  el('modal-customer-title').textContent = customerId ? 'Edit Customer' : 'Add Customer';
  el('customer-edit-id').value = customerId || '';
  ['customer-first-name','customer-last-name','customer-email','customer-phone','customer-address','customer-lat','customer-lng']
    .forEach(id => { el(id).value = ''; });

  if (customerId) {
    const { data: c } = await supabase.from('customers').select('*').eq('id', customerId).single();
    if (c) {
      el('customer-first-name').value = c.first_name || '';
      el('customer-last-name').value  = c.last_name  || '';
      el('customer-email').value      = c.email      || '';
      el('customer-phone').value      = c.phone      || '';
      el('customer-address').value    = c.address    || '';
      el('customer-lat').value        = c.lat        || '';
      el('customer-lng').value        = c.lng        || '';
    }
  }

  openModal('modal-customer');
}

async function handleSaveCustomer() {
  const btn       = el('btn-save-customer');
  const errEl     = el('customer-modal-error');
  const id        = el('customer-edit-id').value;
  const firstName = el('customer-first-name').value.trim();
  const lastName  = el('customer-last-name').value.trim();
  const email     = el('customer-email').value.trim();

  errEl.textContent = '';
  if (!firstName || !email) { errEl.textContent = 'First name and email are required.'; return; }

  setButtonLoading(btn, true);

  const payload = {
    first_name: firstName,
    last_name:  lastName,
    email,
    phone:      el('customer-phone').value.trim(),
    address:    el('customer-address').value.trim(),
    lat:        parseFloat(el('customer-lat').value) || null,
    lng:        parseFloat(el('customer-lng').value) || null,
    is_active:  true,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('customers').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('customers').insert({ ...payload, created_by: State.user.id }));
  }

  setButtonLoading(btn, false);

  if (error) { errEl.textContent = error.message; return; }

  showToast('success', id ? 'Customer updated' : 'Customer added');
  closeModal('modal-customer');
  loadCustomers();
  await logActivity(id ? 'update_customer' : 'create_customer', 'customers', id || 'new', { email });
}

/* ════════════════════════════════════════════════════════════
   14. CHAT
════════════════════════════════════════════════════════════ */
let chatSub = null;

async function loadChat() {
  await loadConversations();
}

async function loadConversations() {
  const listEl = el('chat-conversation-list');
  listEl.innerHTML = '<div class="conv-empty">Loading…</div>';

  try {
    // Load unique conversations involving current user
    const { data, error } = await supabase
      .from('conversations')
      .select('*, participant_a:profiles!conversations_participant_a_fkey(id, first_name, last_name, role), participant_b:profiles!conversations_participant_b_fkey(id, first_name, last_name, role)')
      .or(`participant_a.eq.${State.user.id},participant_b.eq.${State.user.id}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      listEl.innerHTML = getInitialConversationHTML();
      return;
    }

    listEl.innerHTML = data.map(conv => {
      // The "other" person
      const isA  = conv.participant_a?.id === State.user.id;
      const other = isA ? conv.participant_b : conv.participant_a;
      const name  = other ? `${other.first_name||''} ${other.last_name||''}`.trim() : 'Unknown';
      const init  = getInitials(name);
      const isOnline = !!State.onlineUsers[other?.id];
      const unread   = conv.unread_count_for?.[State.user.id] || 0;

      return `<div class="conv-item ${State.chatThread === conv.id ? 'active' : ''}" data-conv="${conv.id}" data-other="${other?.id}" onclick="openConversation('${conv.id}','${other?.id}','${escHtml(name)}','${other?.role||''}')">
        <div class="conv-avatar" style="background:${strToColor(name)}">
          ${init}
          ${isOnline ? '<div class="conv-online"></div>' : ''}
        </div>
        <div class="conv-info">
          <div class="conv-name">${escHtml(name)}</div>
          <div class="conv-preview">${escHtml(conv.last_message || 'Start a conversation')}</div>
        </div>
        ${unread ? `<span class="conv-unread">${unread}</span>` : `<span class="conv-time">${conv.updated_at ? timeAgo(conv.updated_at) : ''}</span>`}
      </div>`;
    }).join('');

  } catch (err) {
    listEl.innerHTML = `<div class="conv-empty">Error loading conversations</div>`;
  }
}

function getInitialConversationHTML() {
  if (State.role === 'customer') {
    return `<div class="conv-empty" style="padding:1.25rem;cursor:pointer" onclick="startConversationWithAdmin()">
      <svg style="width:32px;height:32px;margin:0 auto .5rem;opacity:.4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div>Tap to message Admin Support</div>
    </div>`;
  }
  return '<div class="conv-empty">No conversations yet</div>';
}

async function startConversationWithAdmin() {
  // Find an admin_assistant to start with
  const { data: admin } = await supabase.from('profiles').select('id, first_name, last_name')
    .eq('role', 'admin_assistant').limit(1).single();
  if (!admin) { showToast('info', 'No admin available', 'Please try again later.'); return; }
  const name = `${admin.first_name||''} ${admin.last_name||''}`.trim() || 'Admin';
  await openOrCreateConversation(admin.id, name, 'admin_assistant');
}

async function openOrCreateConversation(otherId, otherName, otherRole) {
  // Check for existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant_a.eq.${State.user.id},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${State.user.id})`)
    .limit(1)
    .single();

  let convId;
  if (existing) {
    convId = existing.id;
  } else {
    const { data: newConv, error } = await supabase.from('conversations').insert({
      participant_a: State.user.id,
      participant_b: otherId,
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).select('id').single();
    if (error) { showToast('error', 'Could not start conversation', error.message); return; }
    convId = newConv.id;
  }

  openConversation(convId, otherId, otherName, otherRole);
  loadConversations();
}

async function openConversation(convId, otherId, otherName, otherRole) {
  State.chatThread = convId;

  // Update header
  el('chat-recipient-avatar').textContent = getInitials(otherName);
  el('chat-recipient-avatar').style.background = strToColor(otherName);
  el('chat-recipient-name').textContent  = otherName;
  el('chat-recipient-status').textContent = ROLES[otherRole]?.label || otherRole || '';
  el('chat-online-indicator').className  = `online-dot ${State.onlineUsers[otherId] ? '' : 'offline'}`;

  // Mark active in list
  document.querySelectorAll('.conv-item').forEach(item => {
    item.classList.toggle('active', item.dataset.conv === convId);
  });

  // Load messages
  await loadMessages(convId);

  // Subscribe to new messages
  if (chatSub) supabase.removeChannel(chatSub);
  chatSub = supabase.channel(`chat:${convId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `conversation_id=eq.${convId}`,
    }, payload => appendMessage(payload.new))
    .subscribe();
}

async function loadMessages(convId) {
  const messagesEl = el('chat-messages');
  messagesEl.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:var(--text-sm)">Loading…</div>';

  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(first_name, last_name)')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    messagesEl.innerHTML = '<div class="chat-empty-state"><p>Failed to load messages</p></div>';
    return;
  }

  if (!data?.length) {
    messagesEl.innerHTML = '<div class="chat-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>No messages yet — say hello!</p></div>';
    return;
  }

  messagesEl.innerHTML = data.map(m => renderMessage(m)).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Mark as read
  await supabase.from('messages').update({ read: true }).eq('conversation_id', convId).eq('read', false).neq('sender_id', State.user.id);
}

function renderMessage(m) {
  const isMe = m.sender_id === State.user.id;
  const name = m.sender ? `${m.sender.first_name||''} ${m.sender.last_name||''}`.trim() : '';
  return `<div class="msg-row ${isMe ? 'me' : ''}">
    ${!isMe ? `<div class="msg-avatar" style="background:${strToColor(name)}">${getInitials(name)}</div>` : ''}
    <div class="msg-bubble">${escHtml(m.body)}
      <div style="font-size:10px;opacity:.65;margin-top:3px;text-align:${isMe?'right':'left'}">${timeAgo(m.created_at)}</div>
    </div>
  </div>`;
}

function appendMessage(m) {
  const messagesEl = el('chat-messages');
  const emptyState = messagesEl.querySelector('.chat-empty-state');
  if (emptyState) emptyState.remove();
  messagesEl.insertAdjacentHTML('beforeend', renderMessage(m));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function handleSendMessage() {
  const input  = el('chat-input');
  const body   = input.value.trim();
  const convId = State.chatThread;
  if (!body || !convId) return;

  input.value = '';
  input.style.height = '';

  const { error } = await supabase.from('messages').insert({
    conversation_id: convId,
    sender_id:       State.user.id,
    body,
    read:            false,
    created_at:      new Date().toISOString(),
  });

  if (error) { showToast('error', 'Failed to send', error.message); return; }

  // Update conversation last_message
  await supabase.from('conversations').update({
    last_message: body.slice(0, 80),
    updated_at:   new Date().toISOString(),
  }).eq('id', convId);
}

function filterConversations(query) {
  document.querySelectorAll('.conv-item').forEach(item => {
    const name = item.querySelector('.conv-name')?.textContent.toLowerCase() || '';
    item.style.display = name.includes(query.toLowerCase()) ? '' : 'none';
  });
}

function autoResizeTextarea() {
  const ta = el('chat-input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

/* ════════════════════════════════════════════════════════════
   15. ANNOUNCEMENTS
════════════════════════════════════════════════════════════ */
async function loadAnnouncements() {
  const listEl = el('announcements-list');
  listEl.innerHTML = `<div class="skeleton skeleton-tall"></div><div class="skeleton skeleton-tall"></div>`;

  const { data, error } = await supabase
    .from('announcements')
    .select('*, profiles(first_name, last_name, role)')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { listEl.innerHTML = '<p style="color:var(--muted)">Failed to load announcements.</p>'; return; }

  if (!data?.length) {
    listEl.innerHTML = '<p style="color:var(--muted);padding:2rem 0;text-align:center">No announcements yet.</p>';
    return;
  }

  const canEdit = canDo('supervisor','admin_assistant');
  listEl.innerHTML = data.map(a => `
    <div class="announcement-card ${a.priority}" data-id="${a.id}">
      <div class="announce-header">
        <span class="announce-title">${escHtml(a.title)}</span>
        <span class="announce-priority ${a.priority}">${a.priority}</span>
      </div>
      <p class="announce-body">${escHtml(a.body)}</p>
      <div class="announce-meta">
        <span>Posted by ${a.profiles ? escHtml(`${a.profiles.first_name||''} ${a.profiles.last_name||''}`.trim()) : '—'}</span>
        <span>${formatDateTime(a.created_at)}</span>
        <span>For: ${a.target_roles === 'all' ? 'Everyone' : a.target_roles}</span>
      </div>
      ${canEdit ? `<div class="announce-actions">
        <button class="table-btn" onclick="openAnnouncementModal('${a.id}')">Edit</button>
        <button class="table-btn danger" onclick="confirmDelete('announcements','${a.id}','this announcement')">Delete</button>
      </div>` : ''}
    </div>
  `).join('');
}

async function openAnnouncementModal(announceId = null) {
  el('announce-modal-error').textContent = '';
  el('modal-announce-title').textContent = announceId ? 'Edit Announcement' : 'Post Announcement';
  el('announce-edit-id').value = announceId || '';
  el('announce-title-input').value = '';
  el('announce-body').value = '';
  el('announce-priority').value = 'normal';
  el('announce-target').value = 'all';

  if (announceId) {
    const { data: a } = await supabase.from('announcements').select('*').eq('id', announceId).single();
    if (a) {
      el('announce-title-input').value  = a.title    || '';
      el('announce-body').value         = a.body     || '';
      el('announce-priority').value     = a.priority || 'normal';
      el('announce-target').value       = a.target_roles || 'all';
    }
  }

  openModal('modal-announcement');
}

async function handleSaveAnnouncement() {
  const btn   = el('btn-save-announcement');
  const errEl = el('announce-modal-error');
  const id    = el('announce-edit-id').value;
  const title = el('announce-title-input').value.trim();
  const body  = el('announce-body').value.trim();

  errEl.textContent = '';
  if (!title || !body) { errEl.textContent = 'Title and message are required.'; return; }

  setButtonLoading(btn, true);

  const payload = {
    title,
    body,
    priority:     el('announce-priority').value,
    target_roles: el('announce-target').value,
    updated_at:   new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('announcements').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('announcements').insert({
      ...payload,
      created_by: State.user.id,
      created_at: new Date().toISOString(),
    }));
  }

  setButtonLoading(btn, false);

  if (error) { errEl.textContent = error.message; return; }

  showToast('success', id ? 'Announcement updated' : 'Announcement posted');
  closeModal('modal-announcement');
  loadAnnouncements();
  await logActivity(id ? 'update_announcement' : 'create_announcement', 'announcements', id || 'new', { title });
}

/* ════════════════════════════════════════════════════════════
   16. INVENTORY
════════════════════════════════════════════════════════════ */
async function loadInventory() {
  const tbody = el('inventory-tbody');
  tbody.innerHTML = `<tr class="table-empty"><td colspan="8">Loading…</td></tr>`;

  const filter = el('inventory-search')?.value.trim() || '';

  let q = supabase.from('inventory').select('*').order('name', { ascending: true });
  if (filter) q = q.or(`name.ilike.%${filter}%,sku.ilike.%${filter}%,category.ilike.%${filter}%`);

  const { data, error } = await q;

  if (error) { tbody.innerHTML = `<tr class="table-empty"><td colspan="8">Error: ${escHtml(error.message)}</td></tr>`; return; }
  if (!data?.length) { tbody.innerHTML = `<tr class="table-empty"><td colspan="8">No inventory items</td></tr>`; return; }

  const canEdit = canDo('supervisor','warehouse_supervisor');
  tbody.innerHTML = data.map(item => {
    const isLow = item.quantity <= item.reorder_level;
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${escHtml(item.sku || '—')}</td>
      <td style="font-weight:600">${escHtml(item.name)}</td>
      <td>${escHtml(item.category || '—')}</td>
      <td style="font-family:var(--font-mono);font-weight:600;color:${isLow ? 'var(--danger)' : 'var(--text)'}">${item.quantity}</td>
      <td>${escHtml(item.unit || '—')}</td>
      <td style="font-family:var(--font-mono)">${item.reorder_level}</td>
      <td><span class="badge ${isLow ? 'badge-low' : 'badge-ok'}">${isLow ? 'Low Stock' : 'OK'}</span></td>
      <td>
        <div class="table-actions">
          ${canEdit ? `<button class="table-btn" onclick="openInventoryModal('${item.id}')">Edit</button>` : ''}
          ${canDo('supervisor') ? `<button class="table-btn danger" onclick="confirmDelete('inventory','${item.id}','${escHtml(item.name)}')">Delete</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function openInventoryModal(itemId = null) {
  el('inventory-modal-error').textContent = '';
  el('modal-inventory-title').textContent = itemId ? 'Edit Item' : 'Add Inventory Item';
  el('inventory-edit-id').value = itemId || '';
  ['inventory-sku','inventory-category','inventory-name','inventory-quantity','inventory-unit','inventory-reorder']
    .forEach(id => { el(id).value = ''; });

  if (itemId) {
    const { data: item } = await supabase.from('inventory').select('*').eq('id', itemId).single();
    if (item) {
      el('inventory-sku').value      = item.sku           || '';
      el('inventory-category').value = item.category      || '';
      el('inventory-name').value     = item.name          || '';
      el('inventory-quantity').value = item.quantity       ?? '';
      el('inventory-unit').value     = item.unit          || '';
      el('inventory-reorder').value  = item.reorder_level ?? '';
    }
  }

  openModal('modal-inventory');
}

async function handleSaveInventory() {
  const btn    = el('btn-save-inventory');
  const errEl  = el('inventory-modal-error');
  const id     = el('inventory-edit-id').value;
  const name   = el('inventory-name').value.trim();
  const qty    = parseInt(el('inventory-quantity').value);

  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Item name is required.'; return; }
  if (isNaN(qty)) { errEl.textContent = 'Quantity must be a number.'; return; }

  setButtonLoading(btn, true);

  const payload = {
    sku:           el('inventory-sku').value.trim(),
    category:      el('inventory-category').value.trim(),
    name,
    quantity:      qty,
    unit:          el('inventory-unit').value.trim(),
    reorder_level: parseInt(el('inventory-reorder').value) || 0,
    updated_at:    new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('inventory').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('inventory').insert({ ...payload, created_by: State.user.id }));
  }

  setButtonLoading(btn, false);

  if (error) { errEl.textContent = error.message; return; }

  showToast('success', id ? 'Item updated' : 'Item added');
  closeModal('modal-inventory');
  loadInventory();
  await logActivity(id ? 'update_inventory' : 'create_inventory', 'inventory', id || 'new', { name });
}

/* ════════════════════════════════════════════════════════════
   17. PAYMENTS
════════════════════════════════════════════════════════════ */
async function loadPayments() {
  const tbody = el('payments-tbody');
  tbody.innerHTML = `<tr class="table-empty"><td colspan="7">Loading…</td></tr>`;

  const statusFilter = el('payment-filter-status')?.value || '';

  let q = supabase.from('payments')
    .select('*, customers(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (statusFilter) q = q.eq('status', statusFilter);

  const { data, error } = await q;

  if (error) { tbody.innerHTML = `<tr class="table-empty"><td colspan="7">Error: ${escHtml(error.message)}</td></tr>`; return; }
  if (!data?.length) { tbody.innerHTML = `<tr class="table-empty"><td colspan="7">No payments found</td></tr>`; return; }

  const canEdit = canDo('supervisor','accounting','cashier');
  tbody.innerHTML = data.map(p => {
    const cust = p.customers ? `${p.customers.first_name||''} ${p.customers.last_name||''}`.trim() : '—';
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--blue);font-weight:600">${escHtml(p.reference || p.id.slice(0,8).toUpperCase())}</td>
      <td style="font-weight:600">${escHtml(cust)}</td>
      <td style="font-family:var(--font-mono);font-weight:700">₱${Number(p.amount||0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
      <td style="text-transform:capitalize">${escHtml((p.method||'').replace('_',' '))}</td>
      <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${formatDateTime(p.created_at)}</td>
      <td>${statusBadge(p.status)}</td>
      <td>
        <div class="table-actions">
          ${canEdit ? `<button class="table-btn" onclick="openPaymentModal('${p.id}')">Edit</button>` : ''}
          ${canDo('supervisor') ? `<button class="table-btn danger" onclick="confirmDelete('payments','${p.id}','payment ${escHtml(p.reference||'')}')">Delete</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function openPaymentModal(paymentId = null) {
  el('payment-modal-error').textContent = '';
  el('modal-payment-title').textContent = paymentId ? 'Edit Payment' : 'Record Payment';
  el('payment-edit-id').value = paymentId || '';
  ['payment-amount','payment-reference','payment-notes'].forEach(id => { el(id).value = ''; });

  const { data: customers } = await supabase.from('customers').select('id, first_name, last_name').order('first_name');
  el('payment-customer-select').innerHTML =
    `<option value="">Select customer…</option>` +
    (customers || []).map(c => `<option value="${c.id}">${escHtml(`${c.first_name||''} ${c.last_name||''}`.trim())}</option>`).join('');

  if (paymentId) {
    const { data: p } = await supabase.from('payments').select('*').eq('id', paymentId).single();
    if (p) {
      el('payment-customer-select').value = p.customer_id || '';
      el('payment-amount').value          = p.amount      || '';
      el('payment-method').value          = p.method      || 'cash';
      el('payment-reference').value       = p.reference   || '';
      el('payment-notes').value           = p.notes       || '';
    }
  }

  openModal('modal-payment');
}

async function handleSavePayment() {
  const btn    = el('btn-save-payment');
  const errEl  = el('payment-modal-error');
  const id     = el('payment-edit-id').value;
  const custId = el('payment-customer-select').value;
  const amount = parseFloat(el('payment-amount').value);

  errEl.textContent = '';
  if (!custId)      { errEl.textContent = 'Customer is required.'; return; }
  if (isNaN(amount) || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; return; }

  setButtonLoading(btn, true);

  const payload = {
    customer_id: custId,
    amount,
    method:      el('payment-method').value,
    reference:   el('payment-reference').value.trim(),
    notes:       el('payment-notes').value.trim(),
    status:      'paid',
    updated_at:  new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('payments').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('payments').insert({
      ...payload,
      created_by: State.user.id,
      created_at: new Date().toISOString(),
    }));
  }

  setButtonLoading(btn, false);

  if (error) { errEl.textContent = error.message; return; }

  showToast('success', id ? 'Payment updated' : 'Payment recorded', `₱${amount.toLocaleString('en-PH', {minimumFractionDigits:2})}`);
  closeModal('modal-payment');
  loadPayments();
  await logActivity(id ? 'update_payment' : 'create_payment', 'payments', id || 'new', { amount });
}

/* ════════════════════════════════════════════════════════════
   18. ACTIVITY LOGS (Supervisor)
════════════════════════════════════════════════════════════ */
async function loadLogs() {
  const tbody = el('logs-tbody');
  tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Loading…</td></tr>`;

  try {
    const { page, filter, role } = State.logs;
    const from = (page - 1) * CONFIG.PAGE_SIZE;
    const to   = from + CONFIG.PAGE_SIZE - 1;

    let q = supabase
      .from('activity_logs')
      .select('*, profiles(first_name, last_name, role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filter) q = q.or(`action.ilike.%${filter}%,target_table.ilike.%${filter}%`);
    if (role)   q = q.eq('profiles.role', role);

    const { data, count, error } = await q;
    if (error) throw error;

    State.logs.total = count || 0;

    if (!data?.length) {
      tbody.innerHTML = `<tr class="table-empty"><td colspan="6">No logs found</td></tr>`;
      el('logs-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(log => {
      const name = log.profiles ? `${log.profiles.first_name||''} ${log.profiles.last_name||''}`.trim() : '—';
      const roleLabel = ROLES[log.profiles?.role]?.label || log.profiles?.role || '—';
      return `<tr>
        <td style="font-family:var(--font-mono);font-size:var(--text-xs);white-space:nowrap">${formatDateTime(log.created_at)}</td>
        <td style="font-weight:600">${escHtml(name)}</td>
        <td><span class="role-chip" style="background:${ROLES[log.profiles?.role]?.color}18;color:${ROLES[log.profiles?.role]?.color}">${escHtml(roleLabel)}</span></td>
        <td style="text-transform:capitalize">${escHtml(formatAction(log.action))}</td>
        <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${escHtml(log.target_table || '—')}</td>
        <td style="font-size:var(--text-xs);color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${log.details ? escHtml(JSON.stringify(log.details)) : '—'}
        </td>
      </tr>`;
    }).join('');

    renderPagination('logs-pagination', State.logs.page, Math.ceil(State.logs.total / CONFIG.PAGE_SIZE), p => {
      State.logs.page = p; loadLogs();
    });

  } catch (err) {
    tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

async function exportLogsCSV() {
  const { data } = await supabase
    .from('activity_logs')
    .select('*, profiles(first_name, last_name, role)')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (!data?.length) { showToast('info', 'No logs to export'); return; }

  const headers = ['Time','User','Role','Action','Table','Details'];
  const rows = data.map(log => {
    const name = log.profiles ? `${log.profiles.first_name||''} ${log.profiles.last_name||''}`.trim() : '';
    return [
      formatDateTime(log.created_at),
      name,
      log.profiles?.role || '',
      formatAction(log.action),
      log.target_table || '',
      log.details ? JSON.stringify(log.details) : '',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mlsn-activity-logs-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('success', 'Logs exported');
}

async function logActivity(action, targetTable, targetId = null, details = null) {
  try {
    await supabase.from('activity_logs').insert({
      user_id:      State.user.id,
      action,
      target_table: targetTable,
      target_id:    targetId,
      details,
      created_at:   new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Log activity failed:', err.message);
  }
}

/* ════════════════════════════════════════════════════════════
   19. USER MANAGEMENT (Supervisor)
════════════════════════════════════════════════════════════ */
async function loadUsers() {
  const tbody = el('users-tbody');
  tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Loading…</td></tr>`;

  try {
    const { page, filter, role } = State.users;
    const from = (page - 1) * CONFIG.PAGE_SIZE;
    const to   = from + CONFIG.PAGE_SIZE - 1;

    let q = supabase.from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filter) q = q.or(`first_name.ilike.%${filter}%,last_name.ilike.%${filter}%,email.ilike.%${filter}%`);
    if (role)   q = q.eq('role', role);

    const { data, count, error } = await q;
    if (error) throw error;

    State.users.total = count || 0;

    if (!data?.length) {
      tbody.innerHTML = `<tr class="table-empty"><td colspan="6">No users found</td></tr>`;
      el('users-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(u => {
      const name  = `${u.first_name||''} ${u.last_name||''}`.trim() || '—';
      const rDef  = ROLES[u.role];
      const isOnline = !!State.onlineUsers[u.id];
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:.5rem">
            <div class="user-avatar" style="width:28px;height:28px;font-size:10px;background:${rDef?.color||'#1a3a6b'};border-color:${rDef?.color||'#4a9eff'}">${getInitials(name)}</div>
            <span style="font-weight:600">${escHtml(name)}</span>
          </div>
        </td>
        <td style="font-size:var(--text-xs)">${escHtml(u.email || '—')}</td>
        <td><span class="role-chip" style="background:${rDef?.color||'#2563eb'}18;color:${rDef?.color||'#2563eb'}">${escHtml(rDef?.label || u.role)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:.375rem">
            <div class="online-dot ${isOnline ? '' : 'offline'}"></div>
            <span style="font-size:var(--text-xs);color:var(--muted)">${isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${u.last_seen ? timeAgo(u.last_seen) : '—'}</td>
        <td>
          <div class="table-actions">
            <button class="table-btn" onclick="openUserModal('${u.id}')">Edit</button>
            <button class="table-btn primary" onclick="openResetPasswordModal('${u.id}','${escHtml(name)}')">Reset PW</button>
            ${u.id !== State.user.id ? `<button class="table-btn danger" onclick="confirmDelete('profiles','${u.id}','${escHtml(name)}')">Delete</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    renderPagination('users-pagination', State.users.page, Math.ceil(State.users.total / CONFIG.PAGE_SIZE), p => {
      State.users.page = p; loadUsers();
    });

  } catch (err) {
    tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

async function openUserModal(userId = null) {
  el('user-modal-error').textContent = '';
  el('modal-user-title').textContent = userId ? 'Edit User' : 'Add User';
  el('user-edit-id').value = userId || '';
  ['user-first-name','user-last-name','user-email','user-temp-password'].forEach(id => { el(id).value = ''; });

  const pwGroup = el('user-temp-password-group');
  if (pwGroup) pwGroup.style.display = userId ? 'none' : '';

  if (userId) {
    const { data: u } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (u) {
      el('user-first-name').value   = u.first_name || '';
      el('user-last-name').value    = u.last_name  || '';
      el('user-email').value        = u.email      || '';
      el('user-role-select').value  = u.role       || 'customer';
    }
  }

  openModal('modal-user');
}

async function handleSaveUser() {
  const btn   = el('btn-save-user');
  const errEl = el('user-modal-error');
  const id    = el('user-edit-id').value;
  const email = el('user-email').value.trim();
  const role  = el('user-role-select').value;
  const firstName = el('user-first-name').value.trim();
  const lastName  = el('user-last-name').value.trim();

  errEl.textContent = '';
  if (!email || !role) { errEl.textContent = 'Email and role are required.'; return; }

  setButtonLoading(btn, true);

  if (id) {
    // Update profile only (can't change email via client safely)
    const { error } = await supabase.from('profiles').update({
      first_name: firstName,
      last_name:  lastName,
      role,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    setButtonLoading(btn, false);
    if (error) { errEl.textContent = error.message; return; }
    showToast('success', 'User updated');
    await logActivity('update_user', 'profiles', id, { role });
  } else {
    // Create via Supabase admin — requires service role on server
    // Client-side: invite user (sends email)
    const tempPw = el('user-temp-password').value;
    if (!tempPw || tempPw.length < 8) { errEl.textContent = 'Temporary password must be at least 8 characters.'; setButtonLoading(btn, false); return; }

    // Note: signUp creates the auth user; profile is auto-created via DB trigger
    const { data: authData, error: authErr } = await supabase.auth.admin?.createUser
      ? await supabase.auth.admin.createUser({ email, password: tempPw, email_confirm: true })
      : await supabase.auth.signUp({ email, password: tempPw });

    if (authErr) { errEl.textContent = authErr.message; setButtonLoading(btn, false); return; }

    const newUid = authData?.user?.id;
    if (newUid) {
      await supabase.from('profiles').upsert({
        id: newUid, email, first_name: firstName, last_name: lastName, role,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }

    setButtonLoading(btn, false);
    showToast('success', 'User created', `${email} can now sign in.`);
    await logActivity('create_user', 'profiles', newUid, { email, role });
  }

  closeModal('modal-user');
  loadUsers();
}

function openResetPasswordModal(userId, userName) {
  el('reset-user-id').value = userId;
  el('reset-user-name').textContent = userName;
  el('reset-new-password').value = '';
  el('reset-modal-error').textContent = '';
  el('reset-modal-success').textContent = '';
  openModal('modal-reset-password');
}

async function handleResetPassword() {
  const btn    = el('btn-confirm-reset-password');
  const uid    = el('reset-user-id').value;
  const newPw  = el('reset-new-password').value;
  const errEl  = el('reset-modal-error');
  const succEl = el('reset-modal-success');

  errEl.textContent  = '';
  succEl.textContent = '';

  if (!newPw || newPw.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; return; }

  setButtonLoading(btn, true);

  // Supervisor resets via Supabase admin API (requires service role)
  // Fallback: send reset email
  const { data: u } = await supabase.from('profiles').select('email').eq('id', uid).single();
  if (!u) { errEl.textContent = 'User not found.'; setButtonLoading(btn, false); return; }

  const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  setButtonLoading(btn, false);

  if (error) {
    errEl.textContent = error.message;
  } else {
    succEl.textContent = `Reset link sent to ${u.email}`;
    showToast('success', 'Reset link sent', u.email);
    await logActivity('reset_user_password', 'profiles', uid, { email: u.email });
  }
}

/* ════════════════════════════════════════════════════════════
   20. ONLINE MONITOR
════════════════════════════════════════════════════════════ */
async function loadMonitor() {
  const grid = el('monitor-grid');
  grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

  const { data, error } = await supabase.from('profiles').select('*').order('first_name');
  if (error) { grid.innerHTML = '<p style="color:var(--muted)">Failed to load.</p>'; return; }

  const onlineIds = Object.keys(State.onlineUsers);
  let onlineCount = 0, offlineCount = 0;

  grid.innerHTML = (data || []).map(u => {
    const name  = `${u.first_name||''} ${u.last_name||''}`.trim() || u.email || '—';
    const rDef  = ROLES[u.role];
    const isOn  = onlineIds.includes(u.id);
    if (isOn) onlineCount++; else offlineCount++;
    const lastSeen = State.onlineUsers[u.id]?.online_at || u.last_seen;

    return `<div class="monitor-card ${isOn ? 'online' : ''}">
      <div class="monitor-avatar" style="background:${rDef?.color||'#1a3a6b'}">
        ${getInitials(name)}
        <div class="monitor-status-dot"></div>
      </div>
      <div class="monitor-info">
        <div class="monitor-name">${escHtml(name)}</div>
        <div class="monitor-role">${escHtml(rDef?.label || u.role || '—')}</div>
        <div class="monitor-last-seen">${isOn ? '● Online now' : (lastSeen ? timeAgo(lastSeen) : 'Never')}</div>
      </div>
    </div>`;
  }).join('');

  el('monitor-online-count').textContent  = `${onlineCount} Online`;
  el('monitor-offline-count').textContent = `${offlineCount} Offline`;
}

/* ════════════════════════════════════════════════════════════
   21. PRESENCE (Realtime)
════════════════════════════════════════════════════════════ */
function startPresence() {
  const p = State.profile;
  const name = `${p.first_name||''} ${p.last_name||''}`.trim() || p.email;

  State.presenceChannel = supabase.channel(CONFIG.PRESENCE_CHANNEL, {
    config: { presence: { key: State.user.id } },
  });

  State.presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = State.presenceChannel.presenceState();
      State.onlineUsers = {};
      Object.entries(presenceState).forEach(([uid, presences]) => {
        State.onlineUsers[uid] = presences[0] || {};
      });
      updateOnlineUI();
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      State.onlineUsers[key] = newPresences[0] || {};
      updateOnlineUI();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      delete State.onlineUsers[key];
      updateOnlineUI();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await State.presenceChannel.track({
          user_id:   State.user.id,
          name,
          role:      State.role,
          online_at: new Date().toISOString(),
        });
      }
    });

  // Update last_seen on unload
  window.addEventListener('beforeunload', () => {
    supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', State.user.id);
  });
}

function updateOnlineUI() {
  const count = Object.keys(State.onlineUsers).length;
  const navCount = el('nav-online-count');
  if (navCount) navCount.textContent = count;

  // Update monitor view if visible
  if (State.currentView === 'monitor') loadMonitor();
  if (State.currentView === 'users')   loadUsers();
}

/* ════════════════════════════════════════════════════════════
   22. REALTIME SUBSCRIPTIONS
════════════════════════════════════════════════════════════ */
function subscribeRealtime() {
  // Deliveries
  const delivCh = supabase.channel('rt-deliveries')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, payload => {
      if (State.currentView === 'deliveries') loadDeliveries();
      if (State.currentView === 'dashboard')  { loadActiveDeliveryStrip(); fetchStatValues(); }
      if (payload.eventType === 'UPDATE' && State.role === 'customer') {
        const d = payload.new;
        addNotification('delivery', `Delivery #${d.tracking_number} updated to ${d.status.replace('_',' ')}`, d.id);
      }
    })
    .subscribe();
  State.realtimeSubs.push(delivCh);

  // Announcements
  const announceCh = supabase.channel('rt-announcements')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, payload => {
      if (State.currentView === 'announcements') loadAnnouncements();
      addNotification('announcement', `New announcement: ${payload.new.title}`, payload.new.id);
      updateNavBadge('nav-badge-announce');
    })
    .subscribe();
  State.realtimeSubs.push(announceCh);

  // Messages (unread count)
  const msgCh = supabase.channel('rt-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages',
      filter: `recipient_id=eq.${State.user.id}` }, payload => {
      if (State.chatThread !== payload.new.conversation_id) {
        updateNavBadge('nav-badge-chat');
        addNotification('chat', 'New message received', payload.new.conversation_id);
      }
    })
    .subscribe();
  State.realtimeSubs.push(msgCh);
}

/* ════════════════════════════════════════════════════════════
   23. NOTIFICATIONS
════════════════════════════════════════════════════════════ */
let _notifications = [];

async function loadNotifications() {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', State.user.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(20);

  _notifications = data || [];
  renderNotifications();
}

function addNotification(type, message, refId = null) {
  const notif = {
    id:         crypto.randomUUID(),
    type,
    message,
    ref_id:     refId,
    read:       false,
    created_at: new Date().toISOString(),
  };
  _notifications.unshift(notif);
  renderNotifications();

  // Persist to DB
  supabase.from('notifications').insert({
    user_id:    State.user.id,
    type,
    message,
    ref_id:     refId,
    read:       false,
    created_at: notif.created_at,
  }).then(() => {});
}

function renderNotifications() {
  const list     = el('notification-list');
  const countEl  = el('notif-count');
  const unread   = _notifications.filter(n => !n.read).length;

  State.notifCount = unread;
  if (countEl) {
    countEl.textContent = unread;
    countEl.classList.toggle('hidden', unread === 0);
  }

  if (!_notifications.length) {
    list.innerHTML = '<div class="notif-empty">No new notifications</div>';
    return;
  }

  list.innerHTML = _notifications.slice(0,15).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="notif-icon">${notifIcon(n.type)}</div>
      <div class="notif-content">
        <div class="notif-title">${escHtml(notifTitle(n.type))}</div>
        <div class="notif-desc">${escHtml(n.message)}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('');
}

async function markAllNotificationsRead() {
  _notifications.forEach(n => n.read = true);
  renderNotifications();
  await supabase.from('notifications').update({ read: true }).eq('user_id', State.user.id).eq('read', false);
}

function toggleNotificationPanel() {
  const panel    = el('notification-panel');
  const dropdown = el('user-dropdown');
  dropdown?.classList.add('hidden');
  panel?.classList.toggle('hidden');
}

function notifTitle(type) {
  return { delivery: 'Delivery Update', chat: 'New Message', announcement: 'Announcement' }[type] || 'Notification';
}

function notifIcon(type) {
  const icons = {
    delivery:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    chat:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    announcement: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>`,
  };
  return icons[type] || icons.announcement;
}

function updateNavBadge(badgeId) {
  const el2 = el(badgeId);
  if (!el2) return;
  const count = parseInt(el2.textContent || '0') + 1;
  el2.textContent = count;
}

/* ════════════════════════════════════════════════════════════
   24. MODAL HELPERS
════════════════════════════════════════════════════════════ */
function openModal(modalId) {
  document.getElementById(modalId)?.classList.remove('hidden');
  el('modal-backdrop')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  if (!modalId) return;
  document.getElementById(modalId)?.classList.add('hidden');
  // Only hide backdrop if no other modals are open
  const anyOpen = document.querySelectorAll('.modal:not(.hidden)').length > 0;
  if (!anyOpen) {
    el('modal-backdrop')?.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function closeTopModal() {
  const openModals = document.querySelectorAll('.modal:not(.hidden)');
  if (openModals.length) closeModal(openModals[openModals.length - 1].id);
}

function confirmDelete(table, id, label) {
  el('modal-confirm-title').textContent   = 'Confirm Delete';
  el('modal-confirm-message').textContent = `Delete ${label}? This cannot be undone.`;
  State.confirmCallback = async () => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { showToast('error', 'Delete failed', error.message); return; }
    showToast('success', `${label} deleted`);
    await logActivity(`delete_${table.slice(0,-1)}`, table, id);
    loadView(State.currentView);
  };
  openModal('modal-confirm');
}

/* ════════════════════════════════════════════════════════════
   25. SIDEBAR HELPERS
════════════════════════════════════════════════════════════ */
function openSidebar() {
  el('sidebar')?.classList.add('open');
  el('sidebar-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  el('sidebar')?.classList.remove('open');
  el('sidebar-overlay')?.classList.remove('open');
  if (!document.querySelector('.modal:not(.hidden)')) document.body.style.overflow = '';
}

function closeAllDropdowns() {
  el('user-dropdown')?.classList.add('hidden');
}

/* ════════════════════════════════════════════════════════════
   26. TOAST SYSTEM
════════════════════════════════════════════════════════════ */
const TOAST_ICONS = {
  success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function showToast(type = 'info', title = '', message = '', duration = 4000) {
  const container = el('toast-container');
  const id   = `toast-${Date.now()}`;
  const html = `
    <div class="toast ${type}" id="${id}" role="alert">
      ${TOAST_ICONS[type] || TOAST_ICONS.info}
      <div class="toast-content">
        <div class="toast-title">${escHtml(title)}</div>
        ${message ? `<div class="toast-msg">${escHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" onclick="removeToast('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

function removeToast(id) {
  const toast = document.getElementById(id);
  if (!toast) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

/* ════════════════════════════════════════════════════════════
   27. PAGINATION RENDERER
════════════════════════════════════════════════════════════ */
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = el(containerId);
  if (!container || totalPages <= 1) { if (container) container.innerHTML = ''; return; }

  let html = `<span style="margin-right:auto">Page ${currentPage} of ${totalPages}</span>`;

  if (currentPage > 1) html += `<button class="page-btn" onclick="(${onPageChange.toString()})(${currentPage - 1})">‹</button>`;

  const start = Math.max(1, currentPage - 2);
  const end   = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="(${onPageChange.toString()})(${i})">${i}</button>`;
  }

  if (currentPage < totalPages) html += `<button class="page-btn" onclick="(${onPageChange.toString()})(${currentPage + 1})">›</button>`;

  container.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════
   28. UTILITY FUNCTIONS
════════════════════════════════════════════════════════════ */

/* DOM shorthand */
function el(id) { return document.getElementById(id); }

/* Escape HTML */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Debounce */
function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/* Initials */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

/* String to consistent color */
function strToColor(str) {
  let hash = 0;
  for (let i = 0; i < (str||'').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#1a3a6b','#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0284c7','#ea580c'];
  return colors[Math.abs(hash) % colors.length];
}

/* Status badge */
function statusBadge(status) {
  const MAP = {
    pending:     'badge-pending',
    processing:  'badge-transit',
    in_transit:  'badge-transit',
    delivered:   'badge-delivered',
    failed:      'badge-failed',
    paid:        'badge-paid',
    overdue:     'badge-overdue',
    active:      'badge-active',
    inactive:    'badge-inactive',
  };
  const label = (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `<span class="badge ${MAP[status] || 'badge-inactive'}">${escHtml(label)}</span>`;
}

/* Status color for map markers */
function statusColor(status) {
  return { pending:'#d97706', processing:'#0284c7', in_transit:'#2563eb', delivered:'#16a34a', failed:'#dc2626' }[status] || '#64748b';
}

/* Format action string */
function formatAction(action) {
  return (action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* Format date/time */
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* Time ago */
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400)return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

/* Start of current day ISO */
function startOfDay() {
  const d = new Date(); d.setHours(0,0,0,0);
  return d.toISOString();
}

/* Start of current month ISO */
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
  return d.toISOString();
}

/* Sum a numeric field from array */
function sumField(arr, field) {
  return ((arr || []).reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0))
    .toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

/* Count table rows */
async function countTable(table) {
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true });
  return count ?? 0;
}

/* Count unread chats for current user */
async function countUnreadChats() {
  const { count } = await supabase.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', State.user.id)
    .eq('read', false);
  return count ?? 0;
}

/* Generate tracking number */
function generateTracking() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'MLSN-';
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

/* Button loading state */
function setButtonLoading(btn, loading) {
  if (!btn) return;
  const label   = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled  = loading;
  if (label)   label.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

/* Hide initial loading overlay */
function hideLoading() {
  el('loading-overlay')?.classList.add('hidden');
}

/* Expose functions needed by inline onclick handlers */
window.openDeliveryTracker  = openDeliveryTracker;
window.openDeliveryModal    = openDeliveryModal;
window.openCustomerModal    = openCustomerModal;
window.openAnnouncementModal = openAnnouncementModal;
window.openInventoryModal   = openInventoryModal;
window.openPaymentModal     = openPaymentModal;
window.openUserModal        = openUserModal;
window.openResetPasswordModal = openResetPasswordModal;
window.openConversation     = openConversation;
window.startConversationWithAdmin = startConversationWithAdmin;
window.confirmDelete        = confirmDelete;
window.removeToast          = removeToast;
window.navigateTo           = navigateTo;
