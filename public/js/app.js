// public/js/app.js — Shared utilities and Supabase client

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Replace these with your actual Supabase project URL and anon key
// (anon key is safe to expose in frontend — it's public by design)
const SUPABASE_URL = 'https://jrnpicnlybscxarawshx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnBpY25seWJzY3hhcmF3c2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNzAxNzcsImV4cCI6MjA5MDc0NjE3N30.R9u3J31KVTfPlv0zIpc525-PMRiXbkDA5FL85QBnfJQ';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return null;
  }
  return user;
}

async function requireSubscription(minPlan = 'basic') {
  const profile = await getProfile();
  if (!profile) { window.location.href = '/login.html'; return null; }
  const plans = ['free', 'basic', 'premium'];
  if (plans.indexOf(profile.plan) < plans.indexOf(minPlan)) {
    window.location.href = '/pricing.html?upgrade=true';
    return null;
  }
  return profile;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

// ─── NAVBAR HYDRATION ─────────────────────────────────────────────────────────
async function hydrateNavbar() {
  const user = await getUser();
  const actionsEl = document.getElementById('navbar-actions');
  if (!actionsEl) return;

  if (user) {
    actionsEl.innerHTML = `
      <a href="/dashboard.html" class="btn btn-outline btn-sm">Dashboard</a>
      <button onclick="signOut()" class="btn btn-ghost btn-sm">Sign out</button>
    `;
  } else {
    actionsEl.innerHTML = `
      <a href="/login.html" class="btn btn-ghost btn-sm">Log in</a>
      <a href="/signup.html" class="btn btn-primary btn-sm">Get started</a>
    `;
  }
}

// ─── STRIPE CHECKOUT ──────────────────────────────────────────────────────────
async function startCheckout(plan) {
  const user = await getUser();
  if (!user) { window.location.href = '/signup.html?plan=' + plan; return; }

  const btn = document.getElementById('checkout-btn-' + plan);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Loading...'; }

  try {
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, userId: user.id, email: user.email }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error || 'Failed to create session');
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Get started'; }
  }
}

// ─── PROFIT CALCULATOR ────────────────────────────────────────────────────────
function calcProfit(buyPrice, sellPrice, platform = 'ebay', shippingCost = 0) {
  const fees = {
    ebay:    0.1295,
    depop:   0.10,
    mercari: 0.10,
    stockx:  0.09,
    facebook:0.05,
  };
  const fee = fees[platform] || 0.13;
  const platformFee = sellPrice * fee;
  const profit = sellPrice - buyPrice - platformFee - shippingCost;
  const roi = buyPrice > 0 ? ((profit / buyPrice) * 100) : 0;
  return { profit: profit.toFixed(2), roi: roi.toFixed(1), platformFee: platformFee.toFixed(2) };
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:999;display:flex;flex-direction:column;gap:.5rem;';
    document.body.appendChild(container);
  }

  const colors = { error: '#fee2e2:#991b1b', success: '#d1fae5:#065f46', info: '#dbeafe:#1d4ed8' };
  const [bg, color] = (colors[type] || colors.info).split(':');

  const toast = document.createElement('div');
  toast.style.cssText = `background:${bg};color:${color};padding:.8rem 1.2rem;border-radius:10px;font-size:.875rem;font-weight:500;max-width:300px;box-shadow:0 4px 16px rgba(0,0,0,.12);animation:slideIn .25s ease;`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all .25s'; setTimeout(() => toast.remove(), 250); }, 3500);
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────
function formatMoney(val) {
  return '$' + parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function getPlanBadge(plan) {
  const badges = {
    free:    '<span class="badge badge-blue">Free</span>',
    basic:   '<span class="badge" style="background:#e0f2fe;color:#0369a1">Basic</span>',
    premium: '<span class="badge" style="background:#fef3c7;color:#92400e">⭐ Premium</span>',
  };
  return badges[plan] || badges.free;
}

// ─── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  hydrateNavbar();

  // Handle ?success=true after Stripe checkout
  const params = new URLSearchParams(window.location.search);
  if (params.get('success') === 'true') {
    window.history.replaceState({}, '', window.location.pathname);
    const plan = params.get('plan');
    const sessionId = params.get('session_id');
    if (plan && sessionId) {
      showToast('🎉 Payment confirmed! Activating your plan...', 'success');
      activatePlan(plan, sessionId);
    } else {
      showToast('🎉 Subscription activated! Welcome to ResellAI.', 'success');
      setTimeout(() => window.location.reload(), 1500);
    }
  }
  if (params.get('canceled') === 'true') {
    showToast('Checkout canceled — your plan was not changed.', 'info');
    window.history.replaceState({}, '', window.location.pathname);
  }
});

async function activatePlan(plan, sessionId) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Please log in again.', 'error'); return; }

    const res = await fetch(
      'https://jrnpicnlybscxarawshx.supabase.co/functions/v1/activate-plan',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnBpY25seWJzY3hhcmF3c2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNzAxNzcsImV4cCI6MjA5MDc0NjE3N30.R9u3J31KVTfPlv0zIpc525-PMRiXbkDA5FL85QBnfJQ',
        },
        body: JSON.stringify({ session_id: sessionId, plan }),
      }
    );
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Subscription activated! Welcome to ResellAI.', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      console.error('activate-plan error:', data.error);
      showToast('🎉 Payment received! Your plan will activate shortly.', 'success');
      setTimeout(() => window.location.reload(), 3000);
    }
  } catch (err) {
    console.error('activatePlan error:', err);
    showToast('🎉 Payment received! Your plan will activate shortly.', 'success');
    setTimeout(() => window.location.reload(), 3000);
  }
}
