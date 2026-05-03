'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const DB = {
  users: 'BB4_users',
  agents: 'BB4_agents',
  products: 'BB4_products',
  orders: 'BB4_orders',
  cart: 'BB4_cart',
  wish: 'BB4_wish',
  session: 'BB4_session',
  agentSession: 'BB4_agentSession',
  adminSession: 'BB4_adminSession',
  settings: 'BB4_settings',
  categories: 'BB4_categories',
  notifications: 'BB4_notifications',
  viewedOrders: 'BB4_viewedOrders'
};

const ROLE_KEY = 'BB50_activeRole';
const phonePrefix = '+85620';
const phonePrefixPretty = '+856 20';
const DEFAULT_ADMIN_PHONE = '8562099809749';
const DEFAULT_SETTINGS = {
  shopName: 'Bai Boua',
  adminPhone: DEFAULT_ADMIN_PHONE,
  adminId: 'Maliluv_',
  adminPass: 'Maliluv_277',
  sound: true,
  agentWeeklyMin: 7
};

// v56 Supabase-ready sync. Existing localStorage is kept as offline cache, and shared shop data is mirrored to Supabase.
// This is an anon key. Never put a service_role key in frontend code.
const SUPABASE_URL = 'https://fflekcbkrtddmofqxcuu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmbGVrY2JrcnRkZG1vZnF4Y3V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTgyMzgsImV4cCI6MjA5Mjc5NDIzOH0.zBorq0fm3ZrCNsSUBqv7XGLNrGp1Yzv8cULdp4ut3uU';
const CLOUD_KEYS = [DB.users, DB.agents, DB.products, DB.orders, DB.settings, DB.categories, DB.notifications, DB.viewedOrders];
let cloudClient = null;
let cloudPulling = false;
const cloudTimers = {};

function getCloudClient() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!cloudClient) cloudClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cloudClient;
}
function setCloudStatus(next) {
  const badge = document.getElementById('bb-cloud-status');
  if (!badge) return;
  badge.textContent = next === 'online' ? '☁️ Sync' : next === 'syncing' ? '☁️ Syncing' : '☁️ Offline';
  badge.className = `cloud-status ${next}`;
}
async function cloudSaveNow(key, value) {
  if (cloudPulling || !CLOUD_KEYS.includes(key)) return;
  const client = getCloudClient();
  if (!client) { setCloudStatus('offline'); return; }
  try {
    setCloudStatus('syncing');
    const { error } = await client.from('bb_state').upsert({ key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    setCloudStatus('online');
  } catch (err) {
    console.warn('Supabase save failed:', key, err);
    setCloudStatus('offline');
  }
}
function cloudSave(key, value) {
  if (cloudPulling || !CLOUD_KEYS.includes(key)) return;
  clearTimeout(cloudTimers[key]);
  cloudTimers[key] = setTimeout(() => cloudSaveNow(key, value), 450);
}
async function cloudUploadAll() {
  const client = getCloudClient();
  if (!client) return false;
  try {
    setCloudStatus('syncing');
    const rows = CLOUD_KEYS.map(key => {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      try { return { key, data: JSON.parse(raw), updated_at: new Date().toISOString() }; }
      catch (err) { return null; }
    }).filter(Boolean);
    if (rows.length) {
      const { error } = await client.from('bb_state').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }
    setCloudStatus('online');
    return true;
  } catch (err) {
    console.warn('Supabase upload failed:', err);
    setCloudStatus('offline');
    return false;
  }
}
async function cloudLoadAll() {
  const client = getCloudClient();
  if (!client) { setCloudStatus('offline'); return false; }
  try {
    setCloudStatus('syncing');
    const { data, error } = await client.from('bb_state').select('key,data,updated_at');
    if (error) throw error;
    if (!data || !data.length) { await cloudUploadAll(); return false; }
    cloudPulling = true;
    for (const row of data) {
      if (CLOUD_KEYS.includes(row.key)) localStorage.setItem(row.key, JSON.stringify(row.data));
    }
    cloudPulling = false;
    setCloudStatus('online');
    return true;
  } catch (err) {
    cloudPulling = false;
    console.warn('Supabase load failed:', err);
    setCloudStatus('offline');
    return false;
  }
}

const statusLabel = {
  pending_payment: 'ລໍຖ້າໂອນ',
  slip_uploaded: 'ລໍຖ້າກວດ Slip',
  paid: 'ຢືນຢັນການໂອນແລ້ວ',
  waiting_china: 'ລໍຖ້າເຄື່ອງມາແຕ່ຈີນ',
  arrived: 'ເຄື່ອງຮອດແລ້ວ',
  preparing: 'ກຳລັງກຽມສິນຄ້າ',
  packed: 'ແພັກແລ້ວ',
  waiting_bill: 'ລໍຖ້າບິນຂົນສົ່ງ',
  bill_sent: 'ແຈ້ງບິນແລ້ວ',
  shipped: 'ສົ່ງແລ້ວ',
  completed: 'ສຳເລັດ',
  cancelled: 'ຍົກເລີກ',
  rejected: 'Slip ບໍ່ຖືກ / ຕ້ອງອັບໃໝ່'
};
const readyFlow = ['pending_payment', 'slip_uploaded', 'paid', 'preparing', 'packed', 'waiting_bill', 'bill_sent', 'shipped', 'completed'];
const preorderFlow = ['pending_payment', 'slip_uploaded', 'paid', 'waiting_china', 'arrived', 'preparing', 'packed', 'waiting_bill', 'bill_sent', 'shipped', 'completed'];
const deductStatuses = new Set(['paid', 'waiting_china', 'arrived', 'preparing', 'packed', 'waiting_bill', 'bill_sent', 'shipped', 'completed']);
const avatars = ['🐱', '🐰', '🧸', '🌸', '🦋', '🎀', '🐣', '🪷'];
const shippingMethods = ['Anousith', 'HAL', 'Mixay', 'Unitel'];
const tracks = ['sounds/cat-and-flowers.mp3', 'sounds/cat-with-chick.mp3', 'sounds/dream-cat.mp3'];

let state = {
  page: 'home',
  authRole: 'customer',
  type: 'all',
  gender: 'all',
  cat: 'ທັງໝົດ',
  wishType: 'all',
  adminTab: 'overview',
  adminStatus: 'all',
  adminKind: 'all',
  adminSearch: '',
  adminSummaryDate: '',
  agentStatus: 'all',
  productDetail: null,
  editProductImages: [],
  sound: true,
  music: false,
  track: 0,
  audioCtx: null
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    return fallback;
  }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); cloudSave(key, value); }
function removeKey(key) { cloudSave(key, null); localStorage.removeItem(key); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'}[ch]));
}
function digits(value) { return String(value ?? '').replace(/\D/g, ''); }
function laoPhoneTail(value) {
  let d = digits(value);
  if (d.startsWith('85620')) d = d.slice(5);
  else if (d.startsWith('020')) d = d.slice(3);
  else if (d.startsWith('20') && d.length >= 10) d = d.slice(2);
  if (d.length > 8) d = d.slice(-8);
  return d;
}
function normPhone(value) { return phonePrefix + laoPhoneTail(value); }
function phoneTail(value) { return laoPhoneTail(value); }
function validPhoneTail(value) { return laoPhoneTail(value).length === 8; }
function prettyPhone(value) { const tail = laoPhoneTail(value); return tail ? `${phonePrefixPretty} ${tail}` : `${phonePrefixPretty} `; }
function enforcePhonePrefixInput(input) {
  if (!input) return;
  const tail = laoPhoneTail(input.value);
  input.value = `${phonePrefixPretty} ${tail}`;
  input.setAttribute('maxlength', String(phonePrefixPretty.length + 1 + 8));
}
function bindDigitTailInput(input, max = 8) {
  if (!input) return;
  input.addEventListener('input', e => { e.target.value = digits(e.target.value).slice(0, max); });
}
function moneyValue(value) { return Math.max(0, Math.round(Number(value || 0))); }
function money(value) { return `${moneyValue(value).toLocaleString()} Kip`; }
function uid(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`; }
function niceDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('lo-LA'); } catch (err) { return iso; }
}
function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), 2600);
}
function settings() { return {...DEFAULT_SETTINGS, ...load(DB.settings, {})}; }
function saveSettings(next) { save(DB.settings, {...settings(), ...next}); }
function adminPhoneDigits() { return digits(settings().adminPhone || DEFAULT_ADMIN_PHONE); }
function waLink(text, phone = adminPhoneDigits()) { return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`; }
function authHelpHtml() {
  return `<a class="wa-help" target="_blank" rel="noopener" href="${waLink('ສະບາຍດີ Admin Bai Boua, ຂ້ອຍລືມລະຫັດ ກະລຸນາຊ່ວຍປ່ຽນໃຫ້ແນ່')}">ລືມລະຫັດ? ກົດຕິດຕໍ່ Admin WhatsApp: +${adminPhoneDigits()}</a>`;
}
function updateAuthHelp() { const help = $('#bb-auth-help'); if (help) help.innerHTML = authHelpHtml(); }
function statusText(status) { return statusLabel[status] || status || '-'; }
function statusClass(status) {
  if (['paid', 'preparing', 'packed', 'bill_sent', 'shipped', 'completed', 'arrived'].includes(status)) return 'good';
  if (['pending_payment', 'slip_uploaded', 'waiting_china', 'waiting_bill'].includes(status)) return 'warn';
  if (['cancelled', 'rejected'].includes(status)) return 'bad';
  return '';
}
function play(kind = 'click') {
  if (!state.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const map = {
      click: [560, .055, 'sine', .030],
      success: [720, .090, 'triangle', .036],
      error: [150, .120, 'sawtooth', .030],
      delete: [330, .070, 'sine', .032],
      notify: [880, .110, 'triangle', .036]
    };
    const [freq, dur, type, vol] = map[kind] || map.click;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur);
  } catch (err) {}
}
function debounce(fn, wait = 180) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
  ta.remove();
  return Promise.resolve(ok);
}
function readImageFile(file, maxSize = 1000, quality = .78) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file read failed'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (!String(file.type || '').startsWith('image/')) return resolve(dataUrl);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function seedProducts() {
  return [
    {id:'P001', name:'ເສື້ອ Bow Vintage', category:'ເສື້ອ', gender:'female', type:'ready', price:129000, agentPrice:109000, desc:'ເສື້ອໂທນຫວານ ຜ້ານຸ່ມ ໃສ່ໄດ້ຫຼາຍລຸກ.', emoji:'🎀', image:'', active:true, variants:[{name:'ຂາວ / S', stock:4}, {name:'ຂາວ / M', stock:6}, {name:'ຊົມພູ / M', stock:2}], reviews:[]},
    {id:'P002', name:'ກະໂປງ Floral Soft', category:'ກະໂປງ', gender:'female', type:'ready', price:85000, agentPrice:72000, desc:'ກະໂປງລາຍດອກ ໂທນ vintage.', emoji:'🌸', image:'', active:true, variants:[{name:'Sage / S', stock:3}, {name:'Cream / M', stock:5}], reviews:[]},
    {id:'P003', name:'ເກີບ Mary Jane', category:'ເກີບ', gender:'unisex', type:'preorder', price:145000, agentPrice:125000, desc:'ສິນຄ້າ Pre-order ຫຼັງຈາກສັ່ງແລ້ວຕ້ອງລໍຖ້າປະມານ 14-18 ມື້.', emoji:'👞', image:'', active:true, variants:[{name:'Black / 36', stock:9999}, {name:'Black / 37', stock:9999}, {name:'Brown / 38', stock:9999}], reviews:[]},
    {id:'P004', name:'ເສື້ອ Oversize Minimal', category:'ເສື້ອ', gender:'unisex', type:'preorder', price:99000, agentPrice:84000, desc:'ແນວ minimal ສຳລັບທຸກຄົນ ສັ່ງໄດ້ຕະຫຼອດ.', emoji:'👕', image:'', active:true, variants:[{name:'Black / M', stock:9999}, {name:'White / L', stock:9999}], reviews:[]}
  ];
}
function cleanupRemovedSystems() {
  const banned = /reward|redeem|coupon|points|ຄະແນນ|ແຕ້ມ|ຂອງຂວັນ/i;
  Object.keys(localStorage).forEach(key => {
    if (banned.test(key)) localStorage.removeItem(key);
  });
}
function initData() {
  cleanupRemovedSystems();
  if (!localStorage.getItem(DB.categories)) save(DB.categories, ['ເສື້ອ', 'ກະໂປງ', 'ໂສ້ງ', 'ເກີບ', 'ໝວກ', 'ສາຍແຂນ', 'ຕຸກກະຕາ', 'ອື່ນໆ']);
  if (!localStorage.getItem(DB.users)) save(DB.users, []);
  if (!localStorage.getItem(DB.agents)) save(DB.agents, [{id:'AGENT01', pass:'01', name:'Agent Demo', phone:'+8562099809749', active:true, createdAt:new Date().toISOString()}]);
  if (!localStorage.getItem(DB.orders)) save(DB.orders, []);
  if (!localStorage.getItem(DB.cart)) save(DB.cart, []);
  if (!localStorage.getItem(DB.wish)) save(DB.wish, []);
  if (!localStorage.getItem(DB.settings)) save(DB.settings, DEFAULT_SETTINGS);
  if (!localStorage.getItem(DB.products)) save(DB.products, seedProducts());
  migrateProductsForV52();
  reconcileStoredOrderTotals();
  if (!localStorage.getItem(DB.notifications)) save(DB.notifications, []);
  if (!localStorage.getItem(DB.viewedOrders)) save(DB.viewedOrders, {});
  enforceAgentRules(false);
  state.sound = settings().sound !== false;
}

function users() { return load(DB.users, []); }
function saveUsers(list) { save(DB.users, list); }
function agents() { return load(DB.agents, []); }
function saveAgents(list) { save(DB.agents, list); }
function products() { return load(DB.products, []); }
function saveProducts(list) { save(DB.products, list); }
function orders() { return load(DB.orders, []); }
function saveOrders(list) { save(DB.orders, list); }
function cart() { return load(DB.cart, []); }
function saveCart(list) { save(DB.cart, list); renderCart(); }
function wishes() { return load(DB.wish, []); }
function saveWishes(list) { save(DB.wish, list); }
function categories() { return load(DB.categories, []); }
function saveCategories(list) { save(DB.categories, list); }
function notifications() { return load(DB.notifications, []); }
function saveNotifications(list) { save(DB.notifications, list.slice(0, 160)); updateNotifyBadge(); }
function viewedOrders() { return load(DB.viewedOrders, {}); }
function saveViewedOrders(map) { save(DB.viewedOrders, map); }
function viewedScopeKey() {
  const role = currentRole();
  if (role === 'admin') return 'admin';
  if (role === 'agent') return `agent:${currentAgent()?.id || ''}`;
  if (role === 'customer') return `customer:${currentCustomer()?.id || ''}`;
  return '';
}
function markOrderViewed(id) {
  const scope = viewedScopeKey();
  if (!scope || !id) return;
  const map = viewedOrders();
  map[scope] = Array.isArray(map[scope]) ? map[scope] : [];
  if (!map[scope].includes(id)) map[scope].push(id);
  saveViewedOrders(map);
}
function hasViewedOrder(o) {
  const scope = viewedScopeKey();
  if (!scope || !o?.id) return false;
  return (viewedOrders()[scope] || []).includes(o.id);
}
function agentWeeklyMin() { return Math.max(1, Number(settings().agentWeeklyMin || 7)); }
function samePhone(a, b) { return digits(normPhone(a)) === digits(normPhone(b)); }

function notifyTargetForOrder(o) {
  if (o?.userId) return {role:'customer', id:o.userId};
  if (o?.agentId) return {role:'agent', id:o.agentId};
  return null;
}
function addNotification(role, targetId, text, orderId = '', type = 'info') {
  if (!role || !targetId || !text) return;
  const list = notifications();
  list.unshift({id:uid('N'), role, targetId, text, orderId, type, read:false, createdAt:new Date().toISOString()});
  saveNotifications(list);
}
function addAdminNotification(text, orderId = '', type = 'admin') { addNotification('admin', 'admin', text, orderId, type); }
function notifyOrderOwner(o, text, type = 'status') {
  const target = notifyTargetForOrder(o);
  if (target) addNotification(target.role, target.id, text, o.id, type);
}
function currentNotificationTarget() {
  const role = currentRole();
  if (role === 'admin') return {role:'admin', id:'admin'};
  if (role === 'agent') return {role:'agent', id:currentAgent()?.id || ''};
  if (role === 'customer') return {role:'customer', id:currentCustomer()?.id || ''};
  return null;
}
function myNotifications() {
  const target = currentNotificationTarget();
  if (!target?.id) return [];
  return notifications().filter(n => n.role === target.role && n.targetId === target.id);
}
function unreadNotificationCount() { return myNotifications().filter(n => !n.read).length; }
function updateNotifyBadge() {
  const btn = $('#notifyBtn');
  const badge = $('#notifyCount');
  if (!btn || !badge) return;
  const role = currentRole();
  btn.style.display = role ? '' : 'none';
  const count = role ? unreadNotificationCount() : 0;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count <= 0);
  btn.classList.toggle('has-alert', count > 0);
}
function markMyNotificationsRead() {
  const target = currentNotificationTarget();
  if (!target?.id) return;
  const list = notifications();
  let changed = false;
  list.forEach(n => {
    if (n.role === target.role && n.targetId === target.id && !n.read) { n.read = true; changed = true; }
  });
  if (changed) saveNotifications(list);
}
function openNotifications() {
  const list = myNotifications();
  const rows = list.slice(0, 60).map(n => `<div class="notify-row ${n.read ? '' : 'unread'}"><div><b>${esc(n.text)}</b><br><span class="muted">${niceDate(n.createdAt)}</span></div>${n.orderId ? `<button type="button" class="outline" data-notify-order="${esc(n.orderId)}">ເບິ່ງອໍເດີ</button>` : ''}</div>`).join('') || '<div class="note">ຍັງບໍ່ມີແຈ້ງເຕືອນ</div>';
  openModal(`<div class="modal"><div class="modal-head"><h2>🔔 ແຈ້ງເຕືອນ</h2><button class="icon-btn" type="button" data-close>✕</button></div><div class="notify-list">${rows}</div></div>`);
  $$('[data-notify-order]', $('#modalLayer')).forEach(btn => btn.onclick = () => openOrderDetail(btn.dataset.notifyOrder));
  markMyNotificationsRead();
}

function agentWindowStart(a) {
  const raw = a?.weekStartedAt || a?.createdAt || new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
function isCountableAgentOrder(o, a) {
  if (!o || !a) return false;
  if (o.agentId !== a.id) return false;
  if (!deductStatuses.has(o.status)) return false;
  if (samePhone(o.customer?.phone || '', a.phone || '')) return false;
  return true;
}
function agentRuleStatus(a) {
  const min = agentWeeklyMin();
  const start = agentWindowStart(a);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const inWindow = orders().filter(o => o.agentId === a.id && new Date(o.createdAt || 0) >= start && new Date(o.createdAt || 0) < end);
  const countable = inWindow.filter(o => isCountableAgentOrder(o, a));
  const selfOrders = inWindow.filter(o => samePhone(o.customer?.phone || '', a.phone || ''));
  const count = countable.length;
  return {
    min, start, end, count, selfCount:selfOrders.length,
    remaining:Math.max(0, min - count),
    percent:Math.min(100, Math.round((count / min) * 100)),
    daysLeft:Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
    expired:now >= end
  };
}
function enforceAgentRules() {
  const list = agents();
  let changed = false;
  const nowIso = new Date().toISOString();
  list.forEach(a => {
    if (!a.weekStartedAt) { a.weekStartedAt = a.createdAt || nowIso; changed = true; }
    const st = agentRuleStatus(a);
    a.weekOrderCount = st.count;
    a.weekSelfOrderCount = st.selfCount;
    a.weekDeadline = st.end.toISOString();
    if (a.active !== false && st.expired) {
      if (st.count >= st.min) {
        a.weekStartedAt = nowIso;
        a.weekOrderCount = 0;
        a.weekSelfOrderCount = 0;
        a.weekDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        changed = true;
      } else {
        a.active = false;
        a.autoBlocked = true;
        a.blockedAt = nowIso;
        a.blockReason = `ອາທິດນີ້ໄດ້ ${st.count}/${st.min} ອໍເດີ`;
        addAdminNotification(`Agent ${a.name || a.id} ຖືກປິດ ID ອັດຕະໂນມັດ: ${a.blockReason}`, '', 'agent');
        changed = true;
      }
    }
  });
  if (changed) saveAgents(list);
}
function agentRuleCard(a) {
  const st = agentRuleStatus(a);
  const warning = st.selfCount ? `<div class="status warn">${st.selfCount} ອໍເດີທີ່ເບີກົງກັບຕົວແທນ ບໍ່ນັບ</div>` : '';
  const blocked = a.active === false ? `<div class="status bad">ID ຖືກປິດ${a.blockReason ? ': ' + esc(a.blockReason) : ''}</div>` : '';
  return `<div class="agent-rule-card"><div class="rule-head"><div><b>ເງື່ອນໄຂຕົວແທນ</b><p class="muted">ຕ້ອງໄດ້ ${st.min} ອໍເດີ/7 ມື້ · ເຫຼືອ ${st.daysLeft} ມື້</p></div><strong>${st.count}/${st.min}</strong></div><div class="rule-bar"><span style="width:${st.percent}%"></span></div><p class="muted">ນັບສະເພາະອໍເດີທີ່ Admin ຢືນຢັນ Slip ແລ້ວ ແລະ ບໍ່ແມ່ນເບີຕົວແທນເອງ.</p>${warning}${blocked}</div>`;
}


function currentCustomer() {
  const id = load(DB.session, null);
  return users().find(u => u.id === id) || null;
}
function currentAgent() {
  const id = load(DB.agentSession, null);
  return agents().find(a => a.id === id && a.active !== false) || null;
}
function adminLogged() { return load(DB.adminSession, false) === true; }
function currentRole() {
  const remembered = localStorage.getItem(ROLE_KEY);
  if (remembered === 'admin' && adminLogged()) return 'admin';
  if (remembered === 'agent' && currentAgent()) return 'agent';
  if (remembered === 'customer' && currentCustomer()) return 'customer';
  if (adminLogged()) return 'admin';
  if (currentAgent()) return 'agent';
  if (currentCustomer()) return 'customer';
  return null;
}
function currentAccount() {
  const role = currentRole();
  if (role === 'admin') return {id: settings().adminId, name: 'Admin Bai Boua', role: 'admin', avatar: '🪷'};
  if (role === 'agent') return currentAgent();
  if (role === 'customer') return currentCustomer();
  return null;
}
function setSession(role, id = null) {
  removeKey(DB.session);
  removeKey(DB.agentSession);
  removeKey(DB.adminSession);
  if (role === 'customer') save(DB.session, id);
  if (role === 'agent') save(DB.agentSession, id);
  if (role === 'admin') save(DB.adminSession, true);
  localStorage.setItem(ROLE_KEY, role);
}
function clearSessions() {
  removeKey(DB.session);
  removeKey(DB.agentSession);
  removeKey(DB.adminSession);
  removeKey(ROLE_KEY);
}

function bbAuthSwitch(role) {
  state.authRole = role;
  $$('#bb-auth-tabs [data-auth-role]').forEach(btn => btn.classList.toggle('active', btn.dataset.authRole === role));
  const title = $('#bb-auth-title');
  const nameInput = $('#bb-auth-name');
  const idInput = $('#bb-auth-id');
  const passInput = $('#bb-auth-pass');
  const hint = $('#bb-customer-register-hint');
  const register = $('#bb-register-btn');
  idInput.value = '';
  passInput.value = '';
  updateAuthHelp();
  if (role === 'customer') {
    title.textContent = 'ລູກຄ້າຮ້ານໃບບົວ';
    nameInput.classList.remove('hidden');
    nameInput.placeholder = 'ຊື່ ສຳລັບສ້າງບັນຊີ';
    idInput.placeholder = '+856 20 ແລ້ວຕາມດ້ວຍ 8 ຕົວເລກ';
    idInput.inputMode = 'numeric';
    enforcePhonePrefixInput(idInput);
    hint.classList.remove('hidden');
    register.classList.remove('hidden');
  } else if (role === 'agent') {
    title.textContent = 'ລະບົບຕົວແທນ';
    nameInput.classList.add('hidden');
    idInput.placeholder = 'Agent ID';
    idInput.inputMode = 'text';
    idInput.removeAttribute('maxlength');
    hint.classList.add('hidden');
    register.classList.add('hidden');
  } else {
    title.textContent = 'Admin Dashboard';
    nameInput.classList.add('hidden');
    idInput.placeholder = 'Admin ID';
    idInput.inputMode = 'text';
    idInput.removeAttribute('maxlength');
    hint.classList.add('hidden');
    register.classList.add('hidden');
  }
}
function bbAuthRegisterCustomer() {
  const name = $('#bb-auth-name').value.trim();
  const phone = normPhone($('#bb-auth-id').value);
  const pass = $('#bb-auth-pass').value.trim();
  if (!name) return toast('ກະລຸນາໃສ່ຊື່');
  if (!validPhoneTail(phone)) return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກ');
  if (pass.length < 4) return toast('ລະຫັດຕ້ອງຢ່າງນ້ອຍ 4 ຕົວ');
  const list = users();
  if (list.some(u => u.phone === phone)) return toast('ເບີນີ້ມີບັນຊີແລ້ວ');
  const user = {id: uid('CUS'), name, phone, pass, avatar: avatars[Math.floor(Math.random()*avatars.length)], createdAt: new Date().toISOString()};
  list.push(user);
  saveUsers(list);
  setSession('customer', user.id);
  play('success');
  toast('ສ້າງບັນຊີສຳເລັດ');
  state.page = 'home';
  renderAll();
}
function bbAuthLogin() {
  const idRaw = $('#bb-auth-id').value.trim();
  const pass = $('#bb-auth-pass').value.trim();
  if (!idRaw || !pass) return toast('ກະລຸນາໃສ່ ID/ເບີ ແລະ ລະຫັດ');
  if (state.authRole === 'customer') {
    if (!validPhoneTail(idRaw)) return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກຫຼັງ +856 20');
    const phone = normPhone(idRaw);
    const user = users().find(u => u.phone === phone);
    if (!user) { play('error'); return toast('ເບີນີ້ຍັງບໍ່ທັນລົງທະບຽນ'); }
    if (String(user.pass) !== pass) { play('error'); return toast('ເບີ ຫຼື ລະຫັດຂອງທ່ານບໍ່ຖືກຕ້ອງ'); }
    setSession('customer', user.id);
    state.page = 'home';
  } else if (state.authRole === 'agent') {
    enforceAgentRules();
    const inactiveAgent = agents().find(a => a.id === idRaw && String(a.pass) === pass && a.active === false);
    if (inactiveAgent) { play('error'); return toast(inactiveAgent.blockReason ? `Agent ID ຖືກປິດ: ${inactiveAgent.blockReason}` : 'Agent ID ຖືກປິດ ກະລຸນາຕິດຕໍ່ Admin'); }
    const agent = agents().find(a => a.id === idRaw && String(a.pass) === pass && a.active !== false);
    if (!agent) { play('error'); return toast('Agent ID ຫຼື Password ບໍ່ຖືກ'); }
    setSession('agent', agent.id);
    state.page = 'agent';
  } else {
    const cfg = settings();
    if (idRaw !== cfg.adminId || pass !== cfg.adminPass) { play('error'); return toast('Admin ID ຫຼື Password ບໍ່ຖືກ'); }
    setSession('admin');
    state.page = 'admin';
  }
  play('success');
  toast('ເຂົ້າລະບົບສຳເລັດ');
  renderAll();
}
function bbAuthLogout() {
  clearSessions();
  saveCart([]);
  closeCart();
  closeProfileCard();
  state.page = 'home';
  play('click');
  renderAll();
}
function updateAuthGate() {
  const role = currentRole();
  const gate = $('#bb-auth-gate');
  gate.classList.toggle('hidden', !!role);
  document.body.classList.toggle('auth-open', !role);
  if (!role) bbAuthSwitch(state.authRole || 'customer');
}
function roleName(role) { return {customer:'ລູກຄ້າ', agent:'ຕົວແທນ', admin:'Admin'}[role] || role; }
function updateProfileChip() {
  const role = currentRole();
  const account = currentAccount();
  const chip = $('#bb-profile-chip');
  if (!role || !account) { chip.classList.remove('show'); return; }
  chip.classList.add('show');
  chip.textContent = `${account.avatar || (role === 'admin' ? '🪷' : role === 'agent' ? '👤' : '🐱')} ${account.name || roleName(role)}`;
}
function openProfileCard() {
  const role = currentRole();
  const account = currentAccount();
  if (!role || !account) return;
  $('#bb-profile-avatar').textContent = account.avatar || (role === 'admin' ? '🪷' : role === 'agent' ? '👤' : '🐱');
  $('#bb-profile-name').textContent = account.name || roleName(role);
  $('#bb-profile-role').textContent = roleName(role);
  let info = '';
  if (role === 'customer') info = `<b>ID:</b> ${esc(account.id)}<br><b>ເບີ:</b> ${esc(account.phone || '-')}`;
  if (role === 'agent') info = `<b>Agent ID:</b> ${esc(account.id)}<br><b>ເບີ:</b> ${esc(account.phone || '-')}`;
  if (role === 'admin') info = `<b>ບ່ອນເຮັດວຽກ:</b> Admin Dashboard<br><b>WhatsApp:</b> +${adminPhoneDigits()}`;
  $('#bb-profile-info').innerHTML = info;
  $('#bb-profile-modal').classList.add('show');
}
function closeProfileCard() { $('#bb-profile-modal').classList.remove('show'); }
function openCurrentRolePage() {
  const role = currentRole();
  closeProfileCard();
  if (role === 'admin') return nav('admin');
  if (role === 'agent') return nav('agent');
  return nav('profile');
}

function setupMusic() {
  const audio = $('#bgMusic');
  if (!audio) return;
  audio.volume = .25;
  audio.src = tracks[0];
  audio.onended = () => {
    state.track = (state.track + 1) % tracks.length;
    audio.src = tracks[state.track];
    audio.play().catch(() => {});
  };
}
function toggleMusic() {
  const audio = $('#bgMusic');
  if (!audio) return;
  if (!state.music) {
    audio.play().then(() => {
      state.music = true;
      $('#musicBtn').textContent = '🎶';
      toast('ເປີດເພງແລ້ວ');
    }).catch(() => toast('ກົດອີກຄັ້ງເພື່ອເປີດເພງ'));
  } else {
    audio.pause();
    state.music = false;
    $('#musicBtn').textContent = '🎵';
    toast('ປິດເພງແລ້ວ');
  }
}
function toggleSound() {
  state.sound = !state.sound;
  saveSettings({sound: state.sound});
  $('#soundBtn').textContent = state.sound ? '🔊' : '🔇';
  if (state.sound) play('success');
}

function updateRoleChrome() {
  const role = currentRole();
  const account = currentAccount();
  $('#soundBtn').textContent = state.sound ? '🔊' : '🔇';
  $('#profileQuickBtn').textContent = role === 'admin' ? '🪷 Admin' : role === 'agent' ? `👤 ${account?.name || 'Agent'}` : `👤 ${account?.name || 'ໂປຣໄຟລ໌'}`;
  const cartAllowed = role === 'customer' || role === 'agent';
  $('#cartBtn').style.display = cartAllowed ? '' : 'none';
  updateNotifyBadge();
  if (!cartAllowed) closeCart();
  $$('[data-page="profile"]').forEach(btn => btn.style.display = role === 'customer' ? '' : 'none');
  const agentBtn = $('#roleAccess [data-page="agent"]');
  const adminBtn = $('#roleAccess [data-page="admin"]');
  if (agentBtn) agentBtn.style.display = role === 'agent' ? '' : 'none';
  if (adminBtn) adminBtn.style.display = role === 'admin' ? '' : 'none';
  const showAccess = (role === 'agent' || role === 'admin');
  $('#roleAccess').classList.toggle('hidden', !showAccess);
  updateProfileChip();
}
function canAccessPage(page) {
  const role = currentRole();
  if (!role) return false;
  if (page === 'admin') return role === 'admin';
  if (page === 'agent') return role === 'agent';
  if (page === 'profile') return role === 'customer';
  if (page === 'wishlist') return role !== 'admin';
  return true;
}
function ensureValidPage() {
  const role = currentRole();
  if (!role) { state.page = 'home'; return; }
  if (!canAccessPage(state.page)) {
    state.page = role === 'admin' ? 'admin' : role === 'agent' ? 'agent' : 'home';
  }
}
function activatePage() {
  ensureValidPage();
  $$('.page').forEach(page => page.classList.toggle('active-page', page.id === state.page));
  $$('#mainNav [data-page]').forEach(btn => btn.classList.toggle('active', btn.dataset.page === state.page));
}
function nav(page) {
  if (!currentRole()) { updateAuthGate(); return; }
  if (!canAccessPage(page)) { play('error'); toast('ໜ້ານີ້ບໍ່ກົງກັບສິດເຂົ້າໃຊ້ຂອງທ່ານ'); return; }
  state.page = page;
  closeCart();
  play('click');
  renderAll();
  window.scrollTo({top:0, behavior:'smooth'});
}

function genderName(g) { return {all:'ທັງໝົດ', female:'ຍິງ', male:'ຊາຍ', unisex:'Unisex'}[g] || g; }
function typeName(t) { return {all:'ທັງໝົດ', ready:'ພ້ອມສົ່ງ', preorder:'Pre-order'}[t] || t; }
function categoryList() { return ['ທັງໝົດ', ...categories()]; }
function normalizeType(p) { return p.type || (p.status === 'preorder' ? 'preorder' : 'ready'); }
function variantsOf(p) {
  if (Array.isArray(p.variants) && p.variants.length) return p.variants.map(v => ({name: v.name || 'ມາດຕະຖານ', stock: Number(v.stock ?? 0), image: v.image || v.image_url || '', color: v.color || ''}));
  return [{name: 'ມາດຕະຖານ', stock: normalizeType(p) === 'preorder' ? 9999 : Number(p.stock ?? 0), image: ''}];
}
function productImages(p) {
  const images = [];
  const seen = new Set();
  const push = (src, label = '') => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    images.push({src, label: label || `ຮູບ ${images.length + 1}`});
  };
  push(p?.image || p?.image_url || '', 'ຮູບຫຼັກ');
  (Array.isArray(p?.images) ? p.images : []).forEach((img, i) => {
    if (typeof img === 'string') push(img, `ຮູບ ${i + 1}`);
    else push(img?.src || img?.image || '', img?.label || img?.name || `ຮູບ ${i + 1}`);
  });
  return images;
}
function primaryProductImage(p) {
  return productImages(p)[0]?.src || '';
}
function imageLabelKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    .replace(/[\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function variantNameParts(name) {
  const rawText = String(name || '');
  const baseText = rawText.split('/')[0] || rawText;
  const raw = imageLabelKey(rawText);
  const base = imageLabelKey(baseText);
  const tokens = raw.split(/[\s/|,+]+/).filter(Boolean);
  return {raw, base, tokens};
}
function imageMatchesVariant(imgLabel, variantName) {
  const label = imageLabelKey(imgLabel);
  if (!label) return false;
  const v = variantNameParts(variantName);
  if (label === v.raw || label === v.base) return true;
  if (v.base && (label.includes(v.base) || v.base.includes(label))) return true;
  return v.tokens.some(t => t.length > 1 && (label.includes(t) || t.includes(label)));
}
function imageForVariant(p, variant) {
  const direct = variant?.image || '';
  if (direct) return direct;
  const imgs = productImages(p).filter(img => img?.src);
  const match = imgs.find(img => imageMatchesVariant(img.label, variant?.name));
  return match?.src || primaryProductImage(p);
}

function optionPartsFromName(name) {
  const text = String(name || 'ມາດຕະຖານ').trim();
  const parts = text.split('/').map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return {style: parts[0], size: parts.slice(1).join(' / '), full: text};
  return {style: '', size: text, full: text};
}
function uniqueProductSizes(p) {
  const seen = new Set(); const out = [];
  variantsOf(p).forEach(v => { const size = optionPartsFromName(v.name).size || v.name || 'ມາດຕະຖານ'; const key = imageLabelKey(size); if (!seen.has(key)) { seen.add(key); out.push(size); } });
  return out.length ? out : ['ມາດຕະຖານ'];
}
function variantForSize(p, size = '') {
  const key = imageLabelKey(size);
  return variantsOf(p).find(v => imageLabelKey(optionPartsFromName(v.name).size || v.name) === key) || variantsOf(p)[0];
}
function stockForSize(p, size = '') { const v = variantForSize(p, size); return normalizeType(p) === 'preorder' ? 9999 : Number(v?.stock || 0); }
function firstAvailableSize(p) { const sizes = uniqueProductSizes(p); if (normalizeType(p) === 'preorder') return sizes[0] || 'ມາດຕະຖານ'; return sizes.find(size => stockForSize(p, size) > 0) || sizes[0] || 'ມາດຕະຖານ'; }
function selectedImageLabel(p, imageSrc = '') { const img = productImages(p).find(x => x.src === imageSrc); return img?.label || ''; }
function cartOptionName(p, size = '', imageSrc = '') { const label = selectedImageLabel(p, imageSrc); return [label, size].filter(Boolean).join(' / ') || size || 'ມາດຕະຖານ'; }

function firstAvailableVariantIndex(p) {
  const vars = variantsOf(p);
  if (!vars.length) return 0;
  if (normalizeType(p) === 'ready') {
    const idx = vars.findIndex(v => Number(v.stock || 0) > 0);
    return idx >= 0 ? idx : 0;
  }
  return 0;
}
function migrateProductsForV52() {
  const list = products();
  let changed = false;
  list.forEach(p => {
    if (!Array.isArray(p.images)) {
      p.images = [];
      if (p.image || p.image_url) p.images.push({label:'ຮູບຫຼັກ', src:p.image || p.image_url});
      changed = true;
    }
    if (!Array.isArray(p.variants) || !p.variants.length) {
      p.variants = variantsOf(p);
      changed = true;
    }
  });
  if (changed) saveProducts(list);
}
function stockOf(p) {
  if (normalizeType(p) === 'preorder') return 9999;
  return variantsOf(p).reduce((sum, v) => sum + Number(v.stock || 0), 0);
}
function productPriceFor(p) {
  const role = currentRole();
  if (role === 'agent') return moneyValue(p.agentPrice || p.price || 0);
  return moneyValue(p.price || 0);
}
function productPriceHtml(p) {
  if (currentRole() === 'agent') {
    const price = Number(p.price || 0);
    const agentPrice = Number(p.agentPrice || price);
    return `<div class="agent-price"><div class="old">${money(price)}</div><div class="new">${money(agentPrice)} <span class="agent-tag">Agent Price</span></div><div class="muted">ກຳໄລແນະນຳ: ${money(Math.max(0, price - agentPrice))}</div></div>`;
  }
  return `<div class="price">${money(p.price)}</div>`;
}
function productImageHtml(p, image = '') {
  const img = image || primaryProductImage(p);
  if (img) return `<img src="${esc(img)}" alt="${esc(p.name)}">`;
  return esc(p.emoji || '🪷');
}

function thumbVisualHtml(p, src = '', label = '') {
  if (src) return `<img src="${esc(src)}" alt="${esc(label || p?.name || 'ຮູບສິນຄ້າ')}">`;
  return `<span>${esc(p?.emoji || '🪷')}</span>`;
}
function productThumbItems(p) {
  const images = productImages(p || {}).filter(img => img && img.src);
  if (images.length) return images.map((img, i) => ({kind:'image', src:img.src, label:img.label || `ຮູບ ${i + 1}`, disabled:false}));
  return [{kind:'fallback', src:'', label:'ຮູບຫຼັກ', disabled:false}];
}
function productPreviewThumbsHtml(p, limit = 5) {
  const items = productThumbItems(p).slice(0, limit);
  if (!items.length) return '';
  return `<div class="product-preview-thumbs product-image-thumbs">${items.map(item => `<span class="product-mini-thumb ${item.disabled ? 'out' : ''}" title="${esc(item.label)}">${thumbVisualHtml(p, item.src, item.label)}</span>`).join('')}${productThumbItems(p).length > limit ? `<span class="product-mini-more">+${productThumbItems(p).length - limit}</span>` : ''}</div>`;
}
function productModalThumbRail(p, selectedImage = '', selectedVariantIndex = 0) {
  const items = productThumbItems(p);
  if (!items.length) return '';
  return `<div class="modal-thumb-label">ຮູບສິນຄ້າ / ສີ · ເລື່ອນເບິ່ງໄດ້ ແລະກົດຮູບເພື່ອປ່ຽນຮູບໃຫຍ່</div><div class="product-gallery image-only-gallery">${items.map(item => {
    const active = item.src && item.src === selectedImage;
    return `<button type="button" class="gallery-thumb ${active ? 'active' : ''}" data-gallery-img="${esc(item.src || '')}" title="${esc(item.label)}">${thumbVisualHtml(p, item.src, item.label)}<small>${esc(item.label)}</small></button>`;
  }).join('')}</div>`;
}
function productBadge(p) {
  if (p.active === false) return ['ປິດຂາຍ', 'off'];
  const type = normalizeType(p);
  const stock = stockOf(p);
  if (type === 'preorder') return ['Pre-order', 'pre'];
  if (stock <= 0) return ['ໝົດ', 'off'];
  if (stock < 5) return ['ໃກ້ໝົດ', 'low'];
  return ['ພ້ອມສົ່ງ', ''];
}
function reviewStats(p) {
  const list = Array.isArray(p.reviews) ? p.reviews : [];
  if (!list.length) return '';
  const avg = list.reduce((s, r) => s + Number(r.stars || r.rating || 0), 0) / list.length;
  return `⭐ ${avg.toFixed(1)} · ${list.length} ລີວິວ`;
}
function productSortRank(p) {
  const type = normalizeType(p);
  if (p.active === false) return 4;
  if (type === 'ready' && stockOf(p) <= 0) return 3;
  if (type === 'ready' && stockOf(p) < 5) return 1;
  return 0;
}
function visibleProducts() {
  return products().slice().sort((a, b) => productSortRank(a) - productSortRank(b) || String(a.name || '').localeCompare(String(b.name || '')));
}
function productMatches(p, query = '') {
  const q = query.trim().toLowerCase();
  const type = normalizeType(p);
  return (state.type === 'all' || type === state.type) &&
    (state.gender === 'all' || (p.gender || 'unisex') === state.gender) &&
    (state.cat === 'ທັງໝົດ' || p.category === state.cat) &&
    (!q || String(p.name || '').toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q) || String(p.desc || '').toLowerCase().includes(q));
}
function renderFilters() {
  $('#typeFilters').innerHTML = ['all', 'ready', 'preorder'].map(t => `<button type="button" class="${state.type === t ? 'active' : ''}" data-type="${t}">${typeName(t)}</button>`).join('');
  $('#genderFilters').innerHTML = ['all', 'female', 'male', 'unisex'].map(g => `<button type="button" class="${state.gender === g ? 'active' : ''}" data-gender="${g}">${genderName(g)}</button>`).join('');
  $('#categoryFilters').innerHTML = categoryList().map(c => `<button type="button" class="${state.cat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('#wishTypeFilters').innerHTML = ['all', 'ready', 'preorder'].map(t => `<button type="button" class="${state.wishType === t ? 'active' : ''}" data-wtype="${t}">${typeName(t)}</button>`).join('');
  $$('[data-type]').forEach(btn => btn.onclick = () => { state.type = btn.dataset.type; renderFilters(); renderProducts(); play('click'); });
  $$('[data-gender]').forEach(btn => btn.onclick = () => { state.gender = btn.dataset.gender; renderFilters(); renderProducts(); play('click'); });
  $$('[data-cat]').forEach(btn => btn.onclick = () => { state.cat = btn.dataset.cat; renderFilters(); renderProducts(); play('click'); });
  $$('[data-wtype]').forEach(btn => btn.onclick = () => { state.wishType = btn.dataset.wtype; renderFilters(); renderWishlist(); play('click'); });
}
function productCard(p) {
  const [badge, badgeClass] = productBadge(p);
  const wished = wishes().includes(p.id);
  const type = normalizeType(p);
  const stock = stockOf(p);
  const stockText = type === 'preorder' ? 'ລໍຖ້າ 14-18 ມື້' : `ເຫຼືອ ${stock}`;
  const unavailable = p.active === false || (type === 'ready' && stock <= 0);
  return `<article class="product-card ${unavailable ? 'inactive' : ''}">
    <div class="product-img"><span class="badge ${badgeClass}">${badge}</span><button type="button" class="heart ${wished ? 'active' : ''}" data-wish="${esc(p.id)}">${wished ? '♥' : '♡'}</button>${productImageHtml(p)}${productImages(p).length > 1 ? `<span class="image-count">${productImages(p).length} ຮູບ</span>` : ''}</div>
    ${productPreviewThumbsHtml(p)}
    <h3>${esc(p.name)}</h3>
    ${productPriceHtml(p)}
    <div class="muted">${genderName(p.gender || 'unisex')} · ${esc(p.category || 'ອື່ນໆ')} · ${stockText}</div>
    ${unavailable ? '<div class="closed-note">ປິດຊົ່ວຄາວ / ສັ່ງບໍ່ໄດ້</div>' : ''}
    ${reviewStats(p) ? `<div class="review-summary">${reviewStats(p)}</div>` : ''}
    <div class="card-actions"><button type="button" class="outline" data-detail="${esc(p.id)}">🔎 ລາຍລະອຽດ</button><button type="button" class="primary" data-detail="${esc(p.id)}" ${unavailable ? 'disabled' : ''}>${unavailable ? 'ປິດຊົ່ວຄາວ' : 'ເລືອກ'}</button></div>
  </article>`;
}
function attachProductClicks(root = document) {
  $$('[data-detail]', root).forEach(btn => btn.onclick = () => openProduct(btn.dataset.detail));
  $$('[data-wish]', root).forEach(btn => btn.onclick = event => { event.stopPropagation(); toggleWish(btn.dataset.wish); });
}
function renderProducts() {
  const q = $('#searchInput')?.value || '';
  const list = visibleProducts().filter(p => productMatches(p, q));
  $('#productGrid').innerHTML = list.map(productCard).join('') || '<div class="empty-card note">ບໍ່ພົບສິນຄ້າ</div>';
  attachProductClicks($('#productGrid'));
}
function renderFeatured() {
  const list = visibleProducts().filter(p => p.active !== false).slice(0, 4);
  $('#featuredGrid').innerHTML = list.map(productCard).join('') || '<div class="empty-card note">ຍັງບໍ່ມີສິນຄ້າ</div>';
  attachProductClicks($('#featuredGrid'));
}
function toggleWish(id) {
  if (currentRole() === 'admin') return toast('Admin ບໍ່ຕ້ອງມີລາຍການໂປດ');
  let list = wishes();
  list = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  saveWishes(list);
  play('click');
  renderProducts();
  renderFeatured();
  renderWishlist();
}
function renderWishlist() {
  const wished = wishes();
  let list = visibleProducts().filter(p => wished.includes(p.id));
  if (state.wishType !== 'all') list = list.filter(p => normalizeType(p) === state.wishType);
  $('#wishlistGrid').innerHTML = list.map(productCard).join('') || '<div class="empty-card note">ຍັງບໍ່ມີລາຍການໂປດ</div>';
  attachProductClicks($('#wishlistGrid'));
}

function openModal(html, wide = false) {
  const layer = $('#modalLayer');
  layer.innerHTML = html;
  layer.classList.remove('hidden');
  const modal = $('.modal', layer);
  if (modal && wide) modal.classList.add('wide');
  $$('[data-close]', layer).forEach(btn => btn.onclick = closeModal);
  attachZoomableImages(layer);
}
function closeModal() {
  const hadModal = !$('#modalLayer').classList.contains('hidden');
  $('#modalLayer').classList.add('hidden');
  $('#modalLayer').innerHTML = '';
  state.productDetail = null;
  state.editProductImages = [];
  if (hadModal && currentRole()) renderAll();
}
function showImageZoom(src, title = 'ຮູບ') {
  if (!src) return;
  const old = $('#imageZoomLayer');
  if (old) old.remove();
  const layer = document.createElement('div');
  layer.id = 'imageZoomLayer';
  layer.className = 'image-zoom-layer';
  layer.innerHTML = `<div class="image-zoom-box"><button type="button" class="icon-btn image-zoom-close">✕</button><b>${esc(title)}</b><img src="${esc(src)}" alt="${esc(title)}"></div>`;
  document.body.appendChild(layer);
  layer.onclick = e => { if (e.target === layer || e.target.classList.contains('image-zoom-close')) layer.remove(); };
}
function attachZoomableImages(root = document) {
  $$('[data-zoom-img]', root).forEach(el => el.onclick = event => { event.stopPropagation(); showImageZoom(el.dataset.zoomImg, el.dataset.zoomTitle || 'ຮູບ'); });
}
function openProduct(id) {
  const p = products().find(x => x.id === id);
  if (!p) return toast('ບໍ່ພົບສິນຄ້າ');
  const img = primaryProductImage(p) || imageForVariant(p, variantsOf(p)[0]);
  state.productDetail = {id, size: firstAvailableSize(p), qty: 1, viewImage: img};
  renderProductModal();
}
function renderProductModal() {
  const detail = state.productDetail;
  if (!detail) return;
  const p = products().find(x => x.id === detail.id);
  if (!p) return;
  const sizes = uniqueProductSizes(p);
  if (!detail.size || !sizes.includes(detail.size)) detail.size = firstAvailableSize(p);
  const selectedSize = detail.size;
  const selected = variantForSize(p, selectedSize);
  const type = normalizeType(p);
  const available = stockForSize(p, selectedSize);
  const qty = Math.max(1, Math.min(Number(detail.qty || 1), available || 1));
  detail.qty = qty;
  const selectedImage = detail.viewImage || primaryProductImage(p) || imageForVariant(p, selected);
  const caption = `${p.name}\nລາຄາລູກຄ້າ: ${money(Number(p.price || 0))}\nລາຄາຕົວແທນ: ${money(Number(p.agentPrice || p.price || 0))}\n${p.desc || ''}\nສະຖານະ: ${typeName(type)}${type === 'preorder' ? '\nPre-order: ລໍຖ້າ 14-18 ມື້ຫຼັງ Admin ຢືນຢັນອໍເດີ' : ''}\nສອບຖາມ/ສັ່ງຊື້ທັກ Bai Boua`;
  const disabled = p.active === false || (type === 'ready' && available <= 0);
  openModal(`<div class="modal wide"><div class="modal-head"><h2>${esc(p.name)}</h2><button class="icon-btn" type="button" data-close>✕</button></div>
    <div class="product-detail">
      <div class="detail-media">
        <div class="detail-img" data-zoom-img="${esc(selectedImage)}" data-zoom-title="${esc(p.name)}">${productImageHtml(p, selectedImage)}</div>
        ${productModalThumbRail(p, selectedImage, 0)}
      </div>
      <div>
        <div class="status ${statusClass(disabled ? 'cancelled' : type === 'preorder' ? 'waiting_china' : 'paid')}">${productBadge(p)[0]}</div>
        ${productPriceHtml(p)}
        <p class="muted">${genderName(p.gender || 'unisex')} · ${esc(p.category || 'ອື່ນໆ')}</p>
        <p>${esc(p.desc || 'ຍັງບໍ່ມີລາຍລະອຽດ')}</p>
        ${type === 'preorder' ? '<div class="preorder-note"><b>Pre-order</b><br>ສິນຄ້ານີ້ຕ້ອງລໍຖ້າ 14-18 ມື້ ຫຼັງຈາກ Admin ຢືນຢັນອໍເດີແລ້ວ.</div>' : ''}
        ${p.active === false ? '<div class="note bad-note">ສິນຄ້ານີ້ປິດຂາຍຊົ່ວຄາວ ຈຶ່ງບໍ່ສາມາດໃສ່ກະຕ່າໄດ້.</div>' : ''}
        <div class="filter-title">ເລືອກໄຊສ໌ / ເບີ</div>
        <div class="variant-grid size-only-grid">${sizes.map(size => { const stock = stockForSize(p, size); return `<button type="button" class="variant-chip size-only-chip ${size === selectedSize ? 'active' : ''}" data-size="${esc(size)}" ${type === 'ready' && Number(stock || 0) <= 0 ? 'disabled' : ''}><span>${esc(size)} ${type === 'ready' ? `(${Number(stock || 0)})` : ''}</span></button>`; }).join('')}</div>
        <div class="qty-controls"><button type="button" data-qty="-1">−</button><b>${qty}</b><button type="button" data-qty="1">+</button></div>
        <div class="action-row"><button type="button" class="primary" id="addToCartFromDetail" ${disabled ? 'disabled' : ''}>🛒 ໃສ່ກະຕ່າ</button>${currentRole() === 'agent' ? '<button type="button" class="outline" id="copyProductCaption">Copy caption</button>' : ''}</div>
        ${currentRole() === 'agent' ? `<textarea class="hidden" id="captionText">${esc(caption)}</textarea>` : ''}
      </div>
    </div>
    <h3>ລີວິວ</h3>${reviewsHtml(p)}
  </div>`, true);
  $$('[data-size]', $('#modalLayer')).forEach(btn => btn.onclick = () => { state.productDetail.size = btn.dataset.size; renderProductModal(); });
  $$('[data-gallery-img]', $('#modalLayer')).forEach(btn => btn.onclick = () => { state.productDetail.viewImage = btn.dataset.galleryImg || primaryProductImage(p); renderProductModal(); });
  $$('[data-qty]', $('#modalLayer')).forEach(btn => btn.onclick = () => { state.productDetail.qty = Math.max(1, Number(state.productDetail.qty || 1) + Number(btn.dataset.qty)); renderProductModal(); });
  $('#addToCartFromDetail')?.addEventListener('click', addToCartFromDetail);
  $('#copyProductCaption')?.addEventListener('click', () => copyText($('#captionText').value).then(ok => toast(ok ? 'Copy caption ແລ້ວ' : 'Copy ບໍ່ສຳເລັດ')));
  attachZoomableImages($('#modalLayer'));
}
function addToCartFromDetail() {
  const role = currentRole();
  if (!['customer', 'agent'].includes(role)) return toast('ຕ້ອງເປັນລູກຄ້າ ຫຼື ຕົວແທນເທົ່ານັ້ນ');
  const detail = state.productDetail;
  const p = products().find(x => x.id === detail.id);
  if (!p) return;
  const type = normalizeType(p);
  const qty = Math.max(1, Number(detail.qty || 1));
  const selectedImage = state.productDetail?.viewImage || primaryProductImage(p);
  const selectedSize = detail.size || firstAvailableSize(p);
  const variant = variantForSize(p, selectedSize);
  if (p.active === false) return toast('ສິນຄ້ານີ້ປິດຂາຍຊົ່ວຄາວ');
  if (type === 'ready' && qty > stockForSize(p, selectedSize)) return toast('ສິນຄ້າໃນສະຕັອກບໍ່ພໍ');
  const price = productPriceFor(p);
  const optionName = cartOptionName(p, selectedSize, selectedImage);
  const key = `${p.id}|${optionName}|${role}`;
  const list = cart();
  const found = list.find(item => item.key === key);
  if (found) { found.qty += qty; found.image = selectedImage || found.image || ''; }
  else list.push({key, productId:p.id, name:p.name, category:p.category, image:selectedImage || '', emoji:p.emoji || '🪷', variantName:optionName, sizeName:selectedSize, sourceVariantName:variant?.name || selectedSize, qty, price, basePrice:moneyValue(p.price || 0), agentPrice:moneyValue(p.agentPrice || p.price || 0), type, rolePrice:role, addedAt:new Date().toISOString()});
  saveCart(list);
  closeModal();
  openCart();
  play('success');
  toast('ໃສ່ກະຕ່າແລ້ວ');
}

function lineTotal(item) { return moneyValue(item.price) * Math.max(0, Math.round(Number(item.qty || 0))); }
function calcCartTotal(list = cart()) { return list.reduce((sum, item) => sum + lineTotal(item), 0); }
function calcOrderTotal(o) { return (o?.items || []).reduce((sum, item) => sum + lineTotal(item), 0); }
function displayOrderTotal(o) { return calcOrderTotal(o) || moneyValue(o?.total); }
function reconcileStoredOrderTotals() {
  const list = orders();
  let changed = false;
  list.forEach(o => { const total = calcOrderTotal(o); if (total && moneyValue(o.total) !== total) { o.total = total; changed = true; } });
  if (changed) saveOrders(list);
}
function renderCart() {
  const list = cart();
  $('#cartCount').textContent = list.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  $('#cartTotal').textContent = money(calcCartTotal(list));
  $('#cartItems').innerHTML = list.length ? list.map(item => `<div class="cart-row">
    <div class="thumb">${item.image ? `<img src="${esc(item.image)}" alt="">` : esc(item.emoji || '🪷')}</div>
    <div><b>${esc(item.name)}</b><br><span class="muted">${esc(item.variantName)} · ${typeName(item.type)}</span><br><b>${money(lineTotal(item))}</b></div>
    <div class="qty-box"><button type="button" data-cart-minus="${esc(item.key)}">−</button><b>${Number(item.qty || 0)}</b><button type="button" data-cart-plus="${esc(item.key)}">+</button><button type="button" data-cart-remove="${esc(item.key)}">🗑</button></div>
  </div>`).join('') : '<div class="cart-empty">ກະຕ່າຍັງວ່າງ</div>';
  $$('[data-cart-minus]').forEach(btn => btn.onclick = () => changeCart(btn.dataset.cartMinus, -1));
  $$('[data-cart-plus]').forEach(btn => btn.onclick = () => changeCart(btn.dataset.cartPlus, 1));
  $$('[data-cart-remove]').forEach(btn => btn.onclick = () => removeCartItem(btn.dataset.cartRemove));
}
function changeCart(key, delta) {
  const list = cart();
  const item = list.find(x => x.key === key);
  if (!item) return;
  item.qty = Number(item.qty || 1) + delta;
  if (item.qty <= 0) return removeCartItem(key);
  saveCart(list);
  play('click');
}
function removeCartItem(key) {
  saveCart(cart().filter(item => item.key !== key));
  play('delete');
}
function openCart() { if (currentRole() === 'admin') return; $('#cartDrawer').classList.add('open'); }
function closeCart() { $('#cartDrawer').classList.remove('open'); }

function shipCardsHtml() {
  const icons = {Anousith:'🚚', HAL:'🌅', Mixay:'📦', Unitel:'📡'};
  return shippingMethods.map(method => `<button type="button" class="ship-card" data-ship="${esc(method)}"><span class="ship-ico">${icons[method] || '📦'}</span><b>${esc(method)}</b><small>ຂົນສົ່ງ</small></button>`).join('');
}
function checkout() {
  const role = currentRole();
  if (!['customer', 'agent'].includes(role)) return toast('ກະລຸນາ Login ໃນນາມລູກຄ້າ ຫຼື ຕົວແທນ');
  if (!cart().length) return toast('ກະຕ່າຍັງວ່າງ');
  const account = currentAccount();
  const total = calcCartTotal(cart());
  openModal(`<div class="modal"><div class="modal-head"><h2>ຂໍ້ມູນຈັດສົ່ງ</h2><button class="icon-btn" type="button" data-close>✕</button></div>
    ${role === 'agent' ? '<div class="note">ອໍເດີນີ້ຈະບັນທຶກໃນນາມຕົວແທນ. ໃສ່ຊື່ ແລະ ເບີຜູ້ຮັບຂອງລູກຄ້າໄດ້ເລີຍ.</div>' : ''}
    <div class="form-grid">
      <input id="shipName" placeholder="ຊື່ຜູ້ຮັບ" value="${role === 'customer' ? esc(account?.name || '') : ''}">
      <div class="two-col"><input value="+85620" disabled><input id="shipPhone" inputmode="numeric" maxlength="8" placeholder="8 ຕົວ" value="${role === 'customer' ? esc(phoneTail(account?.phone || '')) : ''}"></div>
      <div class="wide"><div class="filter-title">ເລືອກຂົນສົ່ງ</div><div class="ship-grid">${shipCardsHtml()}</div></div>
      <input id="shipBranch" placeholder="ສາຂາ / ຈຸດຮັບເຄື່ອງ">
      <input id="shipDistrict" placeholder="ເມືອງ">
      <input id="shipProvince" placeholder="ແຂວງ">
      <textarea id="shipNote" class="wide" placeholder="ໝາຍເຫດ ເຊັ່ນ ສີ/ໄຊສ໌/ເວລາຝາກ"></textarea>
    </div>
    <div class="note" style="margin-top:12px"><b>ຍອດລວມ:</b> ${money(total)}<br>ຫຼັງຢືນຢັນອໍເດີ ຈະມີ QR ໃຫ້ສະແກນ ແລະ ອັບ Slip.</div>
    <button type="button" class="primary full" id="createOrderBtn">ຢືນຢັນອໍເດີ</button>
  </div>`);
  $$('.ship-card', $('#modalLayer')).forEach(btn => btn.onclick = () => { $$('.ship-card', $('#modalLayer')).forEach(x => x.classList.remove('active')); btn.classList.add('active'); });
  $('#shipPhone').oninput = e => e.target.value = digits(e.target.value).slice(0, 8);
  $('#createOrderBtn').onclick = createOrder;
}
function nextOrderCode() {
  const max = orders().reduce((m, o) => {
    const found = String(o.id || '').match(/BAIBOUA-(\d+)/);
    return found ? Math.max(m, Number(found[1])) : m;
  }, 0);
  return `BAIBOUA-${String(max + 1).padStart(3, '0')}`;
}
function createOrder() {
  const method = $('.ship-card.active', $('#modalLayer'))?.dataset.ship || '';
  const fields = ['shipName', 'shipPhone', 'shipBranch', 'shipDistrict', 'shipProvince'];
  let ok = !!method;
  fields.forEach(id => {
    const el = $('#' + id);
    const valid = id === 'shipPhone' ? validPhoneTail(el.value) : !!el.value.trim();
    el.classList.toggle('invalid', !valid);
    if (!valid) ok = false;
  });
  if (!ok) return toast('ກະລຸນາກອກຂໍ້ມູນຈັດສົ່ງໃຫ້ຄົບ');
  const list = cart();
  if (!list.length) return toast('ກະຕ່າຍັງວ່າງ');
  const role = currentRole();
  const account = currentAccount();
  if (role === 'agent' && account?.phone && samePhone($('#shipPhone').value, account.phone)) {
    return toast('ອໍເດີທີ່ເບີຜູ້ຮັບກົງກັບເບີຕົວແທນບໍ່ສາມາດສ້າງໃນນາມຕົວແທນໄດ້');
  }
  const kind = list.some(item => item.type === 'preorder') ? 'preorder' : 'ready';
  const total = calcCartTotal(list);
  const order = {
    id: nextOrderCode(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending_payment',
    kind,
    userId: role === 'customer' ? account.id : null,
    agentId: role === 'agent' ? account.id : null,
    agentName: role === 'agent' ? account.name : '',
    customer: {name: $('#shipName').value.trim(), phone: normPhone($('#shipPhone').value)},
    shipping: {method, branch: $('#shipBranch').value.trim(), district: $('#shipDistrict').value.trim(), province: $('#shipProvince').value.trim()},
    note: $('#shipNote').value.trim(),
    items: list,
    total,
    slip: '',
    billImg: '',
    stockDeducted: false,
    logs: [{at:new Date().toISOString(), text:`ສ້າງອໍເດີໂດຍ ${roleName(role)}`}]
  };
  saveOrders([order, ...orders()]);
  addAdminNotification(`ມີອໍເດີໃໝ່ ${order.id} ຈາກ ${roleName(role)} ${order.customer.name}`, order.id, 'order');
  saveCart([]);
  closeCart();
  closeModal();
  play('success');
  toast('ສ້າງອໍເດີແລ້ວ ກະລຸນາອັບ Slip');
  renderAll();
  openOrderDetail(order.id);
}

function flowForOrder(o) { return o.kind === 'preorder' ? preorderFlow : readyFlow; }
function statusIndex(o, status = o.status) {
  const flow = flowForOrder(o);
  const idx = flow.indexOf(status);
  return idx < 0 ? 0 : idx;
}
function timeline(o) {
  const flow = flowForOrder(o);
  if (['cancelled', 'rejected'].includes(o.status)) return `<div class="status-flow terminal"><div class="flow-step done current"><span class="flow-dot">!</span><small>${statusText(o.status)}</small></div></div>`;
  const current = statusIndex(o);
  const percent = flow.length > 1 ? Math.round((current / (flow.length - 1)) * 100) : 0;
  return `<div class="status-flow" style="--flow-scale:${percent / 100}">${flow.map((s, i) => `<div class="flow-step ${i <= current ? 'done' : ''} ${i === current ? 'current' : ''}"><span class="flow-dot">${i + 1}</span><small>${statusText(s)}</small></div>`).join('')}</div>`;
}
function canViewOrder(o) {
  const role = currentRole();
  if (role === 'admin') return true;
  if (role === 'agent') return o.agentId === currentAgent()?.id;
  if (role === 'customer') return o.userId === currentCustomer()?.id;
  return false;
}
function canEditSlip(o) {
  const role = currentRole();
  const owner = (role === 'customer' && o.userId === currentCustomer()?.id) || (role === 'agent' && o.agentId === currentAgent()?.id);
  return owner && ['pending_payment', 'rejected', 'slip_uploaded'].includes(o.status);
}
function orderItemsText(o) {
  return (o.items || []).map(item => `- ${item.name} (${item.variantName}) x${item.qty} = ${money(lineTotal(item))}`).join('\n');
}
function orderAdminMessage(o) {
  return `ສະບາຍດີ Admin Bai Boua\nຂໍສອບຖາມອໍເດີ ${o.id}\nຊື່: ${o.customer?.name || ''}\nຍອດ: ${money(displayOrderTotal(o))}\nສະຖານະ: ${statusText(o.status)}`;
}
function orderCustomerMessage(o) {
  return `ສະບາຍດີ ${o.customer?.name || ''}\nທາງຮ້ານ Bai Boua ແຈ້ງອໍເດີ ${o.id}\n\n${orderItemsText(o)}\n\nຍອດລວມ: ${money(displayOrderTotal(o))}\nສະຖານະ: ${statusText(o.status)}\nຂອບໃຈຫຼາຍໆ`;
}
function orderCard(o, mode = 'normal') {
  const items = (o.items || []).slice(0, 2).map(i => `${esc(i.name)} x${Number(i.qty || 0)}`).join(', ');
  return `<div class="order-card ${hasViewedOrder(o) ? 'viewed' : ''}">
    <div class="order-top"><div><b>${esc(o.id)}</b><br><span class="muted">${niceDate(o.createdAt)}</span></div><span class="status ${statusClass(o.status)}">${statusText(o.status)}</span></div>
    ${timeline(o)}
    ${orderItemThumbsHtml(o)}
    <p><b>ຜູ້ຮັບ:</b> ${esc(o.customer?.name || '-')} · ${esc(o.customer?.phone || '')}<br><b>ລາຍການ:</b> ${items || '-'}${(o.items || []).length > 2 ? '...' : ''}<br><b>ຍອດ:</b> ${money(displayOrderTotal(o))} · ${typeName(o.kind)}${hasViewedOrder(o) ? '<br><span class="viewed-mark">ເບິ່ງແລ້ວ</span>' : ''}</p>
    ${o.agentId ? `<p class="muted"><b>Agent:</b> ${esc(o.agentName || o.agentId)}</p>` : ''}
    <div class="action-row"><button type="button" class="outline" data-order-detail="${esc(o.id)}">🔎 ລາຍລະອຽດ</button>${canEditSlip(o) ? `<button type="button" class="primary" data-order-detail="${esc(o.id)}">📎 ອັບ Slip</button>` : ''}<a class="link-btn" target="_blank" href="${waLink(orderAdminMessage(o))}">WhatsApp Admin</a></div>
  </div>`;
}
function attachOrderButtons(root = document) {
  $$('[data-order-detail]', root).forEach(btn => btn.onclick = () => openOrderDetail(btn.dataset.orderDetail));
}
function paymentQrHtml() {
  return `<div class="payment-grid"><div class="qr-card bank-card bcel"><b>BCEL One</b><img class="zoomable-img" data-zoom-img="assets/qr-lao-qr.jpeg" data-zoom-title="BCEL One QR" src="assets/qr-lao-qr.jpeg" alt="BCEL One QR"><small>ກົດທີ່ຮູບເພື່ອຂະຫຍາຍ</small></div><div class="qr-card bank-card ldb"><b>LDB Bank</b><img class="zoomable-img" data-zoom-img="assets/qr-bcel-one.jpeg" data-zoom-title="LDB Bank QR" src="assets/qr-bcel-one.jpeg" alt="LDB Bank QR"><small>ກົດທີ່ຮູບເພື່ອຂະຫຍາຍ</small></div></div>`;
}
function productForItem(item) { return products().find(p => p.id === item.productId) || null; }
function itemImageSrc(item) {
  const p = productForItem(item);
  return item.image || item.image_url || p?.image || p?.image_url || '';
}
function itemEmoji(item) { return item.emoji || productForItem(item)?.emoji || '🪷'; }
function itemThumbHtml(item, cls = 'order-item-thumb') {
  const img = itemImageSrc(item);
  return `<span class="${cls} ${img ? 'zoomable-img' : ''}" ${img ? `data-zoom-img="${esc(img)}" data-zoom-title="${esc(item.name || 'ຮູບສິນຄ້າ')}"` : ''}>${img ? `<img src="${esc(img)}" alt="${esc(item.name || '')}">` : esc(itemEmoji(item))}</span>`;
}
function orderItemThumbsHtml(o) {
  return `<div class="order-thumb-strip">${(o.items || []).slice(0, 6).map(item => itemThumbHtml(item, 'order-mini-thumb')).join('')}</div>`;
}
function orderDetailItemsHtml(o) {
  const rows = (o.items || []).map(item => `<div class="order-item-row">${itemThumbHtml(item)}<div><b>${esc(item.name)}</b><br><span class="muted">${esc(item.variantName || '-')} · ${typeName(item.type || o.kind)}</span><br><span class="muted">${money(item.price)} x ${Number(item.qty || 0)}</span></div><div class="item-qty">x${Number(item.qty || 0)}</div><div class="item-price">${money(lineTotal(item))}</div></div>`).join('');
  return `<div class="order-item-list">${rows || '<div class="note">ບໍ່ມີລາຍການສິນຄ້າ</div>'}</div><div class="price-check"><span>ລວມຕາມລາຍການ</span><b>${money(displayOrderTotal(o))}</b></div>`;
}
function orderLogsHtml(o) {
  const logs = Array.isArray(o.logs) ? o.logs : [];
  return `<div class="log-box">${logs.length ? logs.slice().reverse().map(l => `<div>• ${esc(l.text || l)} <span class="muted">${l.at ? niceDate(l.at) : ''}</span></div>`).join('') : '<span class="muted">ຍັງບໍ່ມີ log</span>'}</div>`;
}
function adminActionsHtml(o) {
  if (currentRole() !== 'admin') return '';
  const allStatuses = Array.from(new Set([...flowForOrder(o), 'rejected', 'cancelled']));
  return `<h3>Admin actions</h3><div class="admin-actions">
    <select data-admin-status="${esc(o.id)}">${allStatuses.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${statusText(s)}</option>`).join('')}</select>
    ${o.slip && o.status === 'slip_uploaded' ? `<button type="button" class="success" data-admin-approve="${esc(o.id)}">ຢືນຢັນ Slip</button><button type="button" class="danger" data-admin-reject="${esc(o.id)}">ຕີ Slip ກັບ</button>` : ''}
    <button type="button" class="primary" data-admin-next="${esc(o.id)}">➡️ ຂັ້ນຕອນຖັດໄປ</button>
    <label>📄 ອັບບິນຂົນສົ່ງ<input type="file" accept="image/*" data-bill-upload="${esc(o.id)}"></label>
    <a class="link-btn" target="_blank" href="${waLink(orderCustomerMessage(o), o.customer?.phone || '')}">WhatsApp ຫາລູກຄ້າ</a>
    <button type="button" class="danger" data-admin-cancel="${esc(o.id)}">ຍົກເລີກ</button>
    <button type="button" class="danger" data-admin-delete="${esc(o.id)}">🗑 ລົບ</button>
  </div>`;
}
function ownerActionsHtml(o) {
  if (currentRole() === 'admin') return '';
  const canCancel = canEditSlip(o);
  return `<div class="action-row"><a class="link-btn" target="_blank" href="${waLink(orderAdminMessage(o))}">ສອບຖາມ Admin</a>${canCancel ? `<button type="button" class="danger cancel-order-btn" data-cancel-order="${esc(o.id)}">ຍົກເລີກອໍເດີ້</button>` : ''}</div>`;
}
function slipSectionHtml(o) {
  const needsPayment = ['pending_payment', 'slip_uploaded', 'rejected'].includes(o.status);
  const upload = canEditSlip(o);
  return `<h3>ການຊຳລະເງິນ</h3>${needsPayment ? paymentQrHtml() : ''}
    <div class="note" style="margin-top:10px"><b>ຍອດຕ້ອງໂອນ:</b> ${money(displayOrderTotal(o))}<br>ຫຼັງໂອນແລ້ວອັບຮູບ Slip ເພື່ອໃຫ້ Admin ກວດ.</div>
    ${o.slip ? `<div class="qr-card" style="margin-top:10px"><b>Slip ທີ່ອັບແລ້ວ</b><img class="image-preview zoomable-img" data-zoom-img="${esc(o.slip)}" data-zoom-title="Slip ${esc(o.id)}" src="${esc(o.slip)}" alt="slip"><small>ກົດຮູບເພື່ອຂະຫຍາຍ</small></div>` : ''}
    ${upload ? `<div class="file-box" style="margin-top:10px"><input type="file" accept="image/*" data-slip-upload="${esc(o.id)}"><b>📎 ກົດເພື່ອອັບ Slip</b><br><span class="muted">ຮູບຈະຖືກຫຍໍ້ຂະໜາດກ່ອນບັນທຶກ</span></div>` : ''}`;
}
function billSectionHtml(o) {
  return `<h3>ບິນຂົນສົ່ງ</h3>${o.billImg ? `<div class="qr-card"><img class="image-preview zoomable-img" data-zoom-img="${esc(o.billImg)}" data-zoom-title="ບິນຂົນສົ່ງ ${esc(o.id)}" src="${esc(o.billImg)}" alt="bill"><small>ກົດຮູບເພື່ອຂະຫຍາຍ</small></div>` : '<div class="note">ຍັງບໍ່ມີບິນຂົນສົ່ງ</div>'}`;
}
function orderWarningHtml(o) {
  const parts = [];
  if (o.status === 'cancelled') parts.push('<div class="cancel-banner">ຍົກເລີກອໍເດີ້</div>');
  if (o.kind === 'preorder') parts.push('<div class="preorder-note"><b>Pre-order</b><br>ອໍເດີນີ້ມີສິນຄ້າ Pre-order, ຕ້ອງລໍຖ້າ 14-18 ມື້ ຫຼັງຈາກ Admin ຢືນຢັນອໍເດີແລ້ວ.</div>');
  return parts.join('');
}
function openOrderDetail(id) {
  const o = orders().find(x => x.id === id);
  if (!o || !canViewOrder(o)) return toast('ບໍ່ພົບອໍເດີ ຫຼື ບໍ່ມີສິດເບິ່ງ');
  markOrderViewed(id);
  openModal(`<div class="modal wide"><div class="modal-head"><h2>${esc(o.id)}</h2><button class="icon-btn" type="button" data-close>✕</button></div>
    ${orderWarningHtml(o)}
    <div class="order-top"><div><span class="status ${statusClass(o.status)}">${statusText(o.status)}</span><p class="muted">ສ້າງ: ${niceDate(o.createdAt)} · ອັບເດດ: ${niceDate(o.updatedAt || o.createdAt)}</p></div><b>${money(displayOrderTotal(o))}</b></div>
    ${timeline(o)}
    <div class="note"><b>ຜູ້ຮັບ:</b> ${esc(o.customer?.name || '-')} · ${esc(o.customer?.phone || '')}<br><b>ຂົນສົ່ງ:</b> ${esc(o.shipping?.method || '-')} · ${esc(o.shipping?.branch || '-')} · ${esc(o.shipping?.district || '-')} · ${esc(o.shipping?.province || '-')}<br>${o.agentId ? `<b>Agent:</b> ${esc(o.agentName || o.agentId)}<br>` : ''}${o.note ? `<b>ໝາຍເຫດ:</b> ${esc(o.note)}` : ''}</div>
    <h3>ລາຍການສິນຄ້າ</h3>${orderDetailItemsHtml(o)}
    ${slipSectionHtml(o)}
    ${billSectionHtml(o)}
    ${reviewButtons(o)}
    ${ownerActionsHtml(o)}
    ${adminActionsHtml(o)}
    <h3>ປະຫວັດ</h3>${orderLogsHtml(o)}
  </div>`, true);
  attachOrderDetailEvents();
}
function attachOrderDetailEvents() {
  $$('[data-slip-upload]', $('#modalLayer')).forEach(input => input.onchange = () => uploadSlip(input.dataset.slipUpload, input.files[0]));
  $$('[data-cancel-order]', $('#modalLayer')).forEach(btn => btn.onclick = () => cancelOrder(btn.dataset.cancelOrder));
  attachAdminOrderEvents($('#modalLayer'));
  $$('[data-review]', $('#modalLayer')).forEach(btn => btn.onclick = () => {
    const [orderId, productId] = btn.dataset.review.split('|');
    openReview(orderId, productId);
  });
}
async function uploadSlip(id, file) {
  if (!file) return;
  const img = await readImageFile(file, 1000, .78);
  const list = orders();
  const o = list.find(x => x.id === id);
  if (!o) return;
  o.slip = img;
  if (['pending_payment', 'rejected'].includes(o.status)) o.status = 'slip_uploaded';
  o.updatedAt = new Date().toISOString();
  o.logs = Array.isArray(o.logs) ? o.logs : [];
  o.logs.push({at:new Date().toISOString(), text:'ອັບ Slip'});
  saveOrders(list);
  addAdminNotification(`ອໍເດີ ${o.id} ອັບ Slip ແລ້ວ ລໍຖ້າກວດ`, o.id, 'slip');
  play('success');
  toast('ອັບ Slip ແລ້ວ ລໍຖ້າ Admin ກວດ');
  renderAll();
  openOrderDetail(id);
}
function nextStatusFor(o) {
  const flow = flowForOrder(o);
  const idx = flow.indexOf(o.status);
  if (idx < 0) return 'pending_payment';
  return flow[Math.min(idx + 1, flow.length - 1)];
}
function deductStockForOrder(o) {
  if (o.stockDeducted) return;
  const list = products();
  (o.items || []).forEach(item => {
    const p = list.find(x => x.id === item.productId);
    if (!p || normalizeType(p) === 'preorder') return;
    p.variants = variantsOf(p);
    const v = p.variants.find(x => x.name === item.variantName) || p.variants[0];
    if (v) v.stock = Math.max(0, Number(v.stock || 0) - Number(item.qty || 0));
  });
  o.stockDeducted = true;
  saveProducts(list);
}
function restoreStockForOrder(o) {
  if (!o.stockDeducted) return;
  const list = products();
  (o.items || []).forEach(item => {
    const p = list.find(x => x.id === item.productId);
    if (!p || normalizeType(p) === 'preorder') return;
    p.variants = variantsOf(p);
    const v = p.variants.find(x => x.name === item.variantName) || p.variants[0];
    if (v) v.stock = Number(v.stock || 0) + Number(item.qty || 0);
  });
  o.stockDeducted = false;
  saveProducts(list);
}
function setOrderStatus(id, status, note = '') {
  const list = orders();
  const o = list.find(x => x.id === id);
  if (!o) return;
  const old = o.status;
  if (deductStatuses.has(status)) deductStockForOrder(o);
  if (['cancelled', 'rejected'].includes(status)) restoreStockForOrder(o);
  o.status = status;
  o.total = displayOrderTotal(o);
  o.updatedAt = new Date().toISOString();
  o.logs = Array.isArray(o.logs) ? o.logs : [];
  o.logs.push({at:new Date().toISOString(), text: note || `ປ່ຽນສະຖານະ: ${statusText(old)} → ${statusText(status)}`});
  saveOrders(list);
  if (old !== status) notifyOrderOwner(o, `ອໍເດີ ${o.id} ປ່ຽນສະຖານະເປັນ ${statusText(status)}`, 'status');
  play('success');
  renderAll();
}
function approveSlip(id) { setOrderStatus(id, 'paid', 'Admin ຢືນຢັນ Slip ແລ້ວ'); openOrderDetail(id); }
function rejectSlip(id) { const reason = prompt('ເຫດຜົນທີ່ຕີ Slip ກັບ:', 'Slip ບໍ່ຊັດ ຫຼື ຍອດບໍ່ຖືກ') || 'Admin ຕີ Slip ກັບ'; setOrderStatus(id, 'rejected', reason); openOrderDetail(id); }
function nextStatus(id) { const o = orders().find(x => x.id === id); if (!o) return; setOrderStatus(id, nextStatusFor(o)); openOrderDetail(id); }
async function uploadBill(id, file) {
  if (!file) return;
  const img = await readImageFile(file, 1000, .78);
  const list = orders();
  const o = list.find(x => x.id === id);
  if (!o) return;
  o.billImg = img;
  if (['packed', 'waiting_bill'].includes(o.status)) o.status = 'bill_sent';
  o.updatedAt = new Date().toISOString();
  o.logs = Array.isArray(o.logs) ? o.logs : [];
  o.logs.push({at:new Date().toISOString(), text:'Admin ອັບບິນຂົນສົ່ງ'});
  saveOrders(list);
  notifyOrderOwner(o, `ອໍເດີ ${o.id} ມີບິນຂົນສົ່ງແລ້ວ`, 'bill');
  play('success');
  toast('ອັບບິນຂົນສົ່ງແລ້ວ');
  renderAll();
  openOrderDetail(id);
}
function cancelOrder(id) {
  if (!confirm('ຢືນຢັນຍົກເລີກອໍເດີນີ້?')) return;
  setOrderStatus(id, 'cancelled', 'ຍົກເລີກອໍເດີ');
  closeModal();
}
function deleteOrder(id) {
  if (currentRole() !== 'admin') return;
  if (!confirm('ລົບອໍເດີນີ້ອອກຖາວອນ?')) return;
  const list = orders();
  const o = list.find(x => x.id === id);
  if (o) restoreStockForOrder(o);
  saveOrders(list.filter(x => x.id !== id));
  play('delete');
  closeModal();
  renderAll();
}
function attachAdminOrderEvents(root = document) {
  $$('[data-admin-detail]', root).forEach(btn => btn.onclick = () => openOrderDetail(btn.dataset.adminDetail));
  $$('[data-admin-status]', root).forEach(sel => sel.onchange = () => { setOrderStatus(sel.dataset.adminStatus, sel.value); if ($('#modalLayer') && !$('#modalLayer').classList.contains('hidden')) openOrderDetail(sel.dataset.adminStatus); });
  $$('[data-admin-approve]', root).forEach(btn => btn.onclick = () => approveSlip(btn.dataset.adminApprove));
  $$('[data-admin-reject]', root).forEach(btn => btn.onclick = () => rejectSlip(btn.dataset.adminReject));
  $$('[data-admin-next]', root).forEach(btn => btn.onclick = () => nextStatus(btn.dataset.adminNext));
  $$('[data-admin-cancel]', root).forEach(btn => btn.onclick = () => cancelOrder(btn.dataset.adminCancel));
  $$('[data-admin-delete]', root).forEach(btn => btn.onclick = () => deleteOrder(btn.dataset.adminDelete));
  $$('[data-bill-upload]', root).forEach(input => input.onchange = () => uploadBill(input.dataset.billUpload, input.files[0]));
  attachZoomableImages(root);
}

function canReview(o) { return currentRole() === 'customer' && o.userId === currentCustomer()?.id && ['bill_sent', 'shipped', 'completed'].includes(o.status); }
function hasReviewed(productId, orderId) {
  const p = products().find(x => x.id === productId);
  return (p?.reviews || []).some(r => r.orderId === orderId && r.userId === currentCustomer()?.id);
}
function reviewButtons(o) {
  if (!canReview(o)) return '';
  return `<h3>ລີວິວສິນຄ້າ</h3>${(o.items || []).map(item => `<div class="review-card"><b>${esc(item.name)}</b>${hasReviewed(item.productId, o.id) ? '<span class="status good">ລີວິວແລ້ວ</span>' : `<button type="button" class="outline" data-review="${esc(o.id)}|${esc(item.productId)}">ຂຽນລີວິວ</button>`}</div>`).join('')}`;
}
function openReview(orderId, productId) {
  const p = products().find(x => x.id === productId);
  if (!p) return;
  openModal(`<div class="modal"><div class="modal-head"><h2>ລີວິວ ${esc(p.name)}</h2><button class="icon-btn" type="button" data-close>✕</button></div>
    <div class="form-grid"><select id="reviewStars" class="wide"><option value="5">⭐⭐⭐⭐⭐</option><option value="4">⭐⭐⭐⭐</option><option value="3">⭐⭐⭐</option><option value="2">⭐⭐</option><option value="1">⭐</option></select><textarea id="reviewText" class="wide" placeholder="ຂຽນຄວາມຮູ້ສຶກ"></textarea></div>
    <div class="file-box" style="margin-top:10px"><input id="reviewImage" type="file" accept="image/*"><b>📷 ເພີ່ມຮູບລີວິວ</b><div id="reviewPreview"></div></div>
    <button type="button" class="success full" id="saveReviewBtn">ບັນທຶກລີວິວ</button>
  </div>`);
  $('#reviewImage').onchange = async e => { const img = await readImageFile(e.target.files[0], 800, .76); $('#reviewPreview').innerHTML = img ? `<img class="image-preview" src="${esc(img)}" alt="">` : ''; $('#reviewPreview').dataset.img = img; };
  $('#saveReviewBtn').onclick = () => saveReview(orderId, productId);
}
function saveReview(orderId, productId) {
  const list = products();
  const p = list.find(x => x.id === productId);
  if (!p) return;
  p.reviews = Array.isArray(p.reviews) ? p.reviews : [];
  p.reviews.push({userId:currentCustomer().id, userName:currentCustomer().name, orderId, stars:Number($('#reviewStars').value), text:$('#reviewText').value.trim(), image:$('#reviewPreview').dataset.img || '', createdAt:new Date().toISOString(), verified:true});
  saveProducts(list);
  play('success');
  toast('ຂອບໃຈສຳລັບລີວິວ');
  openOrderDetail(orderId);
}
function reviewsHtml(p) {
  const list = Array.isArray(p.reviews) ? p.reviews : [];
  if (!list.length) return '<div class="note">ຍັງບໍ່ມີລີວິວ</div>';
  return list.slice().reverse().slice(0, 6).map(r => `<div class="review-card"><b>${esc((r.userName || 'ລູກຄ້າ').slice(0, 1))}***</b> <span class="status good">ຜູ້ຊື້ຕົວຈິງ</span><br>${'⭐'.repeat(Number(r.stars || r.rating || 5))}<p>${esc(r.text || r.comment || '')}</p>${r.image ? `<img class="review-img" src="${esc(r.image)}" alt="review">` : ''}</div>`).join('');
}

function renderProfile() {
  $('#customerAuth').innerHTML = '';
  const u = currentCustomer();
  if (currentRole() !== 'customer' || !u) { $('#profileContent').innerHTML = ''; return; }
  const mine = orders().filter(o => o.userId === u.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#profileContent').innerHTML = `<div class="scrapbook-card auth-card"><div class="profile-box"><div class="avatar">${esc(u.avatar || '🐱')}</div><div><h2>${esc(u.name)}</h2><p>ID: ${esc(u.id)}<br>ເບີ: ${esc(u.phone)}</p><div class="profile-actions"><button type="button" class="outline" id="editProfileBtn">ແກ້ໄຂໂປຣໄຟລ໌</button><a class="link-btn" target="_blank" href="${waLink('ສະບາຍດີ Admin Bai Boua, ຂ້ອຍຕ້ອງການສອບຖາມ')}" >WhatsApp Admin</a><button type="button" class="danger" id="profileLogoutBtn">ອອກ</button></div></div></div></div><h3 class="section-title">ລາຍການສັ່ງຊື້ຂອງຂ້ອຍ</h3><div id="myOrders" class="order-list">${mine.map(o => orderCard(o)).join('') || '<div class="note">ຍັງບໍ່ມີອໍເດີ</div>'}</div>`;
  $('#editProfileBtn').onclick = openProfileEditor;
  $('#profileLogoutBtn').onclick = bbAuthLogout;
  attachOrderButtons($('#profileContent'));
}
function openProfileEditor() {
  const u = currentCustomer();
  openModal(`<div class="modal"><div class="modal-head"><h2>ແກ້ໄຂໂປຣໄຟລ໌</h2><button class="icon-btn" type="button" data-close>✕</button></div><div class="form-grid"><input id="editName" value="${esc(u.name)}" placeholder="ຊື່"><div class="two-col"><input value="+85620" disabled><input id="editPhone" inputmode="numeric" maxlength="8" value="${esc(phoneTail(u.phone))}"></div><input id="editPass" class="wide" value="${esc(u.pass || '')}" placeholder="ລະຫັດ"><select id="editAvatar" class="wide">${avatars.map(a => `<option value="${a}" ${u.avatar === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div><button type="button" class="success full" id="saveProfileBtn">ບັນທຶກ</button></div>`);
  $('#editPhone').oninput = e => e.target.value = digits(e.target.value).slice(0, 8);
  $('#saveProfileBtn').onclick = saveProfileEditor;
}
function saveProfileEditor() {
  const u = currentCustomer();
  const phone = normPhone($('#editPhone').value);
  if (!$('#editName').value.trim()) return toast('ໃສ່ຊື່ກ່ອນ');
  if (!validPhoneTail(phone)) return toast('ເບີຕ້ອງມີ 8 ຕົວ');
  const list = users();
  if (list.some(x => x.id !== u.id && x.phone === phone)) return toast('ເບີນີ້ມີຜູ້ໃຊ້ແລ້ວ');
  const found = list.find(x => x.id === u.id);
  found.name = $('#editName').value.trim();
  found.phone = phone;
  found.pass = $('#editPass').value.trim() || found.pass;
  found.avatar = $('#editAvatar').value;
  saveUsers(list);
  closeModal();
  toast('ບັນທຶກໂປຣໄຟລ໌ແລ້ວ');
  renderAll();
}

function renderAgent() {
  const a = currentAgent();
  if (currentRole() !== 'agent' || !a) { $('#agentPanel').innerHTML = ''; return; }
  const mine = orders().filter(o => o.agentId === a.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const filtered = state.agentStatus === 'all' ? mine : mine.filter(o => o.status === state.agentStatus);
  const sales = mine.filter(o => !['cancelled', 'rejected'].includes(o.status)).reduce((sum, o) => sum + Number(o.total || 0), 0);
  const chips = ['all', ...preorderFlow].filter((v, i, arr) => arr.indexOf(v) === i).map(s => `<button type="button" class="${state.agentStatus === s ? 'active' : ''}" data-agent-status="${s}">${s === 'all' ? 'ທັງໝົດ' : statusText(s)} <b>${s === 'all' ? mine.length : mine.filter(o => o.status === s).length}</b></button>`).join('');
  $('#agentPanel').innerHTML = `<div class="section-head"><div><h2>ສະບາຍດີ ${esc(a.name)}</h2><p class="muted">Agent ID: ${esc(a.id)} · ລາຄາທີ່ເຫັນແມ່ນລາຄາຕົວແທນ</p></div><button type="button" class="danger" id="agentLogoutBtn">ອອກ</button></div>${agentRuleCard(a)}<div class="panel-grid"><div class="panel-card"><h3>ອໍເດີ</h3><h2>${mine.length}</h2></div><div class="panel-card"><h3>ລໍຖ້າໂອນ</h3><h2>${mine.filter(o => ['pending_payment','rejected'].includes(o.status)).length}</h2></div><div class="panel-card"><h3>ລໍຖ້າກວດ Slip</h3><h2>${mine.filter(o => o.status === 'slip_uploaded').length}</h2></div><div class="panel-card"><h3>ຍອດອໍເດີ</h3><h2>${money(sales)}</h2></div></div><div class="note">ຕົວແທນສາມາດເລືອກສິນຄ້າ, copy caption, ເພີ່ມໃສ່ກະຕ່າ ແລະ ສ້າງອໍເດີໃຫ້ລູກຄ້າໄດ້.</div><h3 class="section-title">ສິນຄ້າສຳລັບຕົວແທນ</h3><div id="agentProducts" class="product-grid">${visibleProducts().map(productCard).join('')}</div><h3 class="section-title">ອໍເດີຂອງຕົວແທນ</h3><div class="chip-row">${chips}</div><div class="order-list">${filtered.map(o => orderCard(o)).join('') || '<div class="note">ບໍ່ມີອໍເດີໃນສະຖານະນີ້</div>'}</div>`;
  $('#agentLogoutBtn').onclick = bbAuthLogout;
  attachProductClicks($('#agentProducts'));
  attachOrderButtons($('#agentPanel'));
  $$('[data-agent-status]', $('#agentPanel')).forEach(btn => btn.onclick = () => { state.agentStatus = btn.dataset.agentStatus; renderAgent(); });
}

function tabName(tab) {
  return {overview:'ພາບລວມ', summary:'ສະຫຼຸບອໍເດີ', orders:'ອໍເດີ', products:'ສິນຄ້າ', categories:'ໝວດ', agents:'ຕົວແທນ', customers:'ລູກຄ້າ', settings:'ຕັ້ງຄ່າ'}[tab] || tab;
}
function renderAdmin() {
  if (currentRole() !== 'admin') { $('#adminPanel').innerHTML = ''; return; }
  const tabs = ['overview', 'summary', 'orders', 'products', 'categories', 'agents', 'customers', 'settings'];
  $('#adminPanel').innerHTML = `<div class="section-head"><div><h2>Admin Dashboard</h2><p class="muted">ຈັດການຮ້ານ, ສິນຄ້າ, ອໍເດີ, ລູກຄ້າ ແລະ ຕົວແທນ</p></div><button type="button" class="danger" id="adminLogoutBtn">ອອກ</button></div><div class="staff-tabs">${tabs.map(t => `<button type="button" class="${state.adminTab === t ? 'active' : ''}" data-admin-tab="${t}">${tabName(t)}</button>`).join('')}</div><div id="adminContent"></div>`;
  $('#adminLogoutBtn').onclick = bbAuthLogout;
  $$('[data-admin-tab]', $('#adminPanel')).forEach(btn => btn.onclick = () => { state.adminTab = btn.dataset.adminTab; renderAdmin(); play('click'); });
  renderAdminTab(state.adminTab);
}
function renderAdminTab(tab) {
  if (tab === 'overview') return adminOverview();
  if (tab === 'summary') return adminSummary();
  if (tab === 'orders') return adminOrders();
  if (tab === 'products') return adminProducts();
  if (tab === 'categories') return adminCategories();
  if (tab === 'agents') return adminAgents();
  if (tab === 'customers') return adminCustomers();
  if (tab === 'settings') return adminSettings();
}
function bbSummaryDateKey(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function bbSummaryDateLabel(key) {
  if (!key) return '-';
  const d = new Date(key + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return key;
  try {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (err) {
    return key;
  }
}
function bbSummaryDates() {
  return Array.from(new Set(orders().map(o => bbSummaryDateKey(o.createdAt)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
}
function bbSummaryBuyerPreview(setLike) {
  const names = Array.from(setLike || []).filter(Boolean);
  if (!names.length) return 'ບໍ່ມີຂໍ້ມູນ';
  const head = names.slice(0, 4).map(name => esc(name)).join(', ');
  return names.length > 4 ? `${head} +${names.length - 4}` : head;
}
function adminSummary() {
  const allOrders = orders().slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const dates = bbSummaryDates();
  if (!state.adminSummaryDate || !dates.includes(state.adminSummaryDate)) state.adminSummaryDate = dates[0] || '';
  const selectedDate = state.adminSummaryDate || '';
  const dayOrders = selectedDate ? allOrders.filter(o => bbSummaryDateKey(o.createdAt) === selectedDate) : [];
  const validOrders = dayOrders.filter(o => !['cancelled', 'rejected'].includes(o.status));
  const flatItems = [];
  dayOrders.forEach(o => {
    (o.items || []).forEach(item => {
      flatItems.push({
        ...item,
        __orderId: o.id,
        __createdAt: o.createdAt,
        __customerName: o.customer?.name || '-',
        __customerPhone: o.customer?.phone || '',
        __status: o.status
      });
    });
  });
  const productMap = new Map();
  flatItems.forEach(item => {
    const key = [item.productId || item.name || '-', item.variantName || '-', moneyValue(item.price || 0)].join('|');
    if (!productMap.has(key)) {
      productMap.set(key, {
        name: item.name || '-',
        variantName: item.variantName || '-',
        image: item.image || '',
        emoji: item.emoji || '🪷',
        qty: 0,
        amount: 0,
        orders: new Set(),
        buyers: new Set()
      });
    }
    const row = productMap.get(key);
    row.qty += Number(item.qty || 0);
    row.amount += lineTotal(item);
    row.orders.add(item.__orderId);
    row.buyers.add(item.__customerName);
    if (!row.image && item.image) row.image = item.image;
  });
  const productRows = Array.from(productMap.values()).sort((a, b) => (b.qty - a.qty) || (b.amount - a.amount) || String(a.name).localeCompare(String(b.name)));
  const totalSales = validOrders.reduce((sum, o) => sum + Number(displayOrderTotal(o) || o.total || 0), 0);
  const customerCount = new Set(dayOrders.map(o => [o.customer?.name || '-', o.customer?.phone || ''].join('|'))).size;
  const itemQty = flatItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const dateOptions = dates.map(d => `<option value="${esc(d)}" ${selectedDate === d ? 'selected' : ''}>${bbSummaryDateLabel(d)} (${allOrders.filter(o => bbSummaryDateKey(o.createdAt) === d).length} ອໍເດີ)</option>`).join('') || '<option value="">ຍັງບໍ່ມີອໍເດີ</option>';
  $('#adminContent').innerHTML = `<div class="admin-toolbar"><select id="adminSummaryDate">${dateOptions}</select><button type="button" class="outline" id="adminSummaryRefresh">Refresh</button></div><div class="panel-grid"><div class="panel-card"><h3>ວັນທີ່</h3><h2>${selectedDate ? bbSummaryDateLabel(selectedDate) : '-'}</h2><small>ອໍເດີຂອງມື້ນີ້</small></div><div class="panel-card"><h3>ຈຳນວນອໍເດີ</h3><h2>${dayOrders.length}</h2><small>ທັງໝົດໃນວັນນີ້</small></div><div class="panel-card"><h3>ຈຳນວນລູກຄ້າ</h3><h2>${customerCount}</h2><small>ຜູ້ສັ່ງຊື້ບໍ່ຊ້ຳ</small></div><div class="panel-card"><h3>ຍອດຂາຍ</h3><h2>${money(totalSales)}</h2><small>ບໍ່ນັບ cancelled/rejected</small></div></div><div class="auth-card"><h3>ສະຫຼຸບຕາມສິນຄ້າ</h3><div class="price-check"><span>ຈຳນວນຊິ້ນລວມ</span><b>${itemQty}</b></div><div class="order-item-list">${productRows.map(row => `<div class="order-item-row">${itemThumbHtml({ image: row.image, emoji: row.emoji }, 'order-item-thumb')}<div><b>${esc(row.name)}</b><br><span class="muted">${esc(row.variantName || '-')}</span><br><span class="muted">ລູກຄ້າ: ${row.buyers.size} ຄົນ · ອໍເດີ: ${row.orders.size}</span><br><span class="muted">ໃຜສັ່ງ: ${bbSummaryBuyerPreview(row.buyers)}</span></div><div class="item-qty">x${row.qty}</div><div class="item-price">${money(row.amount)}</div></div>`).join('') || '<div class="note">ບໍ່ມີລາຍການສິນຄ້າໃນວັນນີ້</div>'}</div></div><div class="auth-card" style="margin-top:14px"><h3>ອໍເດີຂອງວັນນີ້</h3><div class="admin-card-grid">${dayOrders.map(o => adminOrderCard(o)).join('') || '<div class="note">ບໍ່ມີອໍເດີໃນວັນນີ້</div>'}</div></div>`;
  const dateEl = $('#adminSummaryDate');
  if (dateEl) dateEl.onchange = e => { state.adminSummaryDate = e.target.value; adminSummary(); };
  const refreshBtn = $('#adminSummaryRefresh');
  if (refreshBtn) refreshBtn.onclick = adminSummary;
  attachAdminOrderEvents($('#adminContent'));
  attachZoomableImages($('#adminContent'));
}

function adminOverview() {
  const os = orders();
  const valid = os.filter(o => !['cancelled', 'rejected'].includes(o.status));
  const sales = valid.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const low = products().filter(p => normalizeType(p) === 'ready' && stockOf(p) < 5);
  $('#adminContent').innerHTML = `<div class="panel-grid"><div class="panel-card"><h3>ຍອດອໍເດີ</h3><h2>${money(sales)}</h2></div><div class="panel-card"><h3>ອໍເດີທັງໝົດ</h3><h2>${os.length}</h2></div><div class="panel-card"><h3>ລໍຖ້າກວດ Slip</h3><h2>${os.filter(o => o.status === 'slip_uploaded').length}</h2></div><div class="panel-card"><h3>ສິນຄ້າໃກ້ໝົດ</h3><h2>${low.length}</h2></div></div><h3>ອໍເດີຫຼ້າສຸດ</h3><div class="order-list">${os.slice(0, 5).map(o => adminOrderCard(o)).join('') || '<div class="note">ຍັງບໍ່ມີອໍເດີ</div>'}</div><h3>ສິນຄ້າໃກ້ໝົດ</h3><div class="pill-list">${low.map(p => `<span class="pill">${esc(p.name)} · ${stockOf(p)}</span>`).join('') || '<div class="note">ສະຕັອກຍັງພໍ</div>'}</div>`;
  attachAdminOrderEvents($('#adminContent'));
}
function adminOrderCard(o) {
  const allStatuses = Array.from(new Set([...flowForOrder(o), 'rejected', 'cancelled']));
  const names = (o.items || []).map(i => `${esc(i.name)} x${Number(i.qty || 0)}`).join(', ');
  return `<div class="admin-card admin-order-card ${hasViewedOrder(o) ? 'viewed' : ''}"><div><b>${esc(o.id)}</b> <span class="status ${statusClass(o.status)}">${statusText(o.status)}</span>${hasViewedOrder(o) ? ' <span class="viewed-mark">ເບິ່ງແລ້ວ</span>' : ''}<p class="muted">${niceDate(o.createdAt)} · ${typeName(o.kind)}</p><p><b>${esc(o.customer?.name || '-')}</b><br>${esc(o.customer?.phone || '')}${o.agentId ? `<br>Agent: ${esc(o.agentName || o.agentId)}` : ''}</p></div><div><b>${money(displayOrderTotal(o))}</b>${orderItemThumbsHtml(o)}<span class="muted">${names}</span>${o.slip ? '<div class="status good">ມີ Slip</div>' : ''}${o.billImg ? '<div class="status good">ມີບິນ</div>' : ''}</div><div class="admin-actions"><button type="button" class="outline" data-admin-detail="${esc(o.id)}">🔎 ລາຍລະອຽດ</button><select data-admin-status="${esc(o.id)}">${allStatuses.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${statusText(s)}</option>`).join('')}</select>${o.slip && o.status === 'slip_uploaded' ? `<button type="button" class="success" data-admin-approve="${esc(o.id)}">ຢືນຢັນ Slip</button><button type="button" class="danger" data-admin-reject="${esc(o.id)}">ຕີກັບ</button>` : ''}<button type="button" class="primary" data-admin-next="${esc(o.id)}">➡️ ຂັ້ນຕອນຖັດໄປ</button><label class="file-action">📄 ອັບບິນ<input type="file" accept="image/*" data-bill-upload="${esc(o.id)}"></label><button type="button" class="danger" data-admin-delete="${esc(o.id)}">🗑 ລົບ</button></div></div>`;
}
function adminOrders() {
  const statusOptions = ['all', ...Object.keys(statusLabel)];
  let list = orders().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const q = state.adminSearch.trim().toLowerCase();
  if (state.adminStatus !== 'all') list = list.filter(o => o.status === state.adminStatus);
  if (state.adminKind !== 'all') list = list.filter(o => o.kind === state.adminKind);
  if (q) list = list.filter(o => String(o.id).toLowerCase().includes(q) || String(o.customer?.name || '').toLowerCase().includes(q) || String(o.customer?.phone || '').toLowerCase().includes(q) || String(o.agentName || o.agentId || '').toLowerCase().includes(q));
  $('#adminContent').innerHTML = `<div class="admin-toolbar"><input id="adminOrderSearch" placeholder="ຄົ້ນຫາອໍເດີ/ຊື່/ເບີ" value="${esc(state.adminSearch)}"><select id="adminStatusFilter">${statusOptions.map(s => `<option value="${s}" ${state.adminStatus === s ? 'selected' : ''}>${s === 'all' ? 'ທຸກສະຖານະ' : statusText(s)}</option>`).join('')}</select><select id="adminKindFilter"><option value="all" ${state.adminKind === 'all' ? 'selected' : ''}>ທຸກປະເພດ</option><option value="ready" ${state.adminKind === 'ready' ? 'selected' : ''}>ພ້ອມສົ່ງ</option><option value="preorder" ${state.adminKind === 'preorder' ? 'selected' : ''}>Pre-order</option></select><button type="button" class="outline" id="refreshAdminOrders">Refresh</button></div><div class="admin-card-grid">${list.map(o => adminOrderCard(o)).join('') || '<div class="note">ບໍ່ພົບອໍເດີ</div>'}</div>`;
  $('#adminOrderSearch').oninput = debounce(e => { state.adminSearch = e.target.value; adminOrders(); }, 180);
  $('#adminStatusFilter').onchange = e => { state.adminStatus = e.target.value; adminOrders(); };
  $('#adminKindFilter').onchange = e => { state.adminKind = e.target.value; adminOrders(); };
  $('#refreshAdminOrders').onclick = adminOrders;
  attachAdminOrderEvents($('#adminContent'));
}
function adminProducts() {
  const list = visibleProducts();
  $('#adminContent').innerHTML = `<div class="admin-toolbar"><button type="button" class="success" id="addProductBtn">+ ເພີ່ມສິນຄ້າ</button><button type="button" class="outline" id="resetSampleProducts">ເພີ່ມຕົວຢ່າງສິນຄ້າ</button></div><div class="product-admin-list">${list.map(p => `<div class="product-admin-card ${p.active === false || (normalizeType(p) === 'ready' && stockOf(p) <= 0) ? 'inactive' : ''}"><div class="thumb">${productImageHtml(p)}</div>${productPreviewThumbsHtml(p, 4)}<h3>${esc(p.name)}</h3><p class="muted">${esc(p.category)} · ${typeName(normalizeType(p))} · ${p.active === false ? 'ປິດຂາຍ' : 'ເປີດຂາຍ'} · ${productImages(p).length} ຮູບ</p><b>ລາຄາລູກຄ້າ: ${money(p.price)}</b><br><span class="muted">ລາຄາຕົວແທນ: ${money(p.agentPrice || p.price)} · Stock: ${normalizeType(p) === 'preorder' ? 'Pre-order' : stockOf(p)}</span><div class="action-row"><button type="button" class="outline" data-prod-edit="${esc(p.id)}">✏️ ແກ້ໄຂ</button><button type="button" class="primary" data-prod-toggle="${esc(p.id)}">${p.active === false ? 'ເປີດຂາຍ' : 'ປິດຂາຍ'}</button><button type="button" class="danger" data-prod-delete="${esc(p.id)}">🗑 ລົບ</button></div></div>`).join('')}</div>`;
  $('#addProductBtn').onclick = () => openProductEditor();
  $('#resetSampleProducts').onclick = () => { if (confirm('ເພີ່ມສິນຄ້າຕົວຢ່າງໃສ່ລາຍການປັດຈຸບັນ?')) { saveProducts([...products(), ...seedProducts().map(p => ({...p, id: uid('P')}))]); renderAll(); } };
  $$('[data-prod-edit]', $('#adminContent')).forEach(btn => btn.onclick = () => openProductEditor(btn.dataset.prodEdit));
  $$('[data-prod-toggle]', $('#adminContent')).forEach(btn => btn.onclick = () => toggleProduct(btn.dataset.prodToggle));
  $$('[data-prod-delete]', $('#adminContent')).forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.prodDelete));
}
function variantsText(p) { return variantsOf(p).map(v => `${optionPartsFromName(v.name).size || v.name} | ${Number(v.stock || 0)}`).join('\n'); }
function renderEditImageList() {
  const box = $('#prodImageManager');
  if (!box) return;
  const imgs = state.editProductImages || [];
  box.innerHTML = imgs.length ? imgs.map((img, i) => `<div class="image-manager-card"><img src="${esc(img.src)}" alt=""><input data-img-label="${i}" value="${esc(img.label || `ຮູບ ${i + 1}`)}" placeholder="ຊື່ສີ/ແບບ ເຊັ່ນ ຂາວ"><button type="button" class="danger" data-img-remove="${i}">🗑 ລົບ</button></div>`).join('') : '<div class="note">ຍັງບໍ່ມີຮູບ, ກົດເພີ່ມຮູບໄດ້ຫຼາຍຮູບ.</div>';
  $$('[data-img-label]', box).forEach(inp => inp.oninput = () => { const i = Number(inp.dataset.imgLabel); if (state.editProductImages[i]) state.editProductImages[i].label = inp.value.trim(); });
  $$('[data-img-remove]', box).forEach(btn => btn.onclick = () => { state.editProductImages.splice(Number(btn.dataset.imgRemove), 1); renderEditImageList(); });
}
function openProductEditor(id = null) {
  const p = id ? products().find(x => x.id === id) : {name:'', category:categories()[0] || 'ອື່ນໆ', gender:'unisex', type:'ready', price:'', agentPrice:'', desc:'', emoji:'🪷', image:'', images:[], active:true, variants:[{name:'ມາດຕະຖານ', stock:1}], reviews:[]};
  if (!p) return;
  state.editProductImages = productImages(p).map(x => ({...x}));
  openModal(`<div class="modal wide"><div class="modal-head"><h2>${id ? 'ແກ້ໄຂສິນຄ້າ' : 'ເພີ່ມສິນຄ້າ'}</h2><button class="icon-btn" type="button" data-close>✕</button></div>
    <div class="note">ລາຄາລູກຄ້າ ແລະ ລາຄາຕົວແທນແຍກກັນຊັດເຈນ. ຮູບນ້ອຍໆແມ່ນສີ/ແບບໃຫ້ລູກຄ້າກົດເບິ່ງຮູບ. ໄຊສ໌/ເບີເກີບຂຽນແຍກໃນຊ່ອງຕົວເລືອກ; ບໍ່ຕ້ອງມີປຸ່ມສີແຍກອີກ.</div>
    <div class="admin-form"><input id="prodName" placeholder="ຊື່ສິນຄ້າ" value="${esc(p.name)}"><input id="prodCategory" placeholder="ໝວດ" value="${esc(p.category || '')}"><select id="prodGender"><option value="female" ${p.gender === 'female' ? 'selected' : ''}>ຍິງ</option><option value="male" ${p.gender === 'male' ? 'selected' : ''}>ຊາຍ</option><option value="unisex" ${(p.gender || 'unisex') === 'unisex' ? 'selected' : ''}>Unisex</option></select><select id="prodType"><option value="ready" ${normalizeType(p) === 'ready' ? 'selected' : ''}>ພ້ອມສົ່ງ</option><option value="preorder" ${normalizeType(p) === 'preorder' ? 'selected' : ''}>Pre-order 14-18 ມື້</option></select><input id="prodPrice" inputmode="numeric" placeholder="ລາຄາລູກຄ້າ" value="${esc(p.price)}"><input id="prodAgentPrice" inputmode="numeric" placeholder="ລາຄາຕົວແທນ" value="${esc(p.agentPrice || '')}"><input id="prodEmoji" placeholder="Emoji ສຳຮອງຖ້າບໍ່ມີຮູບ" value="${esc(p.emoji || '🪷')}"><label class="check-row"><input type="checkbox" id="prodActive" ${p.active !== false ? 'checked' : ''}> ເປີດຂາຍ</label><textarea id="prodDesc" class="wide" placeholder="ລາຍລະອຽດ">${esc(p.desc || '')}</textarea><textarea id="prodVariants" class="wide" placeholder="ໄຊສ໌/ເບີ | stock ແຖວລະ 1 ລາຍການ ເຊັ່ນ M | 5 ຫຼື 40 | 3">${esc(variantsText(p))}</textarea><div class="file-box wide"><input id="prodGalleryFiles" type="file" accept="image/*" multiple><b>📷 ເພີ່ມຮູບສິນຄ້າຫຼາຍຮູບ</b><br><span class="muted">ເລືອກຮູບຫຼາຍສີ/ຫຼາຍແບບ; ຮູບນ້ອຍນີ້ໃຫ້ລູກຄ້າກົດເບິ່ງ</span></div><div id="prodImageManager" class="image-manager wide"></div><label class="check-row wide"><input type="checkbox" id="prodClearImage"> ລຶບຮູບທັງໝົດຂອງສິນຄ້ານີ້</label></div><button type="button" class="success full" id="saveProductBtn">ບັນທຶກສິນຄ້າ</button></div>`, true);
  renderEditImageList();
  $('#prodGalleryFiles').onchange = async e => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const img = await readImageFile(file, 1000, .76);
      if (img) state.editProductImages.push({label:file.name.replace(/\.[^.]+$/, '').slice(0, 32) || `ຮູບ ${state.editProductImages.length + 1}`, src:img});
    }
    renderEditImageList();
    e.target.value = '';
  };
  ['prodPrice','prodAgentPrice'].forEach(id => { const el = $('#' + id); if (el) el.oninput = e => e.target.value = digits(e.target.value); });
  $('#saveProductBtn').onclick = () => saveProductFromEditor(id);
}
function parseVariants(text, type, imageList = []) {
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
  const list = lines.map(line => {
    const parts = line.split('|');
    const name = (parts[0] || 'ມາດຕະຖານ').trim();
    const stock = type === 'preorder' ? 9999 : Number(digits(parts[1] || '0'));
    return {name, stock, image:''};
  });
  return list.length ? list : [{name:'ມາດຕະຖານ', stock:type === 'preorder' ? 9999 : 1, image:''}];
}
async function saveProductFromEditor(id = null) {
  const type = $('#prodType').value;
  const name = $('#prodName').value.trim();
  if (!name) return toast('ໃສ່ຊື່ສິນຄ້າກ່ອນ');
  const category = $('#prodCategory').value.trim() || 'ອື່ນໆ';
  const list = products();
  let p = id ? list.find(x => x.id === id) : null;
  if (!p) { p = {id: uid('P'), createdAt:new Date().toISOString(), reviews:[]}; list.unshift(p); }
  if ($('#prodClearImage').checked) state.editProductImages = [];
  const images = (state.editProductImages || []).filter(img => img?.src).map((img, i) => ({label: img.label || `ຮູບ ${i + 1}`, src: img.src}));
  const price = moneyValue(digits($('#prodPrice').value) || 0);
  const agentPrice = moneyValue(digits($('#prodAgentPrice').value) || price);
  Object.assign(p, {name, category, gender:$('#prodGender').value, type, price, agentPrice, emoji:$('#prodEmoji').value.trim() || '🪷', desc:$('#prodDesc').value.trim(), variants:parseVariants($('#prodVariants').value, type, images), image:images[0]?.src || '', images, active:$('#prodActive').checked, updatedAt:new Date().toISOString()});
  saveProducts(list);
  if (!categories().includes(category)) saveCategories([...categories(), category]);
  closeModal();
  play('success');
  toast('ບັນທຶກສິນຄ້າແລ້ວ');
  renderAll();
}
function toggleProduct(id) {
  const list = products();
  const p = list.find(x => x.id === id);
  if (!p) return;
  p.active = p.active === false;
  saveProducts(list);
  renderAll();
}
function deleteProduct(id) {
  if (!confirm('ລົບສິນຄ້ານີ້?')) return;
  saveProducts(products().filter(p => p.id !== id));
  play('delete');
  renderAll();
}
function adminCategories() {
  $('#adminContent').innerHTML = `<div class="auth-card"><h3>ເພີ່ມໝວດ</h3><div class="admin-toolbar"><input id="newCategory" placeholder="ຊື່ໝວດໃໝ່"><button type="button" class="success" id="addCategoryBtn">ເພີ່ມ</button></div></div><h3>ໝວດທີ່ມີ</h3><div class="pill-list">${categories().map(c => `<span class="pill">${esc(c)} <button type="button" data-del-cat="${esc(c)}">×</button></span>`).join('')}</div>`;
  $('#addCategoryBtn').onclick = () => { const value = $('#newCategory').value.trim(); if (!value) return; if (categories().includes(value)) return toast('ມີໝວດນີ້ແລ້ວ'); saveCategories([...categories(), value]); renderAll(); };
  $$('[data-del-cat]', $('#adminContent')).forEach(btn => btn.onclick = () => { if (confirm('ລົບໝວດນີ້?')) { saveCategories(categories().filter(c => c !== btn.dataset.delCat)); renderAll(); } });
}
function agentStats(id) {
  const list = orders().filter(o => o.agentId === id);
  return {count:list.length, sales:list.filter(o => !['cancelled','rejected'].includes(o.status)).reduce((s, o) => s + Number(o.total || 0), 0)};
}
function adminAgents() {
  enforceAgentRules();
  $('#adminContent').innerHTML = `<div class="auth-card"><h3>ເພີ່ມຕົວແທນ</h3><div class="prod-manage"><input id="agentNameNew" placeholder="ຊື່"><input id="agentIdNew" placeholder="Agent ID"><input id="agentPassNew" placeholder="Password"><input id="agentPhoneNew" placeholder="ເບີໂທ"><button type="button" class="success" id="addAgentBtn">ເພີ່ມຕົວແທນ</button></div></div><h3>ລາຍຊື່ຕົວແທນ</h3><div class="order-list">${agents().map(a => { const st = agentStats(a.id); const rule = agentRuleStatus(a); return `<div class="agent-row"><div><b>${esc(a.name)}</b> ${a.active === false ? '<span class="status bad">ປິດ</span>' : '<span class="status good">ເປີດ</span>'}<br><span class="muted">${esc(a.id)} · ${esc(a.phone || '')}</span>${a.blockReason ? `<br><span class="muted">${esc(a.blockReason)}</span>` : ''}</div><div>ອໍເດີທັງໝົດ: <b>${st.count}</b><br><span class="muted">ອາທິດນີ້: ${rule.count}/${rule.min}</span></div><div>${money(st.sales)}<br><span class="muted">ເຫຼືອ ${rule.daysLeft} ມື້${rule.selfCount ? ` · self ${rule.selfCount}` : ''}</span></div><div class="action-row"><button type="button" class="outline" data-agent-toggle="${esc(a.id)}">${a.active === false ? 'ເປີດ' : 'ປິດ'}</button><button type="button" class="danger" data-agent-delete="${esc(a.id)}">🗑 ລົບ</button></div></div>`; }).join('') || '<div class="note">ຍັງບໍ່ມີຕົວແທນ</div>'}</div>`;
  $('#addAgentBtn').onclick = addAgent;
  $$('[data-agent-toggle]', $('#adminContent')).forEach(btn => btn.onclick = () => toggleAgent(btn.dataset.agentToggle));
  $$('[data-agent-delete]', $('#adminContent')).forEach(btn => btn.onclick = () => deleteAgent(btn.dataset.agentDelete));
}
function addAgent() {
  const id = $('#agentIdNew').value.trim();
  const name = $('#agentNameNew').value.trim();
  const pass = $('#agentPassNew').value.trim();
  if (!id || !name || !pass) return toast('ກອກຊື່, ID, Password ໃຫ້ຄົບ');
  const list = agents();
  if (list.some(a => a.id === id)) return toast('Agent ID ຊ້ຳ');
  const phoneRaw = $('#agentPhoneNew').value.trim();
  list.push({id, name, pass, phone:phoneRaw ? normPhone(phoneRaw) : '', active:true, createdAt:new Date().toISOString(), weekStartedAt:new Date().toISOString()});
  saveAgents(list);
  toast('ເພີ່ມຕົວແທນແລ້ວ');
  renderAll();
}
function toggleAgent(id) {
  const list = agents();
  const a = list.find(x => x.id === id);
  if (a) {
    a.active = a.active === false;
    if (a.active) { a.autoBlocked = false; a.blockReason = ''; a.weekStartedAt = new Date().toISOString(); }
  }
  saveAgents(list);
  renderAll();
}
function deleteAgent(id) {
  if (!confirm('ລົບຕົວແທນນີ້?')) return;
  saveAgents(agents().filter(a => a.id !== id));
  renderAll();
}
function customerStats(id) {
  const list = orders().filter(o => o.userId === id);
  return {count:list.length, sales:list.filter(o => !['cancelled','rejected'].includes(o.status)).reduce((s, o) => s + Number(o.total || 0), 0)};
}
function adminCustomers() {
  $('#adminContent').innerHTML = `<div class="order-list">${users().map(u => { const st = customerStats(u.id); return `<div class="customer-row"><div><b>${esc(u.name)}</b><br><span class="muted">${esc(u.phone)} · ${esc(u.id)}</span></div><div>ອໍເດີ: <b>${st.count}</b></div><div>${money(st.sales)}</div><div class="action-row"><button type="button" class="outline" data-customer-detail="${esc(u.id)}">🔎 ລາຍລະອຽດ</button><button type="button" class="primary" data-customer-pass="${esc(u.id)}">ປ່ຽນລະຫັດ</button><button type="button" class="danger" data-customer-delete="${esc(u.id)}">🗑 ລົບ</button></div></div>`; }).join('') || '<div class="note">ຍັງບໍ່ມີລູກຄ້າ</div>'}</div>`;
  $$('[data-customer-detail]', $('#adminContent')).forEach(btn => btn.onclick = () => openCustomerDetail(btn.dataset.customerDetail));
  $$('[data-customer-pass]', $('#adminContent')).forEach(btn => btn.onclick = () => openCustomerPassword(btn.dataset.customerPass));
  $$('[data-customer-delete]', $('#adminContent')).forEach(btn => btn.onclick = () => deleteCustomer(btn.dataset.customerDelete));
}
function openCustomerDetail(id) {
  const u = users().find(x => x.id === id);
  if (!u) return;
  const list = orders().filter(o => o.userId === id);
  openModal(`<div class="modal"><div class="modal-head"><h2>${esc(u.name)}</h2><button class="icon-btn" type="button" data-close>✕</button></div><div class="note"><b>ເບີ:</b> ${esc(u.phone)}<br><b>ID:</b> ${esc(u.id)}<br><b>ອໍເດີ:</b> ${list.length}</div><div class="action-row" style="margin-top:10px"><button type="button" class="primary" data-customer-pass="${esc(u.id)}">ປ່ຽນລະຫັດລູກຄ້າ</button><a class="link-btn" target="_blank" href="${waLink('ສະບາຍດີ ' + (u.name || '') + ', Admin Bai Boua ແຈ້ງເລື່ອງບັນຊີ/ລະຫັດຂອງທ່ານ', u.phone)}">WhatsApp ຫາລູກຄ້າ</a></div><div class="order-list" style="margin-top:12px">${list.map(o => orderCard(o)).join('') || '<div class="note">ບໍ່ມີອໍເດີ</div>'}</div></div>`);
  attachOrderButtons($('#modalLayer'));
  $$('[data-customer-pass]', $('#modalLayer')).forEach(btn => btn.onclick = () => openCustomerPassword(btn.dataset.customerPass));
}
function openCustomerPassword(id) {
  const u = users().find(x => x.id === id);
  if (!u) return;
  openModal(`<div class="modal"><div class="modal-head"><h2>ປ່ຽນລະຫັດ: ${esc(u.name)}</h2><button class="icon-btn" type="button" data-close>✕</button></div><div class="note">ໃຊ້ເມື່ອລູກຄ້າລືມລະຫັດ ແລ້ວທັກຫາ Admin.</div><div class="form-grid"><input id="newCustomerPass" class="wide" placeholder="ລະຫັດໃໝ່ ຢ່າງນ້ອຍ 4 ຕົວ"><input id="newCustomerPass2" class="wide" placeholder="ຢືນຢັນລະຫັດໃໝ່"></div><button type="button" class="success full" id="saveCustomerPassBtn">ບັນທຶກລະຫັດໃໝ່</button></div>`);
  $('#saveCustomerPassBtn').onclick = () => saveCustomerPassword(id);
}
function saveCustomerPassword(id) {
  const pass = $('#newCustomerPass').value.trim();
  const pass2 = $('#newCustomerPass2').value.trim();
  if (pass.length < 4) return toast('ລະຫັດໃໝ່ຕ້ອງຢ່າງນ້ອຍ 4 ຕົວ');
  if (pass !== pass2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const list = users();
  const u = list.find(x => x.id === id);
  if (!u) return;
  u.pass = pass;
  u.passwordUpdatedAt = new Date().toISOString();
  saveUsers(list);
  toast('ປ່ຽນລະຫັດລູກຄ້າແລ້ວ');
  play('success');
  closeModal();
  renderAll();
}
function deleteCustomer(id) {
  if (!confirm('ລົບລູກຄ້ານີ້?')) return;
  saveUsers(users().filter(u => u.id !== id));
  renderAll();
}
function adminSettings() {
  const cfg = settings();
  $('#adminContent').innerHTML = `<div class="auth-card"><h3>ຕັ້ງຄ່າຮ້ານ</h3><div class="admin-form"><input id="setShopName" value="${esc(cfg.shopName)}" placeholder="ຊື່ຮ້ານ"><input id="setAdminPhone" value="${esc(cfg.adminPhone)}" placeholder="WhatsApp Admin"><input id="setAdminId" value="${esc(cfg.adminId)}" placeholder="Admin ID"><input id="setAdminPass" value="${esc(cfg.adminPass)}" placeholder="Admin Password"><input id="setAgentMin" inputmode="numeric" value="${esc(cfg.agentWeeklyMin || 7)}" placeholder="ອໍເດີຕົວແທນ/ອາທິດ"></div><button type="button" class="success full" id="saveSettingsBtn">ບັນທຶກຕັ້ງຄ່າ</button></div><div class="auth-card" style="margin-top:14px"><h3>Backup / Restore</h3><div class="action-row"><button type="button" class="outline" id="exportBackupBtn">Export JSON</button><label class="outline" style="position:relative;overflow:hidden">Import JSON<input id="importBackupFile" type="file" accept="application/json" style="position:absolute;inset:0;opacity:0"></label><button type="button" class="danger" id="clearOrdersBtn">ລ້າງອໍເດີທັງໝົດ</button></div></div>`;
  $('#saveSettingsBtn').onclick = () => { saveSettings({shopName:$('#setShopName').value.trim() || 'Bai Boua', adminPhone:digits($('#setAdminPhone').value) || DEFAULT_ADMIN_PHONE, adminId:$('#setAdminId').value.trim() || DEFAULT_SETTINGS.adminId, adminPass:$('#setAdminPass').value.trim() || DEFAULT_SETTINGS.adminPass, agentWeeklyMin:Math.max(1, Number(digits($('#setAgentMin').value) || 7))}); toast('ບັນທຶກຕັ້ງຄ່າແລ້ວ'); renderAll(); };
  $('#exportBackupBtn').onclick = exportBackup;
  $('#importBackupFile').onchange = importBackup;
  $('#clearOrdersBtn').onclick = () => { if (confirm('ລ້າງອໍເດີທັງໝົດ?')) { saveOrders([]); renderAll(); } };
}
function exportBackup() {
  const data = {version:'Bai Boua v53', exportedAt:new Date().toISOString(), users:users(), agents:agents(), products:products(), orders:orders(), categories:categories(), settings:settings(), notifications:notifications()};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bai-boua-backup-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!confirm('Import ຂໍ້ມູນໃໝ່ຈະທັບຂໍ້ມູນເກົ່າ ຢືນຢັນ?')) return;
      if (Array.isArray(data.users)) saveUsers(data.users);
      if (Array.isArray(data.agents)) saveAgents(data.agents);
      if (Array.isArray(data.products)) saveProducts(data.products);
      if (Array.isArray(data.orders)) saveOrders(data.orders);
      if (Array.isArray(data.categories)) saveCategories(data.categories);
      if (data.settings) saveSettings(data.settings);
      if (Array.isArray(data.notifications)) saveNotifications(data.notifications);
      toast('Import ສຳເລັດ');
      renderAll();
    } catch (err) { toast('ໄຟລ໌ Backup ບໍ່ຖືກ'); }
  };
  reader.readAsText(file);
}

function renderAll() {
  enforceAgentRules();
  updateAuthGate();
  updateAuthHelp();
  updateRoleChrome();
  activatePage();
  renderFilters();
  renderFeatured();
  renderProducts();
  renderWishlist();
  renderCart();
  renderProfile();
  renderAgent();
  renderAdmin();
}
function bindCoreEvents() {
  $$('#bb-auth-tabs [data-auth-role]').forEach(btn => btn.onclick = () => bbAuthSwitch(btn.dataset.authRole));
  $('#bb-register-btn').onclick = bbAuthRegisterCustomer;
  $('#bb-login-btn').onclick = bbAuthLogin;
  $('#bb-auth-pass').addEventListener('keydown', e => { if (e.key === 'Enter') bbAuthLogin(); });
  $('#bb-auth-id').addEventListener('input', e => { if (state.authRole === 'customer') enforcePhonePrefixInput(e.target); });
  $('#bb-auth-id').addEventListener('focus', e => { if (state.authRole === 'customer') enforcePhonePrefixInput(e.target); });
  $('#homeBtn').onclick = () => nav('home');
  $$('#mainNav [data-page], #roleAccess [data-page]').forEach(btn => btn.onclick = () => nav(btn.dataset.page));
  $$('[data-go]').forEach(btn => btn.onclick = () => nav(btn.dataset.go));
  $('#searchInput').oninput = debounce(renderProducts, 160);
  $('#cartBtn').onclick = openCart;
  $('#notifyBtn').onclick = openNotifications;
  $('#closeCart').onclick = closeCart;
  $('#checkoutBtn').onclick = checkout;
  $('#musicBtn').onclick = toggleMusic;
  $('#soundBtn').onclick = toggleSound;
  $('#profileQuickBtn').onclick = openCurrentRolePage;
  $('#bb-profile-chip').onclick = openProfileCard;
  $('#bb-profile-close').onclick = closeProfileCard;
  $('#bb-profile-modal').onclick = e => { if (e.target.id === 'bb-profile-modal') closeProfileCard(); };
  $('#bb-logout-btn').onclick = bbAuthLogout;
  $('#bb-profile-open-page').onclick = openCurrentRolePage;
  $('#modalLayer').onclick = e => { if (e.target.id === 'modalLayer') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeProfileCard(); closeCart(); } });
}

document.addEventListener('DOMContentLoaded', () => {
  initData();
  bindCoreEvents();
  setupMusic();
  bbAuthSwitch('customer');
  renderAll();
  const badge = document.createElement('div');
  badge.id = 'bb-cloud-status';
  badge.className = 'cloud-status offline';
  badge.textContent = '☁️ Offline';
  document.body.appendChild(badge);
  cloudLoadAll().then(loaded => {
    if (loaded) { initData(); renderAll(); toast('Sync ຂໍ້ມູນຈາກ Supabase ແລ້ວ'); }
  });
  setTimeout(() => document.querySelector("#loading")?.classList.add("hidden"), 150);
});

Object.assign(window, {bbAuthSwitch, bbAuthLogin, bbAuthRegisterCustomer, bbAuthLogout, bbOpenProfileCard:openProfileCard, bbCloseProfileCard:closeProfileCard});


/* =========================
   v58 PRO SHOP UPGRADE
   ========================= */
function v58OrdersInRange(days) {
  const since = new Date();
  since.setDate(since.getDate() - Number(days || 0));
  return orders().filter(o => new Date(o.createdAt || 0) >= since);
}
function v58ValidOrders(list = orders()) { return list.filter(o => !['cancelled', 'rejected'].includes(o.status)); }
function v58Sales(list = orders()) { return v58ValidOrders(list).reduce((sum, o) => sum + Number(displayOrderTotal(o) || 0), 0); }
function v58DateKey(d) { try { return new Date(d).toISOString().slice(0, 10); } catch (err) { return ''; } }
function v58DailyBars(days = 7) {
  const base = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    base.push({ key: v58DateKey(d), label: d.toLocaleDateString('lo-LA', { month: 'short', day: 'numeric' }), total: 0, count: 0 });
  }
  const map = Object.fromEntries(base.map(x => [x.key, x]));
  v58ValidOrders().forEach(o => { const key = v58DateKey(o.createdAt); if (map[key]) { map[key].total += Number(displayOrderTotal(o) || 0); map[key].count += 1; } });
  const max = Math.max(1, ...base.map(x => x.total));
  return `<div class="sales-chart">${base.map(x => `<div class="sales-bar-wrap"><div class="sales-bar" style="height:${Math.max(6, Math.round((x.total / max) * 90))}px"></div><small>${esc(x.label)}</small><b>${x.count}</b></div>`).join('')}</div>`;
}
function v58StatusSummary() {
  const groups = ['pending_payment','slip_uploaded','paid','preparing','packed','bill_sent','shipped','completed','cancelled'];
  return `<div class="status-summary">${groups.map(st => `<button type="button" class="status ${statusClass(st)}" data-v58-status="${st}">${statusText(st)} <b>${orders().filter(o => o.status === st).length}</b></button>`).join('')}</div>`;
}
function v58LowStockList(limit = 8) {
  return products().filter(p => normalizeType(p) === 'ready').map(p => ({p, stock: stockOf(p)})).filter(x => x.stock <= 5).sort((a,b) => a.stock - b.stock).slice(0, limit);
}
function v58TrackingHtml(o) {
  const t = o.tracking || {};
  const label = t.code ? `<div class="tracking-card"><b>🚚 ເລກພັດສະດຸ:</b> ${esc(t.code)}<br><span class="muted">${esc(t.carrier || o.shipping?.method || 'ຂົນສົ່ງ')} ${t.updatedAt ? '· ' + niceDate(t.updatedAt) : ''}</span>${t.url ? `<br><a class="link-btn small" target="_blank" href="${esc(t.url)}">ເປີດໜ້າຕິດຕາມ</a>` : ''}</div>` : '<div class="note">ຍັງບໍ່ມີເລກພັດສະດຸ</div>';
  return `<h3>ຕິດຕາມພັດສະດຸ</h3>${label}`;
}
function v58TrackingForm(o) {
  if (currentRole() !== 'admin') return '';
  const t = o.tracking || {};
  return `<div class="tracking-form"><input data-track-carrier="${esc(o.id)}" value="${esc(t.carrier || o.shipping?.method || '')}" placeholder="ຂົນສົ່ງ / ບໍລິສັດ"><input data-track-code="${esc(o.id)}" value="${esc(t.code || '')}" placeholder="ເລກພັດສະດຸ"><input data-track-url="${esc(o.id)}" value="${esc(t.url || '')}" placeholder="Link ຕິດຕາມ (ຖ້າມີ)"><button type="button" class="success" data-save-track="${esc(o.id)}">ບັນທຶກ tracking</button></div>`;
}
function v58FindTrackInput(id, attr) {
  return Array.from($$(`[${attr}]`, $('#modalLayer'))).find(el => el.getAttribute(attr) === id);
}
function v58SaveTracking(id) {
  const list = orders();
  const o = list.find(x => x.id === id);
  if (!o) return;
  const carrier = (v58FindTrackInput(id, 'data-track-carrier')?.value || '').trim();
  const code = (v58FindTrackInput(id, 'data-track-code')?.value || '').trim();
  const url = (v58FindTrackInput(id, 'data-track-url')?.value || '').trim();
  if (!code) return toast('ໃສ່ເລກພັດສະດຸກ່ອນ');
  o.tracking = { carrier, code, url, updatedAt: new Date().toISOString() };
  o.updatedAt = new Date().toISOString();
  o.logs = Array.isArray(o.logs) ? o.logs : [];
  o.logs.push({ at: new Date().toISOString(), text: `Admin ບັນທຶກ tracking: ${carrier || 'ຂົນສົ່ງ'} ${code}` });
  if (['packed', 'waiting_bill', 'bill_sent'].includes(o.status)) o.status = 'shipped';
  saveOrders(list);
  notifyOrderOwner(o, `ອໍເດີ ${o.id} ມີເລກພັດສະດຸ ${code}`, 'tracking');
  toast('ບັນທຶກ tracking ແລ້ວ');
  play('success');
  renderAll();
  openOrderDetail(id);
}
function v58StockAuditHtml() {
  const lows = v58LowStockList(12);
  const rows = lows.map(({p, stock}) => `<div class="stock-row"><span>${productImageHtml(p)}</span><div><b>${esc(p.name)}</b><br><span class="muted">${esc(p.category || '')}</span></div><b class="${stock <= 0 ? 'stock-zero' : 'stock-low'}">${stock}</b></div>`).join('');
  return `<div class="stock-audit"><h3>ເຊັກ Stock ດ່ວນ</h3>${rows || '<div class="note">Stock ຍັງພໍທຸກໂຕ</div>'}</div>`;
}

adminOverview = function() {
  const os = orders();
  const today = v58OrdersInRange(1), week = v58OrdersInRange(7), month = v58OrdersInRange(30);
  const unread = os.filter(o => !hasViewedOrder(o)).length;
  $('#adminContent').innerHTML = `<div class="panel-grid v58-kpis"><div class="panel-card"><h3>ຍອດຂາຍມື້ນີ້</h3><h2>${money(v58Sales(today))}</h2><small>${today.length} ອໍເດີ</small></div><div class="panel-card"><h3>7 ມື້ຫຼ້າສຸດ</h3><h2>${money(v58Sales(week))}</h2><small>${week.length} ອໍເດີ</small></div><div class="panel-card"><h3>30 ມື້ຫຼ້າສຸດ</h3><h2>${money(v58Sales(month))}</h2><small>${month.length} ອໍເດີ</small></div><div class="panel-card"><h3>ອໍເດີໃໝ່</h3><h2>${unread}</h2><small>ຍັງບໍ່ເບິ່ງ</small></div></div><div class="admin-two-col"><div class="auth-card"><h3>ກຣາຟຍອດອໍເດີ 7 ມື້</h3>${v58DailyBars(7)}</div><div class="auth-card"><h3>ສະຖານະອໍເດີ</h3>${v58StatusSummary()}</div></div>${v58StockAuditHtml()}<h3>ອໍເດີຫຼ້າສຸດ</h3><div class="order-list">${os.slice(0, 6).map(o => adminOrderCard(o)).join('') || '<div class="note">ຍັງບໍ່ມີອໍເດີ</div>'}</div>`;
  $$('[data-v58-status]', $('#adminContent')).forEach(btn => btn.onclick = () => { state.adminTab = 'orders'; state.adminStatus = btn.dataset.v58Status; renderAdmin(); });
  attachAdminOrderEvents($('#adminContent'));
};

const v58OldBillSectionHtml = billSectionHtml;
billSectionHtml = function(o) { return v58OldBillSectionHtml(o) + v58TrackingHtml(o) + v58TrackingForm(o); };
const v58OldAdminActionsHtml = adminActionsHtml;
adminActionsHtml = function(o) { return v58OldAdminActionsHtml(o) + `<div class="note">Tip: ຢືນຢັນ Slip/ຂັ້ນຕອນຖັດໄປ = ຕັດ stock ສຳລັບສິນຄ້າພ້ອມສົ່ງອັດຕະໂນມັດ.</div>`; };
const v58OldAttachAdminOrderEvents = attachAdminOrderEvents;
attachAdminOrderEvents = function(root = document) { v58OldAttachAdminOrderEvents(root); $$('[data-save-track]', root).forEach(btn => btn.onclick = () => v58SaveTracking(btn.dataset.saveTrack)); };
const v58OldOrderCustomerMessage = orderCustomerMessage;
orderCustomerMessage = function(o) { const t = o.tracking || {}; return v58OldOrderCustomerMessage(o) + (t.code ? `\n\nເລກພັດສະດຸ: ${t.code}\nຂົນສົ່ງ: ${t.carrier || o.shipping?.method || ''}${t.url ? '\nLink: ' + t.url : ''}` : ''); };
const v58OldAdminOrderCard = adminOrderCard;
adminOrderCard = function(o) { let html = v58OldAdminOrderCard(o); if (o.tracking?.code) html = html.replace('</div></div>', `<div class="tracking-mini">🚚 ${esc(o.tracking.code)}</div></div></div>`); return html; };

/* =========================
   v62 PRODUCTION HARDENING
   ========================= */
const BB_PRODUCTION_VERSION = 'v62-production';
const BB_PRODUCTION_SYNC_MS = 18000;
let bbProductionRealtimeStarted = false;
let bbProductionPollTimer = null;

function bbProductionNormalizeOrder(o) {
  if (!o || typeof o !== 'object') return o;
  o.items = Array.isArray(o.items) ? o.items : [];
  o.items = o.items.map(item => ({...item, qty: Math.max(1, Math.round(Number(item.qty || 1))), price: moneyValue(item.price), basePrice: moneyValue(item.basePrice || item.price || 0), agentPrice: moneyValue(item.agentPrice || item.price || 0)}));
  const total = calcOrderTotal(o);
  o.total = total || moneyValue(o.total);
  o.updatedAt = o.updatedAt || o.createdAt || new Date().toISOString();
  o.logs = Array.isArray(o.logs) ? o.logs : [];
  return o;
}
function bbProductionNormalizeProducts(list = products()) {
  let changed = false;
  const next = (Array.isArray(list) ? list : []).map(p => {
    if (!p || typeof p !== 'object') return p;
    const oldPrice = p.price;
    const oldAgent = p.agentPrice;
    p.price = moneyValue(p.price);
    p.agentPrice = moneyValue(p.agentPrice || p.price);
    p.variants = variantsOf(p).map(v => ({...v, stock: normalizeType(p) === 'preorder' ? v.stock : Math.max(0, Math.round(Number(v.stock || 0)))}));
    if (oldPrice !== p.price || oldAgent !== p.agentPrice) changed = true;
    return p;
  });
  if (changed) saveProducts(next);
  return next;
}
function bbProductionNormalizeState() {
  try {
    const before = JSON.stringify(orders());
    const orderList = orders().map(bbProductionNormalizeOrder).filter(Boolean);
    if (JSON.stringify(orderList) !== before) saveOrders(orderList);
    bbProductionNormalizeProducts();
    const role = localStorage.getItem(ROLE_KEY);
    if (role === 'customer' && !currentCustomer()) removeKey(DB.session);
    if (role === 'agent' && !currentAgent()) removeKey(DB.agentSession);
    if (role === 'admin' && !adminLogged()) removeKey(DB.adminSession);
  } catch (err) { console.warn('Production normalize failed', err); }
}

const bbOriginalSaveOrders = saveOrders;
saveOrders = function(list) { return bbOriginalSaveOrders((Array.isArray(list) ? list : []).map(bbProductionNormalizeOrder).filter(Boolean)); };

const bbOriginalCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() { const ok = await bbOriginalCloudLoadAll(); bbProductionNormalizeState(); return ok; };

const bbOriginalBbAuthLogin = bbAuthLogin;
bbAuthLogin = async function() { if (getCloudClient()) await cloudLoadAll(); return bbOriginalBbAuthLogin(); };

const bbOriginalRegisterCustomer = bbAuthRegisterCustomer;
bbAuthRegisterCustomer = async function() { if (getCloudClient()) await cloudLoadAll(); return bbOriginalRegisterCustomer(); };

function bbProductionStartRealtime() {
  if (bbProductionRealtimeStarted) return;
  const client = getCloudClient();
  if (!client || typeof client.channel !== 'function') return;
  bbProductionRealtimeStarted = true;
  try {
    client.channel('bb_state_production_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bb_state' }, debounce(async () => { await cloudLoadAll(); renderAll(); }, 900))
      .subscribe(status => { if (status === 'SUBSCRIBED') setCloudStatus('online'); });
  } catch (err) { console.warn('Realtime subscribe failed', err); }
}
function bbProductionStartPolling() {
  clearInterval(bbProductionPollTimer);
  bbProductionPollTimer = setInterval(async () => { if (document.hidden) return; const ok = await cloudLoadAll(); if (ok) renderAll(); }, BB_PRODUCTION_SYNC_MS);
}
function bbProductionHealthCheck() {
  bbProductionNormalizeState();
  if (!getCloudClient()) { setCloudStatus('offline'); return; }
  bbProductionStartRealtime();
  bbProductionStartPolling();
  window.addEventListener('online', async () => { await cloudUploadAll(); await cloudLoadAll(); renderAll(); toast('ກັບມາ Online ແລະ Sync ແລ້ວ'); });
  window.addEventListener('offline', () => setCloudStatus('offline'));
}
setTimeout(bbProductionHealthCheck, 900);
Object.assign(window, { BB_PRODUCTION_VERSION, bbProductionHealthCheck, bbProductionNormalizeState });

/* v63 customer/agent merge sync fix
   Problem fixed: when two phones register customers/agents, old state could overwrite bb_state users.
   This patch merges cloud + local records by stable id/phone before save/load. */
const BB_V63_VERSION = 'v63 multi-customer merge sync';
function bbMergeByIdentity(remoteList, localList, type) {
  const result = [];
  const map = new Map();
  function keyFor(item) {
    if (!item || typeof item !== 'object') return '';
    if (type === 'users') return item.phone ? `phone:${item.phone}` : (item.id ? `id:${item.id}` : '');
    if (type === 'agents') return item.id ? `id:${item.id}` : (item.phone ? `phone:${item.phone}` : '');
    return item.id ? `id:${item.id}` : '';
  }
  function add(list, source) {
    (Array.isArray(list) ? list : []).forEach(item => {
      const k = keyFor(item);
      if (!k) return;
      const old = map.get(k) || {};
      map.set(k, { ...old, ...item, _bbSource: source });
    });
  }
  add(remoteList, 'remote');
  add(localList, 'local'); // local wins for just-edited passwords/names
  map.forEach(value => { delete value._bbSource; result.push(value); });
  return result;
}
function bbMergeArrayState(key, remoteValue, localValue) {
  if (key === DB.users) return bbMergeByIdentity(remoteValue, localValue, 'users');
  if (key === DB.agents) return bbMergeByIdentity(remoteValue, localValue, 'agents');
  if (key === DB.orders) return bbMergeByIdentity(remoteValue, localValue, 'orders');
  if (key === DB.notifications) return bbMergeByIdentity(remoteValue, localValue, 'notifications').slice(0, 160);
  if (key === DB.products) return Array.isArray(localValue) && localValue.length ? bbMergeByIdentity(remoteValue, localValue, 'products') : (remoteValue || localValue || []);
  if (key === DB.categories) {
    const seen = new Set();
    return [...(Array.isArray(remoteValue) ? remoteValue : []), ...(Array.isArray(localValue) ? localValue : [])].filter(x => {
      if (!x || seen.has(x)) return false;
      seen.add(x); return true;
    });
  }
  if (key === DB.viewedOrders) return { ...(remoteValue || {}), ...(localValue || {}) };
  return remoteValue !== undefined && remoteValue !== null ? remoteValue : localValue;
}
async function bbV63FetchCloudKey(key) {
  const client = getCloudClient();
  if (!client) return undefined;
  const { data, error } = await client.from('bb_state').select('data').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.data : undefined;
}
const bbV63OriginalCloudSaveNow = cloudSaveNow;
cloudSaveNow = async function(key, value) {
  if (cloudPulling || !CLOUD_KEYS.includes(key)) return;
  const client = getCloudClient();
  if (!client) { setCloudStatus('offline'); return; }
  try {
    setCloudStatus('syncing');
    let finalValue = value;
    if ([DB.users, DB.agents, DB.orders, DB.notifications, DB.products, DB.categories, DB.viewedOrders].includes(key)) {
      const remoteValue = await bbV63FetchCloudKey(key);
      finalValue = bbMergeArrayState(key, remoteValue, value);
      localStorage.setItem(key, JSON.stringify(finalValue));
    }
    const { error } = await client.from('bb_state').upsert({ key, data: finalValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    setCloudStatus('online');
  } catch (err) {
    console.warn('Supabase v63 merged save failed:', key, err);
    setCloudStatus('offline');
    return bbV63OriginalCloudSaveNow(key, value);
  }
};
const bbV63OriginalCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const client = getCloudClient();
  if (!client) { setCloudStatus('offline'); return false; }
  try {
    setCloudStatus('syncing');
    const localBefore = {};
    CLOUD_KEYS.forEach(key => { localBefore[key] = load(key, key === DB.viewedOrders ? {} : []); });
    const { data, error } = await client.from('bb_state').select('key,data,updated_at');
    if (error) throw error;
    if (!data || !data.length) { await cloudUploadAll(); return false; }
    cloudPulling = true;
    for (const row of data) {
      if (!CLOUD_KEYS.includes(row.key)) continue;
      const merged = bbMergeArrayState(row.key, row.data, localBefore[row.key]);
      localStorage.setItem(row.key, JSON.stringify(merged));
    }
    cloudPulling = false;
    bbProductionNormalizeState();
    setCloudStatus('online');
    return true;
  } catch (err) {
    cloudPulling = false;
    console.warn('Supabase v63 merged load failed:', err);
    setCloudStatus('offline');
    return bbV63OriginalCloudLoadAll();
  }
};
const bbV63OriginalSaveUsers = saveUsers;
saveUsers = function(list) {
  const merged = bbMergeByIdentity(users(), list, 'users');
  return bbV63OriginalSaveUsers(merged);
};
const bbV63OriginalSaveAgents = saveAgents;
saveAgents = function(list) {
  const merged = bbMergeByIdentity(agents(), list, 'agents');
  return bbV63OriginalSaveAgents(merged);
};
const bbV63OriginalRegisterCustomer = bbAuthRegisterCustomer;
bbAuthRegisterCustomer = async function() {
  if (getCloudClient()) await cloudLoadAll();
  const before = users().length;
  const result = await bbV63OriginalRegisterCustomer();
  if (users().length >= before && getCloudClient()) await cloudSaveNow(DB.users, users());
  return result;
};
const bbV63OriginalAdminCustomers = adminCustomers;
adminCustomers = async function() {
  if (getCloudClient()) await cloudLoadAll();
  return bbV63OriginalAdminCustomers();
};
Object.assign(window, { BB_V63_VERSION, bbMergeByIdentity, bbMergeArrayState });

/* v64 customer registry sync fix
   Customers are now saved into a dedicated Supabase table immediately at registration,
   so Admin can see registered customers even if they have never placed an order. */
const BB_V64_VERSION = 'v64 customer registry sync';
const BB_CUSTOMERS_TABLE = 'bb_customers';
function bbV64PlainUser(u) {
  if (!u || typeof u !== 'object') return null;
  return {
    id: String(u.id || uid('CUS')),
    name: String(u.name || 'ລູກຄ້າ'),
    phone: String(u.phone || ''),
    pass: String(u.pass || ''),
    avatar: String(u.avatar || '🐣'),
    createdAt: u.createdAt || new Date().toISOString()
  };
}
async function bbV64UpsertCustomer(user) {
  const client = getCloudClient();
  const u = bbV64PlainUser(user);
  if (!client || !u || !u.phone) return false;
  try {
    const { error } = await client.from(BB_CUSTOMERS_TABLE).upsert({
      id: u.id,
      phone: u.phone,
      name: u.name,
      pass: u.pass,
      avatar: u.avatar,
      data: u,
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('v64 customer table save failed:', err);
    return false;
  }
}
async function bbV64FetchCustomers() {
  const client = getCloudClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from(BB_CUSTOMERS_TABLE).select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(row => bbV64PlainUser({ ...(row.data || {}), id: row.id, phone: row.phone, name: row.name, pass: row.pass, avatar: row.avatar, createdAt: row.created_at || (row.data || {}).createdAt })).filter(Boolean);
  } catch (err) {
    console.warn('v64 customer table load failed:', err);
    return [];
  }
}
async function bbV64SyncCustomersFromTable() {
  const remoteCustomers = await bbV64FetchCustomers();
  if (!remoteCustomers.length) return false;
  const merged = bbMergeByIdentity(users(), remoteCustomers, 'users');
  localStorage.setItem(DB.users, JSON.stringify(merged));
  await cloudSaveNow(DB.users, merged);
  return true;
}
const bbV64OriginalCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const ok = await bbV64OriginalCloudLoadAll();
  await bbV64SyncCustomersFromTable();
  return ok;
};
const bbV64OriginalRegisterCustomer = bbAuthRegisterCustomer;
bbAuthRegisterCustomer = async function() {
  if (getCloudClient()) await bbV64SyncCustomersFromTable();
  const phoneBefore = normPhone($('#bb-auth-id') ? $('#bb-auth-id').value : '');
  const result = await bbV64OriginalRegisterCustomer();
  const u = users().find(x => x.phone === phoneBefore) || currentCustomer();
  if (u) {
    await bbV64UpsertCustomer(u);
    await cloudSaveNow(DB.users, users());
  }
  return result;
};
const bbV64OriginalSaveUsers = saveUsers;
saveUsers = function(list) {
  bbV64OriginalSaveUsers(list);
  if (!cloudPulling) (Array.isArray(list) ? list : []).forEach(u => bbV64UpsertCustomer(u));
};
const bbV64OriginalAdminCustomers = adminCustomers;
adminCustomers = async function() {
  $('#adminContent').innerHTML = '<div class="note">☁️ ກຳລັງດຶງລາຍຊື່ລູກຄ້າ...</div>';
  if (getCloudClient()) await bbV64SyncCustomersFromTable();
  return bbV64OriginalAdminCustomers();
};
Object.assign(window, { BB_V64_VERSION, bbV64SyncCustomersFromTable, bbV64FetchCustomers });

/* v65 persistent customer registry + delete fix
   Fixes: customers disappear after browser restart/admin relogin, and delete button not working.
   Customers are saved in BOTH bb_state registry and bb_customers table when available. */
const BB_V65_VERSION = 'v65 persistent customer registry and delete fix';
DB.customerRegistry = 'BB4_customerRegistry';
DB.deletedCustomers = 'BB4_deletedCustomers';
if (!CLOUD_KEYS.includes(DB.customerRegistry)) CLOUD_KEYS.push(DB.customerRegistry);
if (!CLOUD_KEYS.includes(DB.deletedCustomers)) CLOUD_KEYS.push(DB.deletedCustomers);

function bbV65DeletedCustomers() { return load(DB.deletedCustomers, { ids: [], phones: [] }); }
function bbV65SaveDeletedCustomers(v) { save(DB.deletedCustomers, { ids: Array.from(new Set(v.ids || [])), phones: Array.from(new Set(v.phones || [])) }); }
function bbV65IsDeletedCustomer(u) {
  const d = bbV65DeletedCustomers();
  return !!u && ((u.id && (d.ids || []).includes(u.id)) || (u.phone && (d.phones || []).includes(u.phone)));
}
function bbV65Registry() { return load(DB.customerRegistry, []); }
function bbV65SaveRegistry(list) { save(DB.customerRegistry, (Array.isArray(list) ? list : []).filter(u => u && u.phone && !bbV65IsDeletedCustomer(u))); }
function bbV65MergeCustomers(...lists) {
  const map = new Map();
  lists.flat().filter(Boolean).forEach(raw => {
    const u = bbV64PlainUser ? bbV64PlainUser(raw) : raw;
    if (!u || !u.phone || bbV65IsDeletedCustomer(u)) return;
    const key = `phone:${u.phone}`;
    const old = map.get(key) || {};
    map.set(key, { ...old, ...u, id: old.id || u.id || uid('CUS') });
  });
  return Array.from(map.values()).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
async function bbV65FetchRegistryState() {
  try {
    const remote = await bbV63FetchCloudKey(DB.customerRegistry);
    return Array.isArray(remote) ? remote : [];
  } catch (err) {
    console.warn('v65 registry state load failed', err);
    return [];
  }
}
async function bbV65SaveAllCustomers(list) {
  const merged = bbV65MergeCustomers(bbV65Registry(), users(), list || []);
  localStorage.setItem(DB.users, JSON.stringify(merged));
  bbV65SaveRegistry(merged);
  if (getCloudClient()) {
    await cloudSaveNow(DB.customerRegistry, merged);
    await cloudSaveNow(DB.users, merged);
    for (const u of merged) await bbV64UpsertCustomer(u);
  }
  return merged;
}
async function bbV65SyncCustomersPersistent() {
  const tableCustomers = await bbV64FetchCustomers();
  const stateRegistry = await bbV65FetchRegistryState();
  const merged = bbV65MergeCustomers(users(), bbV65Registry(), tableCustomers, stateRegistry);
  localStorage.setItem(DB.users, JSON.stringify(merged));
  bbV65SaveRegistry(merged);
  if (getCloudClient()) {
    await cloudSaveNow(DB.customerRegistry, merged);
    await cloudSaveNow(DB.users, merged);
  }
  return merged;
}

// Override saveUsers again: normal save should keep customers persistent, but exact delete uses bbV65DeleteCustomer.
const bbV65OriginalSaveUsers = saveUsers;
saveUsers = function(list) {
  const merged = bbV65MergeCustomers(list || []);
  localStorage.setItem(DB.users, JSON.stringify(merged));
  bbV65SaveRegistry(merged);
  if (!cloudPulling) {
    cloudSave(DB.customerRegistry, merged);
    cloudSave(DB.users, merged);
    merged.forEach(u => bbV64UpsertCustomer(u));
  }
};

const bbV65OriginalRegisterCustomer = bbAuthRegisterCustomer;
bbAuthRegisterCustomer = async function() {
  if (getCloudClient()) await bbV65SyncCustomersPersistent();
  const phoneBefore = normPhone($('#bb-auth-id') ? $('#bb-auth-id').value : '');
  const result = await bbV65OriginalRegisterCustomer();
  const u = users().find(x => x.phone === phoneBefore) || currentCustomer();
  if (u) await bbV65SaveAllCustomers([u]);
  return result;
};

const bbV65OriginalCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const ok = await bbV65OriginalCloudLoadAll();
  await bbV65SyncCustomersPersistent();
  return ok;
};

async function bbV65DeleteCustomer(id) {
  const u = users().find(x => x.id === id);
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  if (!confirm(`ລົບລູກຄ້າ ${u.name || u.phone}?`)) return;
  const d = bbV65DeletedCustomers();
  if (u.id) d.ids = [...(d.ids || []), u.id];
  if (u.phone) d.phones = [...(d.phones || []), u.phone];
  bbV65SaveDeletedCustomers(d);
  const next = users().filter(x => x.id !== u.id && x.phone !== u.phone);
  localStorage.setItem(DB.users, JSON.stringify(next));
  bbV65SaveRegistry(next);
  if (getCloudClient()) {
    await cloudSaveNow(DB.deletedCustomers, bbV65DeletedCustomers());
    await cloudSaveNow(DB.customerRegistry, next);
    await cloudSaveNow(DB.users, next);
    try { await getCloudClient().from(BB_CUSTOMERS_TABLE).delete().eq('phone', u.phone); } catch (err) { console.warn('v65 customer table delete failed', err); }
  }
  toast('ລົບລູກຄ້າແລ້ວ');
  adminCustomers();
};
deleteCustomer = bbV65DeleteCustomer;

const bbV65OriginalAdminCustomers = adminCustomers;
adminCustomers = async function() {
  $('#adminContent').innerHTML = '<div class="note">☁️ ກຳລັງດຶງລາຍຊື່ລູກຄ້າ...</div>';
  if (getCloudClient()) await bbV65SyncCustomersPersistent();
  return bbV65OriginalAdminCustomers();
};

// Auto-heal on startup: if admin opens later, customers are loaded back from Supabase registry/table.
setTimeout(() => { if (getCloudClient()) bbV65SyncCustomersPersistent().then(() => { if (state.page === 'admin' && state.adminTab === 'customers') adminCustomers(); }); }, 1500);
Object.assign(window, { BB_V65_VERSION, bbV65SyncCustomersPersistent, bbV65DeleteCustomer, bbV65SaveAllCustomers });

/* v66 robust login/register + product editor save fix
   Fixes:
   - Auth fields no longer clear while typing or after failed login/register.
   - Customer registration/login reads inputs before any cloud sync, so mobile refresh/sync cannot wipe the form.
   - Product save works for shoes/sizes and shows clear validation/error messages.
   - Product images are compressed smaller before saving to avoid browser storage/quota errors. */
const BB_V66_VERSION = 'v66 robust auth and product save fix';
let bbV66AuthSwitchLastRole = null;
let bbV66AuthBusy = false;
let bbV66ProductBusy = false;

function bbV66SetBusy(button, busy, textWhenBusy) {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.textContent || '';
    button.disabled = true;
    button.textContent = textWhenBusy || 'ກຳລັງບັນທຶກ...';
  } else {
    button.disabled = false;
    if (button.dataset.oldText) button.textContent = button.dataset.oldText;
  }
}

function bbV66KeepAuthValues() {
  return {
    name: $('#bb-auth-name')?.value || '',
    id: $('#bb-auth-id')?.value || '',
    pass: $('#bb-auth-pass')?.value || ''
  };
}
function bbV66RestoreAuthValues(v) {
  if (!v) return;
  const name = $('#bb-auth-name');
  const id = $('#bb-auth-id');
  const pass = $('#bb-auth-pass');
  if (name) name.value = v.name || '';
  if (id) id.value = v.id || '';
  if (pass) pass.value = v.pass || '';
}

const bbV66BaseAuthSwitch = bbAuthSwitch;
bbAuthSwitch = function(role) {
  const sameRole = bbV66AuthSwitchLastRole === role;
  const old = bbV66KeepAuthValues();
  bbV66BaseAuthSwitch(role);
  bbV66AuthSwitchLastRole = role;
  if (sameRole) bbV66RestoreAuthValues(old);
};

const bbV66BaseUpdateAuthGate = updateAuthGate;
updateAuthGate = function() {
  const role = currentRole();
  const gate = $('#bb-auth-gate');
  if (!gate) return bbV66BaseUpdateAuthGate();
  gate.classList.toggle('hidden', !!role);
  document.body.classList.toggle('auth-open', !role);
  if (!role) {
    const active = state.authRole || 'customer';
    const alreadyReady = bbV66AuthSwitchLastRole === active && $('#bb-auth-id') && $('#bb-auth-pass');
    if (!alreadyReady) bbAuthSwitch(active);
    else updateAuthHelp();
  }
};

function bbV66AuthSnapshot() {
  return {
    name: ($('#bb-auth-name')?.value || '').trim(),
    idRaw: ($('#bb-auth-id')?.value || '').trim(),
    phone: normPhone($('#bb-auth-id')?.value || ''),
    pass: ($('#bb-auth-pass')?.value || '').trim(),
    role: state.authRole || 'customer'
  };
}

bbAuthRegisterCustomer = async function() {
  if (bbV66AuthBusy) return;
  const snap = bbV66AuthSnapshot();
  if (!snap.name) return toast('ກະລຸນາໃສ່ຊື່');
  if (!validPhoneTail(snap.phone)) return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກ');
  if (snap.pass.length < 4) return toast('ລະຫັດຕ້ອງຢ່າງນ້ອຍ 4 ຕົວ');
  const btn = $('#bb-register-btn');
  bbV66AuthBusy = true;
  bbV66SetBusy(btn, true, 'ກຳລັງສ້າງ...');
  try {
    if (getCloudClient()) await bbV65SyncCustomersPersistent();
    let list = users();
    if (list.some(u => String(u.phone) === snap.phone)) {
      play('error');
      bbV66RestoreAuthValues({ name: snap.name, id: snap.idRaw, pass: snap.pass });
      return toast('ເບີນີ້ມີບັນຊີແລ້ວ');
    }
    const user = {
      id: uid('CUS'),
      name: snap.name,
      phone: snap.phone,
      pass: snap.pass,
      avatar: avatars[Math.floor(Math.random() * avatars.length)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list = bbV65MergeCustomers ? bbV65MergeCustomers(list, [user]) : [...list, user];
    localStorage.setItem(DB.users, JSON.stringify(list));
    if (typeof bbV65SaveAllCustomers === 'function') await bbV65SaveAllCustomers(list);
    else saveUsers(list);
    setSession('customer', user.id);
    play('success');
    toast('ສ້າງບັນຊີສຳເລັດ');
    state.page = 'home';
    renderAll();
  } catch (err) {
    console.warn('v66 register failed', err);
    play('error');
    bbV66RestoreAuthValues({ name: snap.name, id: snap.idRaw, pass: snap.pass });
    toast('ສ້າງບັນຊີບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
  } finally {
    bbV66AuthBusy = false;
    bbV66SetBusy(btn, false);
  }
};

bbAuthLogin = async function() {
  if (bbV66AuthBusy) return;
  const snap = bbV66AuthSnapshot();
  if (!snap.idRaw || !snap.pass) return toast('ກະລຸນາໃສ່ ID/ເບີ ແລະ ລະຫັດ');
  const btn = $('#bb-login-btn');
  bbV66AuthBusy = true;
  bbV66SetBusy(btn, true, 'ກຳລັງເຂົ້າ...');
  try {
    if (snap.role === 'customer') {
      if (!validPhoneTail(snap.phone)) {
        bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກຫຼັງ +856 20');
      }
      if (getCloudClient()) await bbV65SyncCustomersPersistent();
      const user = users().find(u => String(u.phone) === snap.phone);
      if (!user) {
        play('error');
        bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('ເບີນີ້ຍັງບໍ່ທັນລົງທະບຽນ');
      }
      if (String(user.pass) !== snap.pass) {
        play('error');
        bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('ເບີ ຫຼື ລະຫັດຂອງທ່ານບໍ່ຖືກຕ້ອງ');
      }
      setSession('customer', user.id);
      state.page = 'home';
    } else if (snap.role === 'agent') {
      if (getCloudClient()) await cloudLoadAll();
      enforceAgentRules();
      const inactiveAgent = agents().find(a => a.id === snap.idRaw && String(a.pass) === snap.pass && a.active === false);
      if (inactiveAgent) {
        play('error');
        bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast(inactiveAgent.blockReason ? `Agent ID ຖືກປິດ: ${inactiveAgent.blockReason}` : 'Agent ID ຖືກປິດ ກະລຸນາຕິດຕໍ່ Admin');
      }
      const agent = agents().find(a => a.id === snap.idRaw && String(a.pass) === snap.pass && a.active !== false);
      if (!agent) {
        play('error');
        bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('Agent ID ຫຼື Password ບໍ່ຖືກ');
      }
      setSession('agent', agent.id);
      state.page = 'agent';
    } else {
      const cfg = settings();
      if (snap.idRaw !== cfg.adminId || snap.pass !== cfg.adminPass) {
        play('error');
        bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('Admin ID ຫຼື Password ບໍ່ຖືກ');
      }
      setSession('admin');
      state.page = 'admin';
    }
    play('success');
    toast('ເຂົ້າລະບົບສຳເລັດ');
    renderAll();
  } catch (err) {
    console.warn('v66 login failed', err);
    play('error');
    bbV66RestoreAuthValues({ name: snap.name, id: snap.idRaw, pass: snap.pass });
    toast('ເຂົ້າລະບົບບໍ່ສຳເລັດ ກະລຸນາກວດເນັດແລ້ວລອງໃໝ່');
  } finally {
    bbV66AuthBusy = false;
    bbV66SetBusy(btn, false);
  }
};

function bbV66CompressDataUrl(dataUrl, maxSize = 720, quality = 0.64) {
  return new Promise(resolve => {
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return resolve(dataUrl || '');
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
async function bbV66CleanImagesForProduct(images, maxSize = 720, quality = 0.64) {
  const clean = [];
  const srcSeen = new Set();
  for (const raw of (Array.isArray(images) ? images : [])) {
    if (!raw || !raw.src) continue;
    const label = String(raw.label || `ຮູບ ${clean.length + 1}`).slice(0, 40);
    const src = await bbV66CompressDataUrl(raw.src, maxSize, quality);
    if (!src || srcSeen.has(src)) continue;
    srcSeen.add(src);
    clean.push({ label, src });
  }
  return clean;
}

readImageFile = function(file, maxSize = 720, quality = 0.64) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file read failed'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (!String(file.type || '').startsWith('image/')) return resolve(dataUrl);
      bbV66CompressDataUrl(dataUrl, maxSize, quality).then(resolve).catch(() => resolve(dataUrl));
    };
    reader.readAsDataURL(file);
  });
};

parseVariants = function(text, type, imageList = []) {
  const raw = String(text || '').trim();
  if (!raw) return [{ name: 'ມາດຕະຖານ', stock: type === 'preorder' ? 9999 : 1, image: '' }];
  const pieces = raw.includes('\n') ? raw.split('\n') : raw.split(/[,,，]/);
  const list = [];
  for (const item of pieces) {
    const line = String(item || '').trim();
    if (!line) continue;
    let name = line;
    let stockText = '';
    if (line.includes('|')) {
      const parts = line.split('|');
      name = (parts[0] || '').trim();
      stockText = (parts[1] || '').trim();
    } else if (/\s+x\s+/i.test(line)) {
      const parts = line.split(/\s+x\s+/i);
      name = (parts[0] || '').trim();
      stockText = (parts[1] || '').trim();
    }
    if (!name) name = 'ມາດຕະຖານ';
    const stock = type === 'preorder' ? 9999 : Math.max(0, Number(digits(stockText || '1')) || 1);
    list.push({ name, stock, image: '' });
  }
  return list.length ? list : [{ name: 'ມາດຕະຖານ', stock: type === 'preorder' ? 9999 : 1, image: '' }];
};

async function bbV66SaveProductsSafely(list) {
  try {
    saveProducts(list);
    if (getCloudClient()) await cloudSaveNow(DB.products, list);
    return true;
  } catch (err) {
    console.warn('v66 product save first attempt failed', err);
    const shrunk = [];
    for (const p of list) {
      const imgs = await bbV66CleanImagesForProduct(productImages(p), 520, 0.54);
      shrunk.push({ ...p, images: imgs, image: imgs[0]?.src || '', updatedAt: new Date().toISOString() });
    }
    try {
      localStorage.setItem(DB.products, JSON.stringify(shrunk));
      if (getCloudClient()) await cloudSaveNow(DB.products, shrunk);
      toast('ບັນທຶກໄດ້ແລ້ວ (ລະບົບຫຍໍ້ຮູບໃຫ້ເພື່ອບໍ່ໃຫ້ໄຟລ໌ໃຫຍ່ເກີນ)');
      return true;
    } catch (err2) {
      console.error('v66 product save failed after shrink', err2);
      play('error');
      toast('ບັນທຶກສິນຄ້າບໍ່ໄດ້: ຮູບອາດໃຫຍ່ເກີນ ຫຼື storage ເຕັມ. ລອງລົດຈຳນວນຮູບແລ້ວ save ໃໝ່');
      return false;
    }
  }
}

saveProductFromEditor = async function(id = null) {
  if (bbV66ProductBusy) return;
  const btn = $('#saveProductBtn');
  bbV66ProductBusy = true;
  bbV66SetBusy(btn, true, 'ກຳລັງບັນທຶກ...');
  try {
    const type = $('#prodType')?.value || 'ready';
    const name = ($('#prodName')?.value || '').trim();
    if (!name) return toast('ໃສ່ຊື່ສິນຄ້າກ່ອນ');
    const price = moneyValue(digits($('#prodPrice')?.value || '') || 0);
    if (!price || price <= 0) return toast('ກະລຸນາໃສ່ລາຄາລູກຄ້າ');
    const category = ($('#prodCategory')?.value || '').trim() || 'ອື່ນໆ';
    const agentPrice = moneyValue(digits($('#prodAgentPrice')?.value || '') || price);
    if (agentPrice <= 0) return toast('ລາຄາຕົວແທນບໍ່ຖືກຕ້ອງ');
    if ($('#prodClearImage')?.checked) state.editProductImages = [];
    const images = await bbV66CleanImagesForProduct(state.editProductImages || [], 720, 0.64);
    const variants = parseVariants($('#prodVariants')?.value || '', type, images).filter(v => v && v.name);
    if (!variants.length) return toast('ກະລຸນາໃສ່ໄຊສ໌/stock ຢ່າງນ້ອຍ 1 ລາຍການ');
    const list = products().slice();
    let p = id ? list.find(x => x.id === id) : null;
    if (!p) { p = { id: uid('P'), createdAt: new Date().toISOString(), reviews: [] }; list.unshift(p); }
    Object.assign(p, {
      name,
      category,
      gender: $('#prodGender')?.value || 'unisex',
      type,
      price,
      agentPrice,
      emoji: ($('#prodEmoji')?.value || '').trim() || '🪷',
      desc: ($('#prodDesc')?.value || '').trim(),
      variants,
      image: images[0]?.src || '',
      images,
      active: !!$('#prodActive')?.checked,
      updatedAt: new Date().toISOString()
    });
    const ok = await bbV66SaveProductsSafely(list);
    if (!ok) return;
    if (!categories().includes(category)) saveCategories([...categories(), category]);
    closeModal();
    play('success');
    toast('ບັນທຶກສິນຄ້າແລ້ວ');
    renderAll();
  } catch (err) {
    console.error('v66 product editor failed', err);
    play('error');
    toast('ບັນທຶກສິນຄ້າບໍ່ໄດ້ ກະລຸນາກວດຂໍ້ມູນແລ້ວລອງໃໝ່');
  } finally {
    bbV66ProductBusy = false;
    bbV66SetBusy(btn, false);
  }
};

const bbV66BaseBindCoreEvents = bindCoreEvents;
bindCoreEvents = function() {
  bbV66BaseBindCoreEvents();
  const reg = $('#bb-register-btn');
  const log = $('#bb-login-btn');
  if (reg) reg.onclick = bbAuthRegisterCustomer;
  if (log) log.onclick = bbAuthLogin;
};

Object.assign(window, { BB_V66_VERSION, bbAuthLogin, bbAuthRegisterCustomer, saveProductFromEditor, parseVariants });

/* v68 robust delete persistence fix
   Fixes: product/customer delete now persists after refresh and cannot come back from Supabase cache.
   Uses deleted tombstone lists plus immediate Supabase save, not delayed debounce. */
const BB_V68_VERSION = 'v68 robust product customer delete';
DB.deletedProducts = 'BB4_deletedProducts';
if (!CLOUD_KEYS.includes(DB.deletedProducts)) CLOUD_KEYS.push(DB.deletedProducts);

function bbV68ReadDeleted(key) {
  const v = load(key, { ids: [], phones: [], names: [] });
  return {
    ids: Array.from(new Set(v.ids || [])),
    phones: Array.from(new Set(v.phones || [])),
    names: Array.from(new Set(v.names || []))
  };
}
function bbV68SaveDeleted(key, value) {
  const clean = {
    ids: Array.from(new Set(value.ids || [])).filter(Boolean),
    phones: Array.from(new Set(value.phones || [])).filter(Boolean),
    names: Array.from(new Set(value.names || [])).filter(Boolean)
  };
  localStorage.setItem(key, JSON.stringify(clean));
  if (getCloudClient()) cloudSaveNow(key, clean);
  else cloudSave(key, clean);
  return clean;
}
function bbV68DeletedProducts() { return bbV68ReadDeleted(DB.deletedProducts); }
function bbV68IsDeletedProduct(p) {
  const d = bbV68DeletedProducts();
  return !!p && ((p.id && d.ids.includes(p.id)) || (p.name && d.names.includes(String(p.name))));
}
function bbV68IsDeletedCustomer(u) {
  const d = typeof bbV65DeletedCustomers === 'function' ? bbV65DeletedCustomers() : bbV68ReadDeleted(DB.deletedCustomers);
  return !!u && ((u.id && (d.ids || []).includes(u.id)) || (u.phone && (d.phones || []).includes(u.phone)));
}
function bbV68FilterProducts(list) {
  return (Array.isArray(list) ? list : []).filter(p => p && !bbV68IsDeletedProduct(p));
}
function bbV68FilterUsers(list) {
  return (Array.isArray(list) ? list : []).filter(u => u && !bbV68IsDeletedCustomer(u));
}

const bbV68BaseProducts = products;
products = function() { return bbV68FilterProducts(bbV68BaseProducts()); };

const bbV68BaseUsers = users;
users = function() { return bbV68FilterUsers(bbV68BaseUsers()); };

saveProducts = function(list) {
  const clean = bbV68FilterProducts(list || []);
  localStorage.setItem(DB.products, JSON.stringify(clean));
  if (!cloudPulling) cloudSave(DB.products, clean);
};

const bbV68BaseSaveUsers = saveUsers;
saveUsers = function(list) {
  const clean = bbV68FilterUsers(list || []);
  localStorage.setItem(DB.users, JSON.stringify(clean));
  if (typeof bbV65SaveRegistry === 'function') bbV65SaveRegistry(clean);
  if (!cloudPulling) {
    cloudSave(DB.users, clean);
    if (DB.customerRegistry) cloudSave(DB.customerRegistry, clean);
    if (typeof bbV64UpsertCustomer === 'function') clean.forEach(u => bbV64UpsertCustomer(u));
  }
};

async function bbV68PersistProductsNow(list) {
  const clean = bbV68FilterProducts(list || []);
  localStorage.setItem(DB.products, JSON.stringify(clean));
  if (getCloudClient()) await cloudSaveNow(DB.products, clean);
  return clean;
}
async function bbV68PersistUsersNow(list) {
  const clean = bbV68FilterUsers(list || []);
  localStorage.setItem(DB.users, JSON.stringify(clean));
  if (typeof bbV65SaveRegistry === 'function') bbV65SaveRegistry(clean);
  if (getCloudClient()) {
    await cloudSaveNow(DB.users, clean);
    if (DB.customerRegistry) await cloudSaveNow(DB.customerRegistry, clean);
  }
  return clean;
}

async function bbV68ApplyDeleteFiltersToLocalAndCloud() {
  const cleanProducts = bbV68FilterProducts(load(DB.products, []));
  localStorage.setItem(DB.products, JSON.stringify(cleanProducts));
  const cleanUsers = bbV68FilterUsers(load(DB.users, []));
  localStorage.setItem(DB.users, JSON.stringify(cleanUsers));
  if (DB.customerRegistry) {
    const cleanRegistry = bbV68FilterUsers(load(DB.customerRegistry, []));
    localStorage.setItem(DB.customerRegistry, JSON.stringify(cleanRegistry));
  }
  if (getCloudClient()) {
    await cloudSaveNow(DB.products, cleanProducts);
    await cloudSaveNow(DB.users, cleanUsers);
    if (DB.customerRegistry) await cloudSaveNow(DB.customerRegistry, bbV68FilterUsers(load(DB.customerRegistry, [])));
  }
}

const bbV68BaseCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const ok = await bbV68BaseCloudLoadAll();
  await bbV68ApplyDeleteFiltersToLocalAndCloud();
  return ok;
};

async function bbV68DeleteProduct(id) {
  const all = load(DB.products, []);
  const p = all.find(x => String(x.id) === String(id));
  if (!p) return toast('ບໍ່ພົບສິນຄ້າ');
  if (!confirm(`ລົບສິນຄ້າ ${p.name || ''} ອອກຖາວອນ?`)) return;
  const d = bbV68DeletedProducts();
  if (p.id) d.ids.push(p.id);
  if (p.name) d.names.push(String(p.name));
  bbV68SaveDeleted(DB.deletedProducts, d);
  const next = all.filter(x => String(x.id) !== String(p.id) && String(x.name || '') !== String(p.name || ''));
  await bbV68PersistProductsNow(next);
  try {
    save(DB.cart, cart().filter(item => String(item.productId) !== String(p.id)));
    save(DB.wishlist, wishlist().filter(pid => String(pid) !== String(p.id)));
  } catch (err) {}
  if (state.productDetail && String(state.productDetail.id) === String(p.id)) closeProductDetail();
  play('delete');
  toast('ລົບສິນຄ້າແລ້ວ');
  renderAll();
};
deleteProduct = bbV68DeleteProduct;

async function bbV68DeleteCustomer(id) {
  const all = load(DB.users, []);
  const u = all.find(x => String(x.id) === String(id));
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  if (!confirm(`ລົບບັນຊີລູກຄ້າ ${u.name || u.phone || ''} ອອກຖາວອນ?`)) return;
  const d = typeof bbV65DeletedCustomers === 'function' ? bbV65DeletedCustomers() : bbV68ReadDeleted(DB.deletedCustomers);
  if (u.id) d.ids = [...(d.ids || []), u.id];
  if (u.phone) d.phones = [...(d.phones || []), u.phone];
  if (typeof bbV65SaveDeletedCustomers === 'function') bbV65SaveDeletedCustomers(d);
  else bbV68SaveDeleted(DB.deletedCustomers, d);
  const next = all.filter(x => String(x.id) !== String(u.id) && String(x.phone || '') !== String(u.phone || ''));
  await bbV68PersistUsersNow(next);
  if (getCloudClient()) {
    await cloudSaveNow(DB.deletedCustomers, d);
    try { await getCloudClient().from(BB_CUSTOMERS_TABLE).delete().eq('phone', u.phone); } catch (err) { console.warn('v68 bb_customers delete failed', err); }
  }
  if (currentCustomer()?.id === u.id || currentCustomer()?.phone === u.phone) {
    removeKey(DB.session);
  }
  play('delete');
  toast('ລົບບັນຊີລູກຄ້າແລ້ວ');
  if ($('#modalLayer')?.classList.contains('show')) closeModal();
  if (state.page === 'admin' && state.adminTab === 'customers') adminCustomers();
  else renderAll();
};
deleteCustomer = bbV68DeleteCustomer;

const bbV68BaseAdminProducts = adminProducts;
adminProducts = function() {
  bbV68ApplyDeleteFiltersToLocalAndCloud();
  return bbV68BaseAdminProducts();
};

const bbV68BaseAdminCustomers = adminCustomers;
adminCustomers = async function() {
  $('#adminContent').innerHTML = '<div class="note">☁️ ກຳລັງດຶງລາຍຊື່ລູກຄ້າ...</div>';
  if (getCloudClient() && typeof bbV65SyncCustomersPersistent === 'function') await bbV65SyncCustomersPersistent();
  await bbV68ApplyDeleteFiltersToLocalAndCloud();
  return bbV68BaseAdminCustomers();
};

setTimeout(() => { bbV68ApplyDeleteFiltersToLocalAndCloud().then(() => renderAll()).catch(() => {}); }, 1800);
Object.assign(window, { BB_V68_VERSION, bbV68DeleteProduct, bbV68DeleteCustomer });

/* v69 register/login persistence repair
   Fixes: registration says success but next login says phone is not registered.
   Root cause covered: deleted-customer tombstones could still contain the same phone, and cloud sync could overwrite the new user before it was persisted. */
const BB_V69_VERSION = 'v69 robust customer register login persistence fix';

function bbV69CleanPhone(value) { return normPhone(value || ''); }
function bbV69SamePhone(a, b) { return String(bbV69CleanPhone(a)) === String(bbV69CleanPhone(b)); }

function bbV69ClearDeletedCustomer(phone, id = '') {
  const cleanPhone = bbV69CleanPhone(phone);
  try {
    const d = typeof bbV65DeletedCustomers === 'function' ? bbV65DeletedCustomers() : load(DB.deletedCustomers || 'BB4_deletedCustomers', { ids: [], phones: [] });
    const next = {
      ids: (d.ids || []).filter(x => String(x) !== String(id || '')),
      phones: (d.phones || []).filter(x => !bbV69SamePhone(x, cleanPhone))
    };
    if (typeof bbV65SaveDeletedCustomers === 'function') bbV65SaveDeletedCustomers(next);
    else save(DB.deletedCustomers || 'BB4_deletedCustomers', next);
    if (getCloudClient()) cloudSaveNow(DB.deletedCustomers, next);
  } catch (err) { console.warn('v69 clear deleted customer failed', err); }
}

function bbV69PlainUser(u) {
  if (!u) return null;
  const phone = bbV69CleanPhone(u.phone || u.idRaw || '');
  if (!validPhoneTail(phone)) return null;
  return {
    id: String(u.id || uid('CUS')),
    name: String(u.name || 'ລູກຄ້າ'),
    phone,
    pass: String(u.pass || ''),
    avatar: String(u.avatar || avatars[Math.floor(Math.random() * avatars.length)] || '🐣'),
    createdAt: u.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function bbV69MergeUserIntoLocal(user) {
  const u = bbV69PlainUser(user);
  if (!u) return users();
  bbV69ClearDeletedCustomer(u.phone, u.id);
  const map = new Map();
  [...users(), ...(DB.customerRegistry ? load(DB.customerRegistry, []) : []), u].forEach(item => {
    const pu = bbV69PlainUser(item);
    if (!pu) return;
    map.set(`phone:${pu.phone}`, { ...(map.get(`phone:${pu.phone}`) || {}), ...pu });
  });
  const merged = Array.from(map.values());
  localStorage.setItem(DB.users, JSON.stringify(merged));
  if (DB.customerRegistry) localStorage.setItem(DB.customerRegistry, JSON.stringify(merged));
  return merged;
}

async function bbV69PersistCustomer(user) {
  const u = bbV69PlainUser(user);
  if (!u) return false;
  bbV69ClearDeletedCustomer(u.phone, u.id);
  const merged = bbV69MergeUserIntoLocal(u);
  try {
    if (getCloudClient()) {
      await cloudSaveNow(DB.users, merged);
      if (DB.customerRegistry) await cloudSaveNow(DB.customerRegistry, merged);
      if (typeof bbV64UpsertCustomer === 'function') await bbV64UpsertCustomer(u);
      else {
        await getCloudClient().from(BB_CUSTOMERS_TABLE).upsert({
          id: u.id,
          phone: u.phone,
          name: u.name,
          pass: u.pass,
          avatar: u.avatar,
          data: u,
          updated_at: new Date().toISOString()
        }, { onConflict: 'phone' });
      }
    }
  } catch (err) {
    console.warn('v69 customer cloud persist failed', err);
  }
  return true;
}

async function bbV69FindCustomerByPhone(phone) {
  const cleanPhone = bbV69CleanPhone(phone);
  let found = users().find(u => bbV69SamePhone(u.phone, cleanPhone));
  if (found) return bbV69PlainUser(found);

  const reg = DB.customerRegistry ? load(DB.customerRegistry, []) : [];
  found = reg.find(u => bbV69SamePhone(u.phone, cleanPhone));
  if (found) {
    await bbV69PersistCustomer(found);
    return bbV69PlainUser(found);
  }

  const client = getCloudClient();
  if (client) {
    try {
      const { data, error } = await client.from(BB_CUSTOMERS_TABLE).select('*').eq('phone', cleanPhone).maybeSingle();
      if (!error && data) {
        const u = bbV69PlainUser({ ...(data.data || {}), id: data.id, phone: data.phone, name: data.name, pass: data.pass, avatar: data.avatar, createdAt: data.created_at });
        if (u) {
          await bbV69PersistCustomer(u);
          return u;
        }
      }
    } catch (err) { console.warn('v69 direct customer lookup failed', err); }

    try {
      const remoteUsers = await bbV63FetchCloudKey(DB.users);
      const remoteRegistry = DB.customerRegistry ? await bbV63FetchCloudKey(DB.customerRegistry) : [];
      found = [...(Array.isArray(remoteUsers) ? remoteUsers : []), ...(Array.isArray(remoteRegistry) ? remoteRegistry : [])].find(u => bbV69SamePhone(u.phone, cleanPhone));
      if (found) {
        await bbV69PersistCustomer(found);
        return bbV69PlainUser(found);
      }
    } catch (err) { console.warn('v69 bb_state customer lookup failed', err); }
  }
  return null;
}

bbAuthRegisterCustomer = async function() {
  if (bbV66AuthBusy) return;
  const snap = typeof bbV66AuthSnapshot === 'function' ? bbV66AuthSnapshot() : {
    name: ($('#bb-auth-name')?.value || '').trim(),
    idRaw: ($('#bb-auth-id')?.value || '').trim(),
    phone: bbV69CleanPhone($('#bb-auth-id')?.value || ''),
    pass: ($('#bb-auth-pass')?.value || '').trim(),
    role: 'customer'
  };
  if (!snap.name) return toast('ກະລຸນາໃສ່ຊື່');
  if (!validPhoneTail(snap.phone)) return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກ');
  if (snap.pass.length < 4) return toast('ລະຫັດຕ້ອງຢ່າງນ້ອຍ 4 ຕົວ');
  const btn = $('#bb-register-btn');
  bbV66AuthBusy = true;
  bbV66SetBusy(btn, true, 'ກຳລັງສ້າງ...');
  try {
    const existing = await bbV69FindCustomerByPhone(snap.phone);
    if (existing) {
      play('error');
      if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ name: snap.name, id: snap.idRaw, pass: snap.pass });
      return toast('ເບີນີ້ມີບັນຊີແລ້ວ');
    }
    const user = bbV69PlainUser({ name: snap.name, phone: snap.phone, pass: snap.pass });
    await bbV69PersistCustomer(user);
    setSession('customer', user.id);
    play('success');
    toast('ລົງທະບຽນສຳເລັດ');
    state.page = 'home';
    renderAll();
  } catch (err) {
    console.error('v69 register failed', err);
    play('error');
    if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ name: snap.name, id: snap.idRaw, pass: snap.pass });
    toast('ລົງທະບຽນບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
  } finally {
    bbV66AuthBusy = false;
    bbV66SetBusy(btn, false);
  }
};

bbAuthLogin = async function() {
  if (bbV66AuthBusy) return;
  const snap = typeof bbV66AuthSnapshot === 'function' ? bbV66AuthSnapshot() : {
    idRaw: ($('#bb-auth-id')?.value || '').trim(),
    phone: bbV69CleanPhone($('#bb-auth-id')?.value || ''),
    pass: ($('#bb-auth-pass')?.value || '').trim(),
    role: state.authRole || 'customer'
  };
  if (!snap.idRaw || !snap.pass) return toast('ກະລຸນາໃສ່ ID/ເບີ ແລະ ລະຫັດ');
  const btn = $('#bb-login-btn');
  bbV66AuthBusy = true;
  bbV66SetBusy(btn, true, 'ກຳລັງເຂົ້າ...');
  try {
    if (snap.role === 'customer') {
      if (!validPhoneTail(snap.phone)) {
        if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກຫຼັງ +856 20');
      }
      const user = await bbV69FindCustomerByPhone(snap.phone);
      if (!user) {
        play('error');
        if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('ເບີນີ້ຍັງບໍ່ທັນລົງທະບຽນ');
      }
      if (String(user.pass) !== String(snap.pass)) {
        play('error');
        if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('ເບີ ຫຼື ລະຫັດຂອງທ່ານບໍ່ຖືກຕ້ອງ');
      }
      await bbV69PersistCustomer(user);
      setSession('customer', user.id);
      state.page = 'home';
    } else if (snap.role === 'agent') {
      if (getCloudClient()) await cloudLoadAll();
      enforceAgentRules();
      const inactiveAgent = agents().find(a => a.id === snap.idRaw && String(a.pass) === snap.pass && a.active === false);
      if (inactiveAgent) {
        play('error');
        if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast(inactiveAgent.blockReason ? `Agent ID ຖືກປິດ: ${inactiveAgent.blockReason}` : 'Agent ID ຖືກປິດ ກະລຸນາຕິດຕໍ່ Admin');
      }
      const agent = agents().find(a => a.id === snap.idRaw && String(a.pass) === snap.pass && a.active !== false);
      if (!agent) {
        play('error');
        if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('Agent ID ຫຼື Password ບໍ່ຖືກ');
      }
      setSession('agent', agent.id);
      state.page = 'agent';
    } else {
      const cfg = settings();
      if (snap.idRaw !== cfg.adminId || snap.pass !== cfg.adminPass) {
        play('error');
        if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
        return toast('Admin ID ຫຼື Password ບໍ່ຖືກ');
      }
      setSession('admin');
      state.page = 'admin';
    }
    play('success');
    toast('ເຂົ້າລະບົບສຳເລັດ');
    renderAll();
  } catch (err) {
    console.error('v69 login failed', err);
    play('error');
    if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
    toast('ເຂົ້າລະບົບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
  } finally {
    bbV66AuthBusy = false;
    bbV66SetBusy(btn, false);
  }
};

const bbV69BaseBindCoreEvents = bindCoreEvents;
bindCoreEvents = function() {
  bbV69BaseBindCoreEvents();
  const reg = $('#bb-register-btn');
  const log = $('#bb-login-btn');
  if (reg) reg.onclick = bbAuthRegisterCustomer;
  if (log) log.onclick = bbAuthLogin;
};

Object.assign(window, { BB_V69_VERSION, bbAuthLogin, bbAuthRegisterCustomer, bbV69FindCustomerByPhone, bbV69PersistCustomer });

/* ===== V70: option/size-specific pricing and exact totals ===== */
function bbV70VariantCustomerPrice(p, v) {
  const n = moneyValue(v?.price ?? v?.customerPrice ?? v?.salePrice ?? p?.price ?? 0);
  return n > 0 ? n : moneyValue(p?.price || 0);
}
function bbV70VariantAgentPrice(p, v) {
  const base = bbV70VariantCustomerPrice(p, v);
  const n = moneyValue(v?.agentPrice ?? v?.wholesalePrice ?? p?.agentPrice ?? base);
  return n > 0 ? n : base;
}
function bbV70SelectedVariant(p) {
  const detail = state.productDetail || {};
  const size = detail.size || firstAvailableSize(p);
  return variantForSize(p, size) || variantsOf(p)[0];
}
function bbV70PriceForVariant(p, v, role = currentRole()) {
  return role === 'agent' ? bbV70VariantAgentPrice(p, v) : bbV70VariantCustomerPrice(p, v);
}
function bbV70PriceLabel(p, v) {
  const c = bbV70VariantCustomerPrice(p, v);
  const a = bbV70VariantAgentPrice(p, v);
  return `ລາຄາ: ${money(c)}${a !== c ? ` · Agent: ${money(a)}` : ''}`;
}

variantsOf = function(p) {
  const basePrice = moneyValue(p?.price || 0);
  const baseAgent = moneyValue(p?.agentPrice || basePrice);
  if (Array.isArray(p?.variants) && p.variants.length) {
    return p.variants.map(v => ({
      name: v.name || 'ມາດຕະຖານ',
      stock: Number(v.stock ?? 0),
      image: v.image || v.image_url || '',
      color: v.color || '',
      price: moneyValue(v.price ?? v.customerPrice ?? basePrice),
      agentPrice: moneyValue(v.agentPrice ?? baseAgent)
    }));
  }
  return [{name:'ມາດຕະຖານ', stock: normalizeType(p) === 'preorder' ? 9999 : Number(p?.stock ?? 0), image:'', price:basePrice, agentPrice:baseAgent}];
};

productPriceFor = function(p, variant = null) {
  const v = variant || bbV70SelectedVariant(p);
  return bbV70PriceForVariant(p, v);
};

productPriceHtml = function(p, variant = null) {
  const v = variant || bbV70SelectedVariant(p);
  const price = bbV70VariantCustomerPrice(p, v);
  const agentPrice = bbV70VariantAgentPrice(p, v);
  const sizeName = optionPartsFromName(v?.name || '').size || v?.name || '';
  if (currentRole() === 'agent') {
    return `<div class="agent-price"><div class="old">${money(price)}</div><div class="new">${money(agentPrice)} <span class="agent-tag">Agent Price</span></div><div class="muted">${esc(sizeName ? `ຕາມ option: ${sizeName} · ` : '')}ກຳໄລແນະນຳ: ${money(Math.max(0, price - agentPrice))}</div></div>`;
  }
  return `<div class="price">${money(price)}</div>${sizeName ? `<div class="muted">ລາຄາຕາມ option: ${esc(sizeName)}</div>` : ''}`;
};

variantsText = function(p) {
  return variantsOf(p).map(v => {
    const size = optionPartsFromName(v.name).size || v.name;
    const stock = Number(v.stock || 0);
    const price = bbV70VariantCustomerPrice(p, v);
    const agent = bbV70VariantAgentPrice(p, v);
    return `${size} | ${stock} | ${price} | ${agent}`;
  }).join('\n');
};

parseVariants = function(text, type, imageList = []) {
  const lines = String(text || '').split('\n').map(x => x.trim()).filter(Boolean);
  const list = lines.map(line => {
    const parts = line.split('|').map(x => x.trim());
    const name = parts[0] || 'ມາດຕະຖານ';
    const stock = type === 'preorder' ? 9999 : Math.max(0, Math.round(Number(digits(parts[1] || '0')) || 0));
    const price = moneyValue(digits(parts[2] || '') || 0);
    const agentPrice = moneyValue(digits(parts[3] || '') || 0);
    return { name, stock, image:'', price, agentPrice };
  }).filter(v => v.name);
  return list.length ? list : [{name:'ມາດຕະຖານ', stock:type === 'preorder' ? 9999 : 1, image:'', price:0, agentPrice:0}];
};

const bbV70BaseOpenProductEditor = openProductEditor;
openProductEditor = function(id = null) {
  bbV70BaseOpenProductEditor(id);
  const v = $('#prodVariants');
  if (v) {
    v.placeholder = 'ໄຊສ໌/ຄວາມຈຳ | stock | ລາຄາລູກຄ້າ | ລາຄາຕົວແທນ\nເຊັ່ນ 25cm | 5 | 85000 | 72000\n40 | 3 | 145000 | 125000\n128GB | 2 | 1990000 | 1850000';
  }
  const form = $('.admin-form', $('#modalLayer'));
  if (form && !$('#v70VariantHelp')) {
    const help = document.createElement('div');
    help.id = 'v70VariantHelp';
    help.className = 'note wide';
    help.innerHTML = '<b>ລາຄາຕາມ option:</b> ຖ້າ size/ຂະໜາດ/ຄວາມຈຳລາຄາບໍ່ຄືກັນ ໃຫ້ຂຽນ: <b>option | stock | ລາຄາລູກຄ້າ | ລາຄາຕົວແທນ</b>. ຍອດອໍເດີຈະຄິດຈາກລາຄາ option ທີ່ລູກຄ້າເລືອກ.';
    v?.insertAdjacentElement('afterend', help);
  }
};

renderProductModal = function() {
  const detail = state.productDetail;
  if (!detail) return;
  const p = products().find(x => x.id === detail.id);
  if (!p) return;
  const sizes = uniqueProductSizes(p);
  if (!detail.size || !sizes.includes(detail.size)) detail.size = firstAvailableSize(p);
  const selectedSize = detail.size;
  const selected = variantForSize(p, selectedSize);
  const type = normalizeType(p);
  const available = stockForSize(p, selectedSize);
  const qty = Math.max(1, Math.min(Number(detail.qty || 1), available || 1));
  detail.qty = qty;
  const selectedImage = detail.viewImage || primaryProductImage(p) || imageForVariant(p, selected);
  const customerPrice = bbV70VariantCustomerPrice(p, selected);
  const agentPrice = bbV70VariantAgentPrice(p, selected);
  const rolePrice = bbV70PriceForVariant(p, selected);
  const caption = `${p.name}\n${selectedSize ? `Option: ${selectedSize}\n` : ''}ລາຄາລູກຄ້າ: ${money(customerPrice)}\nລາຄາຕົວແທນ: ${money(agentPrice)}\n${p.desc || ''}\nສະຖານະ: ${typeName(type)}${type === 'preorder' ? '\nPre-order: ລໍຖ້າ 14-18 ມື້ຫຼັງ Admin ຢືນຢັນອໍເດີ' : ''}\nສອບຖາມ/ສັ່ງຊື້ທັກ Bai Boua`;
  const disabled = p.active === false || (type === 'ready' && available <= 0);
  openModal(`<div class="modal wide"><div class="modal-head"><h2>${esc(p.name)}</h2><button class="icon-btn" type="button" data-close>✕</button></div>
    <div class="product-detail">
      <div class="detail-media">
        <div class="detail-img" data-zoom-img="${esc(selectedImage)}" data-zoom-title="${esc(p.name)}">${productImageHtml(p, selectedImage)}</div>
        ${productModalThumbRail(p, selectedImage, 0)}
      </div>
      <div>
        <div class="status ${statusClass(disabled ? 'cancelled' : type === 'preorder' ? 'waiting_china' : 'paid')}">${productBadge(p)[0]}</div>
        ${productPriceHtml(p, selected)}
        <p class="muted">${genderName(p.gender || 'unisex')} · ${esc(p.category || 'ອື່ນໆ')}</p>
        <p>${esc(p.desc || 'ຍັງບໍ່ມີລາຍລະອຽດ')}</p>
        ${type === 'preorder' ? '<div class="preorder-note"><b>Pre-order</b><br>ສິນຄ້ານີ້ຕ້ອງລໍຖ້າ 14-18 ມື້ ຫຼັງຈາກ Admin ຢືນຢັນອໍເດີແລ້ວ.</div>' : ''}
        ${p.active === false ? '<div class="note bad-note">ສິນຄ້ານີ້ປິດຂາຍຊົ່ວຄາວ ຈຶ່ງບໍ່ສາມາດໃສ່ກະຕ່າໄດ້.</div>' : ''}
        <div class="filter-title">ເລືອກໄຊສ໌ / ເບີ / ຄວາມຈຳ</div>
        <div class="variant-grid size-only-grid">${sizes.map(size => { const v = variantForSize(p, size); const stock = stockForSize(p, size); const price = bbV70PriceForVariant(p, v); return `<button type="button" class="variant-chip size-only-chip ${size === selectedSize ? 'active' : ''}" data-size="${esc(size)}" ${type === 'ready' && Number(stock || 0) <= 0 ? 'disabled' : ''}><span>${esc(size)} ${type === 'ready' ? `(${Number(stock || 0)})` : ''}</span><small>${money(price)}</small></button>`; }).join('')}</div>
        <div class="note price-lock-note">ຍອດຈະຄິດຕາມ option ທີ່ເລືອກ: <b>${money(rolePrice)}</b> x ${qty} = <b>${money(rolePrice * qty)}</b></div>
        <div class="qty-controls"><button type="button" data-qty="-1">−</button><b>${qty}</b><button type="button" data-qty="1">+</button></div>
        <div class="action-row"><button type="button" class="primary" id="addToCartFromDetail" ${disabled ? 'disabled' : ''}>🛒 ໃສ່ກະຕ່າ</button>${currentRole() === 'agent' ? '<button type="button" class="outline" id="copyProductCaption">Copy caption</button>' : ''}</div>
        ${currentRole() === 'agent' ? `<textarea class="hidden" id="captionText">${esc(caption)}</textarea>` : ''}
      </div>
    </div>
    <h3>ລີວິວ</h3>${reviewsHtml(p)}
  </div>`, true);
  $$('[data-size]', $('#modalLayer')).forEach(btn => btn.onclick = () => { state.productDetail.size = btn.dataset.size; renderProductModal(); });
  $$('[data-gallery-img]', $('#modalLayer')).forEach(btn => btn.onclick = () => { state.productDetail.viewImage = btn.dataset.galleryImg || primaryProductImage(p); renderProductModal(); });
  $$('[data-qty]', $('#modalLayer')).forEach(btn => btn.onclick = () => { state.productDetail.qty = Math.max(1, Number(state.productDetail.qty || 1) + Number(btn.dataset.qty)); renderProductModal(); });
  $('#addToCartFromDetail')?.addEventListener('click', addToCartFromDetail);
  $('#copyProductCaption')?.addEventListener('click', () => copyText($('#captionText').value).then(ok => toast(ok ? 'Copy caption ແລ້ວ' : 'Copy ບໍ່ສຳເລັດ')));
  attachZoomableImages($('#modalLayer'));
};

addToCartFromDetail = function() {
  const role = currentRole();
  if (!['customer', 'agent'].includes(role)) return toast('ຕ້ອງເປັນລູກຄ້າ ຫຼື ຕົວແທນເທົ່ານັ້ນ');
  const detail = state.productDetail;
  const p = products().find(x => x.id === detail.id);
  if (!p) return;
  const type = normalizeType(p);
  const qty = Math.max(1, Number(detail.qty || 1));
  const selectedImage = state.productDetail?.viewImage || primaryProductImage(p);
  const selectedSize = detail.size || firstAvailableSize(p);
  const variant = variantForSize(p, selectedSize);
  if (p.active === false) return toast('ສິນຄ້ານີ້ປິດຂາຍຊົ່ວຄາວ');
  if (type === 'ready' && qty > stockForSize(p, selectedSize)) return toast('ສິນຄ້າໃນສະຕັອກບໍ່ພໍ');
  const price = bbV70PriceForVariant(p, variant, role);
  if (!price || price <= 0) return toast('ລາຄາ option ນີ້ບໍ່ຖືກຕ້ອງ ກະລຸນາໃຫ້ Admin ກວດລາຄາ');
  const optionName = cartOptionName(p, selectedSize, selectedImage);
  const key = `${p.id}|${optionName}|${role}|${price}`;
  const list = cart();
  const found = list.find(item => item.key === key);
  if (found) { found.qty += qty; found.image = selectedImage || found.image || ''; found.price = price; }
  else list.push({key, productId:p.id, name:p.name, category:p.category, image:selectedImage || '', emoji:p.emoji || '🪷', variantName:optionName, sizeName:selectedSize, sourceVariantName:variant?.name || selectedSize, qty, price, basePrice:bbV70VariantCustomerPrice(p, variant), agentPrice:bbV70VariantAgentPrice(p, variant), type, rolePrice:role, addedAt:new Date().toISOString()});
  saveCart(list);
  closeModal();
  openCart();
  play('success');
  toast('ໃສ່ກະຕ່າແລ້ວ');
};

function bbV70RepriceCartAgainstProducts() {
  const list = cart();
  let changed = false;
  list.forEach(item => {
    const p = products().find(x => String(x.id) === String(item.productId));
    if (!p) return;
    const v = variantForSize(p, item.sizeName || optionPartsFromName(item.sourceVariantName || item.variantName).size || item.sourceVariantName);
    const expected = bbV70PriceForVariant(p, v, item.rolePrice || currentRole());
    if (expected > 0 && moneyValue(item.price) !== expected) { item.price = expected; changed = true; }
    const base = bbV70VariantCustomerPrice(p, v); const agent = bbV70VariantAgentPrice(p, v);
    if (moneyValue(item.basePrice) !== base) { item.basePrice = base; changed = true; }
    if (moneyValue(item.agentPrice) !== agent) { item.agentPrice = agent; changed = true; }
  });
  if (changed) saveCart(list);
}
const bbV70BaseOpenCart = openCart;
openCart = function() { bbV70RepriceCartAgainstProducts(); bbV70BaseOpenCart(); };

// v83 fix: older code expected createOrderFromCart, but this app uses createOrder.
// Wrapping createOrder prevents ReferenceError and lets later delete/sync repairs run.
if (typeof createOrder === 'function') {
  const bbV70BaseCreateOrder = createOrder;
  createOrder = function() {
    bbV70RepriceCartAgainstProducts();
    return bbV70BaseCreateOrder.apply(this, arguments);
  };
}

function bbV70NormalizeVariantPricesForExistingProducts() {
  const list = products(); let changed = false;
  list.forEach(p => {
    const base = moneyValue(p.price || 0); const agent = moneyValue(p.agentPrice || base);
    p.variants = variantsOf(p).map(v => {
      const next = {...v};
      if (!next.price || next.price <= 0) { next.price = base; changed = true; }
      if (!next.agentPrice || next.agentPrice <= 0) { next.agentPrice = agent; changed = true; }
      return next;
    });
  });
  if (changed) saveProducts(list);
}
try { bbV70NormalizeVariantPricesForExistingProducts(); } catch(e) { console.warn('v70 normalize skipped', e); }

/* ===== V72: registration duplicate-phone repair =====
   If Supabase/cache already contains the phone from a previous test/delete, registration no longer gets stuck.
   Registering the same phone will refresh that customer profile/password and log in immediately. */
const BB_V72_VERSION = 'v72 register duplicate phone repair';

function bbV72AuthSnap() {
  return typeof bbV66AuthSnapshot === 'function' ? bbV66AuthSnapshot() : {
    name: (document.querySelector('#bb-auth-name')?.value || '').trim(),
    idRaw: (document.querySelector('#bb-auth-id')?.value || '').trim(),
    phone: typeof bbV69CleanPhone === 'function' ? bbV69CleanPhone(document.querySelector('#bb-auth-id')?.value || '') : normPhone(document.querySelector('#bb-auth-id')?.value || ''),
    pass: (document.querySelector('#bb-auth-pass')?.value || '').trim(),
    role: 'customer'
  };
}

async function bbV72RegisterCustomer() {
  if (typeof bbV66AuthBusy !== 'undefined' && bbV66AuthBusy) return;
  const snap = bbV72AuthSnap();
  const btn = document.querySelector('#bb-register-btn');
  if (!snap.name) return toast('ກະລຸນາໃສ່ຊື່');
  if (!validPhoneTail(snap.phone)) return toast('ເບີໂທຕ້ອງມີ 8 ຕົວເລກ');
  if (String(snap.pass || '').length < 4) return toast('ລະຫັດຕ້ອງຢ່າງນ້ອຍ 4 ຕົວ');

  bbV66AuthBusy = true;
  if (typeof bbV66SetBusy === 'function') bbV66SetBusy(btn, true, 'ກຳລັງບັນທຶກ...');
  try {
    let existing = null;
    try { existing = await bbV69FindCustomerByPhone(snap.phone); } catch (err) { existing = null; }

    // Important: do not block registration only because a stale phone exists in cache/Supabase.
    // Refresh the customer profile/password for that phone and log in.
    const user = bbV69PlainUser({
      ...(existing || {}),
      id: existing?.id || uid('CUS'),
      name: snap.name,
      phone: snap.phone,
      pass: snap.pass,
      avatar: existing?.avatar || avatars[Math.floor(Math.random() * avatars.length)] || '🐣',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (typeof bbV69ClearDeletedCustomer === 'function') bbV69ClearDeletedCustomer(user.phone, user.id);
    await bbV69PersistCustomer(user);

    // Force an immediate reload from cloud/local so login/admin customer list sees it after refresh.
    try { if (typeof cloudLoadAll === 'function' && getCloudClient()) await cloudLoadAll(); } catch (err) {}
    try { if (typeof bbV65SyncCustomersPersistent === 'function') await bbV65SyncCustomersPersistent(); } catch (err) {}

    setSession('customer', user.id);
    play('success');
    toast(existing ? 'ອັບເດດບັນຊີ ແລະ ເຂົ້າລະບົບແລ້ວ' : 'ລົງທະບຽນສຳເລັດ');
    state.page = 'home';
    renderAll();
  } catch (err) {
    console.error('v72 register failed', err);
    play('error');
    if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ name: snap.name, id: snap.idRaw, pass: snap.pass });
    toast('ລົງທະບຽນບໍ່ສຳເລັດ ກະລຸນາກວດເນັດ ຫຼື Supabase');
  } finally {
    bbV66AuthBusy = false;
    if (typeof bbV66SetBusy === 'function') bbV66SetBusy(btn, false);
  }
}

bbAuthRegisterCustomer = bbV72RegisterCustomer;
const bbV72BaseBindCoreEvents = bindCoreEvents;
bindCoreEvents = function() {
  bbV72BaseBindCoreEvents();
  const reg = document.querySelector('#bb-register-btn');
  if (reg) reg.onclick = bbAuthRegisterCustomer;
};
Object.assign(window, { BB_V72_VERSION, bbAuthRegisterCustomer, bbV72RegisterCustomer });

/* ===== V73: admin delete orders + stable agent management =====
   Fixes:
   - Admin can delete orders permanently without Supabase merge bringing them back.
   - Agent add form keeps typed values during sync/re-render.
   - Agent accounts persist to Supabase immediately, can login after creation.
   - Admin can view/change agent password and toggle/delete agents reliably. */
const BB_V73_VERSION = 'v73 admin order delete and agent management fix';
DB.deletedOrders = 'BB4_deletedOrders';
DB.deletedAgents = 'BB4_deletedAgents';
if (!CLOUD_KEYS.includes(DB.deletedOrders)) CLOUD_KEYS.push(DB.deletedOrders);
if (!CLOUD_KEYS.includes(DB.deletedAgents)) CLOUD_KEYS.push(DB.deletedAgents);
state.agentDraft = state.agentDraft || { name:'', id:'', pass:'', phone:'' };

function bbV73ReadTombstone(key) {
  const v = load(key, { ids: [], phones: [], names: [] });
  return {
    ids: Array.from(new Set(v.ids || [])).filter(Boolean).map(String),
    phones: Array.from(new Set(v.phones || [])).filter(Boolean).map(String),
    names: Array.from(new Set(v.names || [])).filter(Boolean).map(String)
  };
}
function bbV73SaveTombstone(key, value) {
  const clean = {
    ids: Array.from(new Set(value.ids || [])).filter(Boolean).map(String),
    phones: Array.from(new Set(value.phones || [])).filter(Boolean).map(String),
    names: Array.from(new Set(value.names || [])).filter(Boolean).map(String)
  };
  localStorage.setItem(key, JSON.stringify(clean));
  if (!cloudPulling) {
    if (getCloudClient()) cloudSaveNow(key, clean);
    else cloudSave(key, clean);
  }
  return clean;
}
function bbV73IsDeletedOrder(o) {
  const d = bbV73ReadTombstone(DB.deletedOrders);
  return !!o && o.id && d.ids.includes(String(o.id));
}
function bbV73IsDeletedAgent(a) {
  const d = bbV73ReadTombstone(DB.deletedAgents);
  return !!a && ((a.id && d.ids.includes(String(a.id))) || (a.phone && d.phones.includes(String(a.phone))));
}
function bbV73FilterOrders(list) { return (Array.isArray(list) ? list : []).filter(o => o && !bbV73IsDeletedOrder(o)); }
function bbV73FilterAgents(list) { return (Array.isArray(list) ? list : []).filter(a => a && !bbV73IsDeletedAgent(a)); }
function bbV73MergeAgents(...lists) {
  const map = new Map();
  lists.flat().filter(Boolean).forEach(raw => {
    if (!raw || !raw.id || bbV73IsDeletedAgent(raw)) return;
    const id = String(raw.id).trim();
    const old = map.get(id) || {};
    map.set(id, { ...old, ...raw, id, pass: String(raw.pass ?? old.pass ?? '') });
  });
  return Array.from(map.values()).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function bbV73MergeOrders(...lists) {
  const map = new Map();
  lists.flat().filter(Boolean).forEach(raw => {
    if (!raw || !raw.id || bbV73IsDeletedOrder(raw)) return;
    const id = String(raw.id);
    const old = map.get(id) || {};
    map.set(id, { ...old, ...raw, id });
  });
  return Array.from(map.values()).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

const bbV73BaseOrders = orders;
orders = function() { return bbV73FilterOrders(bbV73BaseOrders()); };
const bbV73BaseAgents = agents;
agents = function() { return bbV73FilterAgents(bbV73BaseAgents()); };

const bbV73BaseMergeArrayState = bbMergeArrayState;
bbMergeArrayState = function(key, remoteValue, localValue) {
  if (key === DB.orders) return bbV73MergeOrders(remoteValue, localValue);
  if (key === DB.agents) return bbV73MergeAgents(remoteValue, localValue);
  if (key === DB.deletedOrders || key === DB.deletedAgents) {
    const r = remoteValue || {}; const l = localValue || {};
    return {
      ids: Array.from(new Set([...(r.ids || []), ...(l.ids || [])].map(String))).filter(Boolean),
      phones: Array.from(new Set([...(r.phones || []), ...(l.phones || [])].map(String))).filter(Boolean),
      names: Array.from(new Set([...(r.names || []), ...(l.names || [])].map(String))).filter(Boolean)
    };
  }
  const merged = bbV73BaseMergeArrayState(key, remoteValue, localValue);
  if (key === DB.products && typeof bbV68FilterProducts === 'function') return bbV68FilterProducts(merged);
  if ((key === DB.users || key === DB.customerRegistry) && typeof bbV68FilterUsers === 'function') return bbV68FilterUsers(merged);
  return merged;
};

saveOrders = function(list) {
  const clean = bbV73MergeOrders(list || []);
  localStorage.setItem(DB.orders, JSON.stringify(clean));
  if (!cloudPulling) cloudSave(DB.orders, clean);
};
saveAgents = function(list) {
  const clean = bbV73MergeAgents(list || []);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  if (!cloudPulling) cloudSave(DB.agents, clean);
};
async function bbV73PersistOrdersNow(list) {
  const clean = bbV73MergeOrders(list || []);
  localStorage.setItem(DB.orders, JSON.stringify(clean));
  if (getCloudClient()) await cloudSaveNow(DB.orders, clean);
  return clean;
}
async function bbV73PersistAgentsNow(list) {
  const clean = bbV73MergeAgents(list || []);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  if (getCloudClient()) await cloudSaveNow(DB.agents, clean);
  return clean;
}
async function bbV73ApplyDeleteFilters() {
  const cleanOrders = bbV73FilterOrders(load(DB.orders, []));
  const cleanAgents = bbV73FilterAgents(load(DB.agents, []));
  localStorage.setItem(DB.orders, JSON.stringify(cleanOrders));
  localStorage.setItem(DB.agents, JSON.stringify(cleanAgents));
  if (getCloudClient()) {
    await cloudSaveNow(DB.orders, cleanOrders);
    await cloudSaveNow(DB.agents, cleanAgents);
  }
}
const bbV73BaseCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const ok = await bbV73BaseCloudLoadAll();
  await bbV73ApplyDeleteFilters();
  return ok;
};

async function bbV73DeleteOrder(id) {
  if (currentRole() !== 'admin') return toast('Admin ເທົ່ານັ້ນທີ່ລົບອໍເດີໄດ້');
  const all = load(DB.orders, []);
  const o = all.find(x => String(x.id) === String(id));
  if (!o) return toast('ບໍ່ພົບອໍເດີ');
  if (!confirm(`ລົບອໍເດີ ${o.id} ອອກຖາວອນ?`)) return;
  try { restoreStockForOrder(o); } catch (err) { console.warn('v73 restore stock skipped', err); }
  const d = bbV73ReadTombstone(DB.deletedOrders);
  d.ids.push(String(o.id));
  bbV73SaveTombstone(DB.deletedOrders, d);
  const next = all.filter(x => String(x.id) !== String(o.id));
  await bbV73PersistOrdersNow(next);
  if (getCloudClient()) await cloudSaveNow(DB.deletedOrders, bbV73ReadTombstone(DB.deletedOrders));
  play('delete');
  toast('ລົບອໍເດີແລ້ວ');
  closeModal();
  renderAll();
}
deleteOrder = bbV73DeleteOrder;

function bbV73CaptureAgentDraft() {
  const name = document.querySelector('#agentNameNew');
  const id = document.querySelector('#agentIdNew');
  const pass = document.querySelector('#agentPassNew');
  const phone = document.querySelector('#agentPhoneNew');
  if (!name && !id && !pass && !phone) return;
  state.agentDraft = {
    name: name?.value || state.agentDraft?.name || '',
    id: id?.value || state.agentDraft?.id || '',
    pass: pass?.value || state.agentDraft?.pass || '',
    phone: phone?.value || state.agentDraft?.phone || ''
  };
}
function bbV73BindAgentDraft() {
  ['agentNameNew','agentIdNew','agentPassNew','agentPhoneNew'].forEach(k => {
    const el = document.querySelector('#' + k);
    if (!el) return;
    el.oninput = () => bbV73CaptureAgentDraft();
  });
}
function bbV73AgentPasswordText(a) {
  return a?.pass ? String(a.pass) : '-';
}
function adminAgents() {
  enforceAgentRules();
  const d = state.agentDraft || {};
  const list = agents();
  $('#adminContent').innerHTML = `<div class="auth-card"><h3>ເພີ່ມຕົວແທນ</h3><div class="prod-manage"><input id="agentNameNew" placeholder="ຊື່" value="${esc(d.name || '')}"><input id="agentIdNew" placeholder="Agent ID" value="${esc(d.id || '')}"><input id="agentPassNew" placeholder="Password" value="${esc(d.pass || '')}"><input id="agentPhoneNew" placeholder="ເບີໂທ" value="${esc(d.phone || '')}"><button type="button" class="success" id="addAgentBtn">ເພີ່ມຕົວແທນ</button></div><p class="muted">ຂໍ້ມູນທີ່ພິມຈະບໍ່ຫາຍ ເຖິງລະບົບ sync/re-render.</p></div><h3>ລາຍຊື່ຕົວແທນ</h3><div class="order-list">${list.map(a => { const st = agentStats(a.id); const rule = agentRuleStatus(a); return `<div class="agent-row"><div><b>${esc(a.name)}</b> ${a.active === false ? '<span class="status bad">ປິດ</span>' : '<span class="status good">ເປີດ</span>'}<br><span class="muted">ID: ${esc(a.id)} · ເບີ: ${esc(a.phone || '-')}</span><br><span class="muted">Password: <b>${esc(bbV73AgentPasswordText(a))}</b></span>${a.blockReason ? `<br><span class="muted">${esc(a.blockReason)}</span>` : ''}</div><div>ອໍເດີທັງໝົດ: <b>${st.count}</b><br><span class="muted">ອາທິດນີ້: ${rule.count}/${rule.min}</span></div><div>${money(st.sales)}<br><span class="muted">ເຫຼືອ ${rule.daysLeft} ມື້${rule.selfCount ? ` · self ${rule.selfCount}` : ''}</span></div><div class="action-row"><button type="button" class="outline" data-agent-pass="${esc(a.id)}">🔐 ປ່ຽນລະຫັດ</button><button type="button" class="outline" data-agent-toggle="${esc(a.id)}">${a.active === false ? 'ເປີດ' : 'ປິດ'}</button><button type="button" class="danger" data-agent-delete="${esc(a.id)}">🗑 ລົບ</button></div></div>`; }).join('') || '<div class="note">ຍັງບໍ່ມີຕົວແທນ</div>'}</div>`;
  $('#addAgentBtn').onclick = addAgent;
  bbV73BindAgentDraft();
  $$('[data-agent-toggle]', $('#adminContent')).forEach(btn => btn.onclick = () => toggleAgent(btn.dataset.agentToggle));
  $$('[data-agent-delete]', $('#adminContent')).forEach(btn => btn.onclick = () => deleteAgent(btn.dataset.agentDelete));
  $$('[data-agent-pass]', $('#adminContent')).forEach(btn => btn.onclick = () => openAgentPassword(btn.dataset.agentPass));
}

async function addAgent() {
  bbV73CaptureAgentDraft();
  const draft = state.agentDraft || {};
  const id = String(draft.id || '').trim();
  const name = String(draft.name || '').trim();
  const pass = String(draft.pass || '').trim();
  const phoneRaw = String(draft.phone || '').trim();
  if (!id || !name || !pass) return toast('ກອກຊື່, ID, Password ໃຫ້ຄົບ');
  if (pass.length < 2) return toast('Password ຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  const current = agents();
  if (current.some(a => String(a.id) === id)) return toast('Agent ID ຊ້ຳ');
  const del = bbV73ReadTombstone(DB.deletedAgents);
  del.ids = del.ids.filter(x => x !== id);
  bbV73SaveTombstone(DB.deletedAgents, del);
  const agent = { id, name, pass, phone: phoneRaw ? normPhone(phoneRaw) : '', active:true, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), weekStartedAt:new Date().toISOString() };
  await bbV73PersistAgentsNow([...current, agent]);
  if (getCloudClient()) await cloudSaveNow(DB.deletedAgents, bbV73ReadTombstone(DB.deletedAgents));
  state.agentDraft = { name:'', id:'', pass:'', phone:'' };
  play('success');
  toast('ເພີ່ມຕົວແທນແລ້ວ ແລະ login ໄດ້ເລີຍ');
  adminAgents();
}
async function toggleAgent(id) {
  const list = agents();
  const a = list.find(x => String(x.id) === String(id));
  if (!a) return toast('ບໍ່ພົບຕົວແທນ');
  a.active = a.active === false;
  a.updatedAt = new Date().toISOString();
  if (a.active) { a.autoBlocked = false; a.blockReason = ''; a.weekStartedAt = new Date().toISOString(); }
  await bbV73PersistAgentsNow(list);
  toast(a.active ? 'ເປີດຕົວແທນແລ້ວ' : 'ປິດຕົວແທນແລ້ວ');
  adminAgents();
}
async function deleteAgent(id) {
  const list = agents();
  const a = list.find(x => String(x.id) === String(id));
  if (!a) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${a.name || a.id}?`)) return;
  const d = bbV73ReadTombstone(DB.deletedAgents);
  d.ids.push(String(a.id));
  if (a.phone) d.phones.push(String(a.phone));
  bbV73SaveTombstone(DB.deletedAgents, d);
  await bbV73PersistAgentsNow(list.filter(x => String(x.id) !== String(a.id)));
  if (getCloudClient()) await cloudSaveNow(DB.deletedAgents, bbV73ReadTombstone(DB.deletedAgents));
  if (currentAgent()?.id === a.id) removeKey(DB.agentSession);
  play('delete');
  toast('ລົບຕົວແທນແລ້ວ');
  adminAgents();
}
function openAgentPassword(id) {
  const a = agents().find(x => String(x.id) === String(id));
  if (!a) return toast('ບໍ່ພົບຕົວແທນ');
  openModal(`<div class="modal"><div class="modal-head"><h2>ລະຫັດຕົວແທນ</h2><button class="icon-btn" type="button" data-close>✕</button></div><div class="note"><b>Agent:</b> ${esc(a.name)}<br><b>ID:</b> ${esc(a.id)}<br><b>Password ປັດຈຸບັນ:</b> <span class="status good">${esc(bbV73AgentPasswordText(a))}</span></div><div class="form-grid"><input id="agentNewPass" class="wide" placeholder="ລະຫັດໃໝ່" value="${esc(a.pass || '')}"><input id="agentNewPass2" class="wide" placeholder="ຢືນຢັນລະຫັດໃໝ່" value="${esc(a.pass || '')}"></div><button type="button" class="success full" id="saveAgentPassBtn">ບັນທຶກລະຫັດຕົວແທນ</button></div>`);
  $('#saveAgentPassBtn').onclick = () => saveAgentPassword(id);
}
async function saveAgentPassword(id) {
  const p1 = String($('#agentNewPass')?.value || '').trim();
  const p2 = String($('#agentNewPass2')?.value || '').trim();
  if (p1.length < 2) return toast('ລະຫັດຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  if (p1 !== p2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const list = agents();
  const a = list.find(x => String(x.id) === String(id));
  if (!a) return toast('ບໍ່ພົບຕົວແທນ');
  a.pass = p1;
  a.passwordUpdatedAt = new Date().toISOString();
  a.updatedAt = new Date().toISOString();
  await bbV73PersistAgentsNow(list);
  play('success');
  toast('ປ່ຽນລະຫັດຕົວແທນແລ້ວ');
  closeModal();
  adminAgents();
}

async function bbV73FindAgentForLogin(idRaw, pass) {
  const id = String(idRaw || '').trim();
  if (getCloudClient()) {
    try { await cloudLoadAll(); } catch (err) { console.warn('v73 cloud load before agent login failed', err); }
  }
  enforceAgentRules();
  const list = agents();
  return list.find(a => String(a.id) === id && String(a.pass) === String(pass)) || null;
}

const bbV73BaseAuthLogin = bbAuthLogin;
bbAuthLogin = async function() {
  const snap = typeof bbV66AuthSnapshot === 'function' ? bbV66AuthSnapshot() : {
    idRaw: ($('#bb-auth-id')?.value || '').trim(),
    phone: typeof bbV69CleanPhone === 'function' ? bbV69CleanPhone($('#bb-auth-id')?.value || '') : normPhone($('#bb-auth-id')?.value || ''),
    pass: ($('#bb-auth-pass')?.value || '').trim(),
    role: state.authRole || 'customer'
  };
  if (snap.role !== 'agent') return bbV73BaseAuthLogin();
  if (typeof bbV66AuthBusy !== 'undefined' && bbV66AuthBusy) return;
  if (!snap.idRaw || !snap.pass) return toast('ກະລຸນາໃສ່ Agent ID ແລະ Password');
  const btn = $('#bb-login-btn');
  bbV66AuthBusy = true;
  if (typeof bbV66SetBusy === 'function') bbV66SetBusy(btn, true, 'ກຳລັງເຂົ້າ...');
  try {
    const agent = await bbV73FindAgentForLogin(snap.idRaw, snap.pass);
    if (!agent) {
      play('error');
      if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
      return toast('Agent ID ຫຼື Password ບໍ່ຖືກ');
    }
    if (agent.active === false) {
      play('error');
      if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
      return toast(agent.blockReason ? `Agent ID ຖືກປິດ: ${agent.blockReason}` : 'Agent ID ຖືກປິດ ກະລຸນາຕິດຕໍ່ Admin');
    }
    setSession('agent', agent.id);
    state.page = 'agent';
    play('success');
    toast('ເຂົ້າລະບົບຕົວແທນສຳເລັດ');
    renderAll();
  } catch (err) {
    console.error('v73 agent login failed', err);
    play('error');
    if (typeof bbV66RestoreAuthValues === 'function') bbV66RestoreAuthValues({ id: snap.idRaw, pass: snap.pass });
    toast('ເຂົ້າລະບົບຕົວແທນບໍ່ສຳເລັດ');
  } finally {
    bbV66AuthBusy = false;
    if (typeof bbV66SetBusy === 'function') bbV66SetBusy(btn, false);
  }
};

const bbV73BaseBindCoreEvents = bindCoreEvents;
bindCoreEvents = function() {
  bbV73BaseBindCoreEvents();
  const log = $('#bb-login-btn');
  const reg = $('#bb-register-btn');
  if (log) log.onclick = bbAuthLogin;
  if (reg) reg.onclick = bbAuthRegisterCustomer;
};

Object.assign(window, { BB_V73_VERSION, bbV73DeleteOrder, addAgent, deleteAgent, toggleAgent, openAgentPassword, saveAgentPassword, adminAgents });

/* ===== V74: stability cleanup + customer password detail modal =====
   Focus:
   - Cleaner customer list and password modal that shows customer ID, name, phone, and current password before changing.
   - Safer persistent customer password save to local cache + Supabase state/customer table when available.
   - Stable modal/button binding helpers to avoid duplicate/blank buttons after re-render.
   - Light startup self-checks for stale sessions and deleted records. */
const BB_V74_VERSION = 'v74 cleanup and customer password detail fix';

function bbV74CustomerCleanList() {
  const map = new Map();
  (Array.isArray(users()) ? users() : []).forEach(u => {
    if (!u || !u.phone) return;
    if (typeof bbV68IsDeletedUser === 'function' && bbV68IsDeletedUser(u)) return;
    if (typeof bbV65IsDeletedCustomer === 'function' && bbV65IsDeletedCustomer(u)) return;
    const key = String(u.phone);
    const old = map.get(key) || {};
    map.set(key, { ...old, ...u, id: old.id || u.id || uid('CUS') });
  });
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function bbV74PersistCustomerListNow(list) {
  const clean = Array.isArray(list) ? list : bbV74CustomerCleanList();
  localStorage.setItem(DB.users, JSON.stringify(clean));
  if (typeof bbV65SaveRegistry === 'function') bbV65SaveRegistry(clean);
  if (getCloudClient()) {
    try { await cloudSaveNow(DB.users, clean); } catch (err) { console.warn('v74 save users state failed', err); }
    if (DB.customerRegistry) {
      try { await cloudSaveNow(DB.customerRegistry, clean); } catch (err) { console.warn('v74 save customer registry failed', err); }
    }
    if (typeof bbV64UpsertCustomer === 'function') {
      for (const u of clean) {
        try { await bbV64UpsertCustomer(u); } catch (err) { console.warn('v74 upsert customer table failed', err); }
      }
    }
  }
  return clean;
}

function bbV74CustomerInfoCard(u) {
  const st = customerStats(u.id);
  return `<div class="customer-password-card">
    <div class="customer-avatar">${esc(u.avatar || '👤')}</div>
    <div class="customer-info-lines">
      <div><b>ຊື່:</b> ${esc(u.name || '-')}</div>
      <div><b>ເບີ:</b> ${esc(u.phone || '-')}</div>
      <div><b>ID:</b> ${esc(u.id || '-')}</div>
      <div><b>ລະຫັດປັດຈຸບັນ:</b> <span class="status good">${esc(u.pass || '-')}</span></div>
      <div class="muted">ອໍເດີ: ${st.count} · ຍອດລວມ: ${money(st.sales)}</div>
    </div>
  </div>`;
}

adminCustomers = async function() {
  const box = $('#adminContent');
  if (!box) return;
  box.innerHTML = '<div class="note">☁️ ກຳລັງດຶງ/ຈັດລາຍຊື່ລູກຄ້າ...</div>';
  try { if (getCloudClient() && typeof bbV65SyncCustomersPersistent === 'function') await bbV65SyncCustomersPersistent(); } catch (err) { console.warn('v74 customer sync skipped', err); }
  const list = bbV74CustomerCleanList();
  localStorage.setItem(DB.users, JSON.stringify(list));
  box.innerHTML = `<div class="admin-clean-head"><h3>ລາຍຊື່ລູກຄ້າ</h3><p class="muted">ກົດ “ລະຫັດ” ເພື່ອເບິ່ງ ID/ຊື່/ເບີ/ລະຫັດ ກ່ອນປ່ຽນ.</p></div><div class="order-list customer-clean-list">${list.map(u => { const st = customerStats(u.id); return `<div class="customer-row clean-customer-row"><div><b>${esc(u.name || '-')}</b><br><span class="muted">ເບີ: ${esc(u.phone || '-')}</span><br><span class="muted">ID: ${esc(u.id || '-')}</span></div><div class="customer-mini-stat"><b>${st.count}</b><br><span class="muted">ອໍເດີ</span></div><div class="customer-mini-stat"><b>${money(st.sales)}</b><br><span class="muted">ຍອດ</span></div><div class="action-row"><button type="button" class="outline" data-customer-detail="${esc(u.id)}">🔎 ລາຍລະອຽດ</button><button type="button" class="primary" data-customer-pass="${esc(u.id)}">🔐 ລະຫັດ</button><button type="button" class="danger" data-customer-delete="${esc(u.id)}">🗑 ລົບ</button></div></div>`; }).join('') || '<div class="note">ຍັງບໍ່ມີລູກຄ້າ</div>'}</div>`;
  $$('[data-customer-detail]', box).forEach(btn => btn.onclick = () => openCustomerDetail(btn.dataset.customerDetail));
  $$('[data-customer-pass]', box).forEach(btn => btn.onclick = () => openCustomerPassword(btn.dataset.customerPass));
  $$('[data-customer-delete]', box).forEach(btn => btn.onclick = () => deleteCustomer(btn.dataset.customerDelete));
};

openCustomerPassword = function(id) {
  const u = users().find(x => String(x.id) === String(id));
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  openModal(`<div class="modal customer-pass-modal"><div class="modal-head"><h2>ຈັດການລະຫັດລູກຄ້າ</h2><button class="icon-btn" type="button" data-close>✕</button></div>${bbV74CustomerInfoCard(u)}<div class="note">ໃສ່ລະຫັດໃໝ່ ແລ້ວກົດບັນທຶກ. ຂໍ້ມູນນີ້ຈະ sync ໄປ Supabase.</div><div class="form-grid"><input id="newCustomerPass" class="wide" placeholder="ລະຫັດໃໝ່ ຢ່າງນ້ອຍ 4 ຕົວ"><input id="newCustomerPass2" class="wide" placeholder="ຢືນຢັນລະຫັດໃໝ່"></div><button type="button" class="success full" id="saveCustomerPassBtn">ບັນທຶກລະຫັດໃໝ່</button></div>`);
  const p1 = $('#newCustomerPass');
  const p2 = $('#newCustomerPass2');
  if (p1) p1.value = '';
  if (p2) p2.value = '';
  $('#saveCustomerPassBtn').onclick = () => saveCustomerPassword(id);
};

saveCustomerPassword = async function(id) {
  const pass = String($('#newCustomerPass')?.value || '').trim();
  const pass2 = String($('#newCustomerPass2')?.value || '').trim();
  if (pass.length < 4) return toast('ລະຫັດໃໝ່ຕ້ອງຢ່າງນ້ອຍ 4 ຕົວ');
  if (pass !== pass2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const list = bbV74CustomerCleanList();
  const u = list.find(x => String(x.id) === String(id));
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  u.pass = pass;
  u.passwordUpdatedAt = new Date().toISOString();
  u.updatedAt = new Date().toISOString();
  try {
    await bbV74PersistCustomerListNow(list);
    play('success');
    toast('ປ່ຽນລະຫັດລູກຄ້າແລ້ວ');
    closeModal();
    if (state.page === 'admin' && state.adminTab === 'customers') adminCustomers();
  } catch (err) {
    console.error('v74 save customer password failed', err);
    play('error');
    toast('ບັນທຶກບໍ່ສຳເລັດ ກວດ Supabase/ເນັດ');
  }
};

const bbV74BaseOpenCustomerDetail = openCustomerDetail;
openCustomerDetail = function(id) {
  const u = users().find(x => String(x.id) === String(id));
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  const list = orders().filter(o => o.userId === id);
  openModal(`<div class="modal"><div class="modal-head"><h2>${esc(u.name || 'ລູກຄ້າ')}</h2><button class="icon-btn" type="button" data-close>✕</button></div>${bbV74CustomerInfoCard(u)}<div class="action-row" style="margin-top:10px"><button type="button" class="primary" data-customer-pass="${esc(u.id)}">🔐 ປ່ຽນລະຫັດ</button><a class="link-btn" target="_blank" href="${waLink('ສະບາຍດີ ' + (u.name || '') + ', Admin Bai Boua ແຈ້ງເລື່ອງບັນຊີ/ລະຫັດຂອງທ່ານ', u.phone)}">WhatsApp ຫາລູກຄ້າ</a></div><div class="order-list" style="margin-top:12px">${list.map(o => orderCard(o)).join('') || '<div class="note">ບໍ່ມີອໍເດີ</div>'}</div></div>`);
  attachOrderButtons($('#modalLayer'));
  $$('[data-customer-pass]', $('#modalLayer')).forEach(btn => btn.onclick = () => openCustomerPassword(btn.dataset.customerPass));
};

function bbV74CleanupSessions() {
  try {
    if (currentRole() === 'customer' && !currentCustomer()) removeKey(DB.session);
    if (currentRole() === 'agent' && !currentAgent()) removeKey(DB.agentSession);
  } catch (err) { console.warn('v74 session cleanup skipped', err); }
}

const bbV74BaseRenderAll = renderAll;
renderAll = function() {
  bbV74CleanupSessions();
  return bbV74BaseRenderAll();
};

setTimeout(() => {
  try {
    bbV74CleanupSessions();
    if (state.page === 'admin' && state.adminTab === 'customers') adminCustomers();
  } catch (err) { console.warn('v74 startup cleanup skipped', err); }
}, 1000);

Object.assign(window, { BB_V74_VERSION, adminCustomers, openCustomerPassword, saveCustomerPassword, bbV74CustomerCleanList, bbV74PersistCustomerListNow });

/* v75 agent delete/password stability and customer list flicker fix
   - Deletes agents persistently by writing tombstone + cleaned agent list immediately to Supabase.
   - Agent password changes are forced to local + cloud before UI refresh.
   - Disabled agents render grayscale/closed and cannot login.
   - Customer admin list no longer flashes a loading card on every sync/render. */
const BB_V75_VERSION = 'v75 agent delete password stable and customer flicker fix';

function bbV75AgentListRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(DB.agents) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (err) { return []; }
}
function bbV75CleanAgentList(list) {
  const tomb = typeof bbV73ReadTombstone === 'function' ? bbV73ReadTombstone(DB.deletedAgents) : {ids:[], phones:[]};
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(a => {
    if (!a || !a.id) return;
    const id = String(a.id).trim();
    const phone = String(a.phone || '').trim();
    if (!id) return;
    if ((tomb.ids || []).includes(id) || (phone && (tomb.phones || []).includes(phone))) return;
    const old = map.get(id) || {};
    map.set(id, { ...old, ...a, id, pass: String(a.pass ?? old.pass ?? '') });
  });
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
async function bbV75PersistAgentsHard(list, reason = 'agent update') {
  const clean = bbV75CleanAgentList(list);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  try {
    if (getCloudClient()) await cloudSaveNow(DB.agents, clean);
    else cloudSave(DB.agents, clean);
  } catch (err) {
    console.warn('v75 persist agents failed', reason, err);
    setCloudStatus('offline');
  }
  return clean;
}

const bbV75BaseAgents = agents;
agents = function() { return bbV75CleanAgentList(bbV75AgentListRaw()); };

saveAgents = function(list) {
  const clean = bbV75CleanAgentList(list || []);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  if (!cloudPulling) cloudSave(DB.agents, clean);
};

bbV73PersistAgentsNow = async function(list) {
  return bbV75PersistAgentsHard(list || [], 'bbV73PersistAgentsNow');
};

function bbV75AgentStatusBadge(a) {
  return a.active === false ? '<span class="status bad">ປິດ ID</span>' : '<span class="status good">ເປີດໃຊ້ງານ</span>';
}
function bbV75AgentRowClass(a) {
  return a.active === false ? 'agent-row agent-disabled' : 'agent-row';
}

adminAgents = function() {
  enforceAgentRules();
  const d = state.agentDraft || {};
  const list = agents();
  const rows = list.map(a => {
    const st = agentStats(a.id);
    const rule = agentRuleStatus(a);
    return `<div class="${bbV75AgentRowClass(a)}">
      <div><b>${esc(a.name || '-')}</b> ${bbV75AgentStatusBadge(a)}<br>
        <span class="muted">ID: ${esc(a.id)} · ເບີ: ${esc(a.phone || '-')}</span><br>
        <span class="muted">Password: <b>${esc(bbV73AgentPasswordText(a))}</b></span>
        ${a.active === false ? '<br><span class="muted">ສະຖານະ: ປິດໄອດີແລ້ວ ຕົວແທນຈະ login ບໍ່ໄດ້</span>' : ''}
        ${a.blockReason ? `<br><span class="muted">${esc(a.blockReason)}</span>` : ''}
      </div>
      <div>ອໍເດີທັງໝົດ: <b>${st.count}</b><br><span class="muted">ອາທິດນີ້: ${rule.count}/${rule.min}</span></div>
      <div>${money(st.sales)}<br><span class="muted">ເຫຼືອ ${rule.daysLeft} ມື້${rule.selfCount ? ` · self ${rule.selfCount}` : ''}</span></div>
      <div class="action-row">
        <button type="button" class="outline" data-agent-pass="${esc(a.id)}">🔐 ປ່ຽນລະຫັດ</button>
        <button type="button" class="outline" data-agent-toggle="${esc(a.id)}">${a.active === false ? 'ເປີດ ID' : 'ປິດ ID'}</button>
        <button type="button" class="danger" data-agent-delete="${esc(a.id)}">🗑 ລົບ</button>
      </div>
    </div>`;
  }).join('');
  $('#adminContent').innerHTML = `<div class="auth-card"><h3>ເພີ່ມຕົວແທນ</h3><div class="prod-manage"><input id="agentNameNew" placeholder="ຊື່" value="${esc(d.name || '')}"><input id="agentIdNew" placeholder="Agent ID" value="${esc(d.id || '')}"><input id="agentPassNew" placeholder="Password" value="${esc(d.pass || '')}"><input id="agentPhoneNew" placeholder="ເບີໂທ" value="${esc(d.phone || '')}"><button type="button" class="success" id="addAgentBtn">ເພີ່ມຕົວແທນ</button></div><p class="muted">ຂໍ້ມູນທີ່ພິມຈະບໍ່ຫາຍ ເຖິງລະບົບ sync/re-render.</p></div><h3>ລາຍຊື່ຕົວແທນ</h3><div class="order-list">${rows || '<div class="note">ຍັງບໍ່ມີຕົວແທນ</div>'}</div>`;
  $('#addAgentBtn').onclick = addAgent;
  bbV73BindAgentDraft();
  $$('[data-agent-toggle]', $('#adminContent')).forEach(btn => btn.onclick = () => toggleAgent(btn.dataset.agentToggle));
  $$('[data-agent-delete]', $('#adminContent')).forEach(btn => btn.onclick = () => deleteAgent(btn.dataset.agentDelete));
  $$('[data-agent-pass]', $('#adminContent')).forEach(btn => btn.onclick = () => openAgentPassword(btn.dataset.agentPass));
};

addAgent = async function() {
  bbV73CaptureAgentDraft();
  const draft = state.agentDraft || {};
  const id = String(draft.id || '').trim();
  const name = String(draft.name || '').trim();
  const pass = String(draft.pass || '').trim();
  const phoneRaw = String(draft.phone || '').trim();
  if (!id || !name || !pass) return toast('ກອກຊື່, ID, Password ໃຫ້ຄົບ');
  if (pass.length < 2) return toast('Password ຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  const current = agents();
  if (current.some(a => String(a.id) === id)) return toast('Agent ID ຊ້ຳ');
  const del = bbV73ReadTombstone(DB.deletedAgents);
  del.ids = (del.ids || []).filter(x => String(x) !== id);
  if (phoneRaw) {
    const np = normPhone(phoneRaw);
    del.phones = (del.phones || []).filter(x => String(x) !== np);
  }
  await cloudSaveNow(DB.deletedAgents, bbV73SaveTombstone(DB.deletedAgents, del));
  const agent = { id, name, pass, phone: phoneRaw ? normPhone(phoneRaw) : '', active:true, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), weekStartedAt:new Date().toISOString() };
  await bbV75PersistAgentsHard([...current, agent], 'add agent');
  state.agentDraft = { name:'', id:'', pass:'', phone:'' };
  play('success');
  toast('ເພີ່ມຕົວແທນແລ້ວ ແລະ login ໄດ້ເລີຍ');
  adminAgents();
};

toggleAgent = async function(id) {
  const raw = bbV75AgentListRaw();
  const a = raw.find(x => String(x.id) === String(id));
  if (!a || bbV73IsDeletedAgent(a)) return toast('ບໍ່ພົບຕົວແທນ');
  a.active = a.active === false;
  a.updatedAt = new Date().toISOString();
  if (a.active) { a.autoBlocked = false; a.blockReason = ''; a.weekStartedAt = new Date().toISOString(); }
  else { a.blockReason = a.blockReason || 'Admin ປິດ ID ດ້ວຍມື'; }
  await bbV75PersistAgentsHard(raw, 'toggle agent');
  if (currentAgent()?.id === a.id && a.active === false) removeKey(DB.agentSession);
  play('success');
  toast(a.active ? 'ເປີດ ID ຕົວແທນແລ້ວ' : 'ປິດ ID ຕົວແທນແລ້ວ');
  adminAgents();
};

deleteAgent = async function(id) {
  const raw = bbV75AgentListRaw();
  const a = raw.find(x => String(x.id) === String(id));
  if (!a || bbV73IsDeletedAgent(a)) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${a.name || a.id} ອອກຖາວອນ?`)) return;
  const d = bbV73ReadTombstone(DB.deletedAgents);
  d.ids.push(String(a.id));
  if (a.phone) d.phones.push(String(a.phone));
  const tomb = bbV73SaveTombstone(DB.deletedAgents, d);
  localStorage.setItem(DB.deletedAgents, JSON.stringify(tomb));
  const next = raw.filter(x => String(x.id) !== String(a.id));
  localStorage.setItem(DB.agents, JSON.stringify(bbV75CleanAgentList(next)));
  try {
    if (getCloudClient()) {
      await cloudSaveNow(DB.deletedAgents, tomb);
      await cloudSaveNow(DB.agents, bbV75CleanAgentList(next));
    }
  } catch (err) { console.warn('v75 delete agent cloud save failed', err); }
  if (currentAgent()?.id === a.id) removeKey(DB.agentSession);
  play('delete');
  toast('ລົບຕົວແທນແລ້ວ');
  adminAgents();
};

saveAgentPassword = async function(id) {
  const p1 = String($('#agentNewPass')?.value || '').trim();
  const p2 = String($('#agentNewPass2')?.value || '').trim();
  if (p1.length < 2) return toast('ລະຫັດຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  if (p1 !== p2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const raw = bbV75AgentListRaw();
  const a = raw.find(x => String(x.id) === String(id));
  if (!a || bbV73IsDeletedAgent(a)) return toast('ບໍ່ພົບຕົວແທນ');
  a.pass = p1;
  a.passwordUpdatedAt = new Date().toISOString();
  a.updatedAt = new Date().toISOString();
  await bbV75PersistAgentsHard(raw, 'agent password');
  play('success');
  toast('ປ່ຽນລະຫັດຕົວແທນແລ້ວ ໃຊ້ login ໄດ້ທັນທີ');
  closeModal();
  adminAgents();
};

bbV73FindAgentForLogin = async function(idRaw, pass) {
  const id = String(idRaw || '').trim();
  if (getCloudClient()) {
    try { await cloudLoadAll(); } catch (err) { console.warn('v75 cloud load before agent login failed', err); }
  }
  enforceAgentRules();
  const all = agents();
  const closed = bbV75AgentListRaw().find(a => String(a.id) === id && String(a.pass) === String(pass) && a.active === false && !bbV73IsDeletedAgent(a));
  if (closed) return { ...closed, __closed:true };
  return all.find(a => String(a.id) === id && String(a.pass) === String(pass) && a.active !== false) || null;
};

// Rebind agent login wrapper so closed IDs show clear message.
const bbV75BaseAuthLogin = bbAuthLogin;
bbAuthLogin = async function() {
  if ((state.authRole || 'customer') !== 'agent') return bbV75BaseAuthLogin();
  const idRaw = ($('#bb-auth-id')?.value || '').trim();
  const pass = ($('#bb-auth-pass')?.value || '').trim();
  if (!idRaw || !pass) return toast('ກະລຸນາໃສ່ Agent ID ແລະ Password');
  const btn = $('#bb-login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'ກຳລັງເຂົ້າ...'; }
  try {
    const agent = await bbV73FindAgentForLogin(idRaw, pass);
    if (agent?.__closed) { play('error'); return toast(agent.blockReason ? `Agent ID ຖືກປິດ: ${agent.blockReason}` : 'Agent ID ຖືກປິດ ກະລຸນາຕິດຕໍ່ Admin'); }
    if (!agent) { play('error'); return toast('Agent ID ຫຼື Password ບໍ່ຖືກ'); }
    setSession('agent', agent.id);
    save(ROLE_KEY, 'agent');
    state.page = 'agent';
    play('success');
    toast('ເຂົ້າສູ່ລະບົບຕົວແທນແລ້ວ');
    renderAll();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'ເຂົ້າສູ່ລະບົບ'; }
  }
};

adminCustomers = function() {
  const box = $('#adminContent');
  if (!box) return;
  const list = typeof bbV74CustomerCleanList === 'function' ? bbV74CustomerCleanList() : users();
  localStorage.setItem(DB.users, JSON.stringify(list));
  box.innerHTML = `<div class="admin-clean-head"><h3>ລາຍຊື່ລູກຄ້າ</h3><p class="muted">ກົດ “ລະຫັດ” ເພື່ອເບິ່ງ ID/ຊື່/ເບີ/ລະຫັດ ກ່ອນປ່ຽນ.</p></div><div class="order-list customer-clean-list">${list.map(u => { const st = customerStats(u.id); return `<div class="customer-row clean-customer-row"><div><b>${esc(u.name || '-')}</b><br><span class="muted">ເບີ: ${esc(u.phone || '-')}</span><br><span class="muted">ID: ${esc(u.id || '-')}</span></div><div class="customer-mini-stat"><b>${st.count}</b><br><span class="muted">ອໍເດີ</span></div><div class="customer-mini-stat"><b>${money(st.sales)}</b><br><span class="muted">ຍອດ</span></div><div class="action-row"><button type="button" class="outline" data-customer-detail="${esc(u.id)}">🔎 ລາຍລະອຽດ</button><button type="button" class="primary" data-customer-pass="${esc(u.id)}">🔐 ລະຫັດ</button><button type="button" class="danger" data-customer-delete="${esc(u.id)}">🗑 ລົບ</button></div></div>`; }).join('') || '<div class="note">ຍັງບໍ່ມີລູກຄ້າ</div>'}</div>`;
  $$('[data-customer-detail]', box).forEach(btn => btn.onclick = () => openCustomerDetail(btn.dataset.customerDetail));
  $$('[data-customer-pass]', box).forEach(btn => btn.onclick = () => openCustomerPassword(btn.dataset.customerPass));
  $$('[data-customer-delete]', box).forEach(btn => btn.onclick = () => deleteCustomer(btn.dataset.customerDelete));
  // background sync only; do not replace with loading UI, preventing flicker.
  if (!adminCustomers._syncing && getCloudClient() && typeof bbV65SyncCustomersPersistent === 'function') {
    adminCustomers._syncing = true;
    bbV65SyncCustomersPersistent().then(() => {
      adminCustomers._syncing = false;
      if (state.page === 'admin' && state.adminTab === 'customers') {
        const after = typeof bbV74CustomerCleanList === 'function' ? bbV74CustomerCleanList() : users();
        if (JSON.stringify(after.map(u => [u.id,u.phone,u.updatedAt,u.pass])) !== JSON.stringify(list.map(u => [u.id,u.phone,u.updatedAt,u.pass]))) adminCustomers();
      }
    }).catch(err => { adminCustomers._syncing = false; console.warn('v75 background customer sync failed', err); });
  }
};

Object.assign(window, { BB_V75_VERSION, adminAgents, addAgent, toggleAgent, deleteAgent, saveAgentPassword, adminCustomers, bbAuthLogin });

/* v76 admin tab stability + system optimization
   Fixes:
   - Admin agent tab no longer jumps to customers during scroll/sync.
   - Admin tabs only switch on a deliberate tap/click, not on horizontal scroll/drag.
   - Realtime/polling sync no longer re-renders the whole Admin screen while Admin is working.
   - Preserves admin tab and scroll position during background data refresh. */
const BB_V76_VERSION = 'v76 admin tab stability optimize';
const BB_V76_ADMIN_TAB_KEY = 'BB76_adminTab';
let bbV76AdminTouchMoved = false;
let bbV76AdminTouchStart = { x: 0, y: 0 };
let bbV76SyncBusy = false;
let bbV76UserInteractingUntil = 0;

function bbV76ValidAdminTab(tab) {
  return ['overview','summary','orders','products','categories','agents','customers','settings'].includes(tab);
}
function bbV76SetAdminTab(tab, opts = {}) {
  if (!bbV76ValidAdminTab(tab)) tab = 'overview';
  if (state.adminTab === tab && !opts.force) return;
  state.adminTab = tab;
  try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY, tab); } catch (err) {}
  renderAdmin();
  if (!opts.silent) play('click');
}
function bbV76RestoreAdminTab() {
  try {
    const saved = localStorage.getItem(BB_V76_ADMIN_TAB_KEY);
    if (bbV76ValidAdminTab(saved)) state.adminTab = saved;
  } catch (err) {}
  if (!bbV76ValidAdminTab(state.adminTab)) state.adminTab = 'overview';
}
function bbV76MarkInteraction() {
  bbV76UserInteractingUntil = Date.now() + 4500;
}
['touchstart','pointerdown','keydown','wheel','scroll'].forEach(evt => {
  window.addEventListener(evt, bbV76MarkInteraction, { passive: true });
});

bbV76RestoreAdminTab();

renderAdmin = function() {
  if (currentRole() !== 'admin') { $('#adminPanel').innerHTML = ''; return; }
  bbV76RestoreAdminTab();
  const tabs = ['overview', 'summary', 'orders', 'products', 'categories', 'agents', 'customers', 'settings'];
  $('#adminPanel').innerHTML = `<div class="section-head"><div><h2>Admin Dashboard</h2><p class="muted">ຈັດການຮ້ານ, ສິນຄ້າ, ອໍເດີ, ລູກຄ້າ ແລະ ຕົວແທນ</p></div><button type="button" class="danger" id="adminLogoutBtn">ອອກ</button></div><div class="staff-tabs admin-tabs-safe" id="adminTabsSafe">${tabs.map(t => `<button type="button" class="${state.adminTab === t ? 'active' : ''}" data-admin-tab="${t}">${tabName(t)}</button>`).join('')}</div><div id="adminContent" class="admin-content-safe"></div>`;
  $('#adminLogoutBtn').onclick = bbAuthLogout;
  const tabBox = $('#adminTabsSafe');
  if (tabBox) {
    tabBox.addEventListener('touchstart', e => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      bbV76AdminTouchMoved = false;
      bbV76AdminTouchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    tabBox.addEventListener('touchmove', e => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - bbV76AdminTouchStart.x) > 8 || Math.abs(t.clientY - bbV76AdminTouchStart.y) > 8) bbV76AdminTouchMoved = true;
    }, { passive: true });
  }
  $$('[data-admin-tab]', $('#adminPanel')).forEach(btn => {
    btn.onclick = (e) => {
      if (bbV76AdminTouchMoved) { e.preventDefault(); e.stopPropagation(); bbV76AdminTouchMoved = false; return; }
      e.preventDefault();
      e.stopPropagation();
      bbV76SetAdminTab(btn.dataset.adminTab);
    };
  });
  renderAdminTab(state.adminTab);
};

// Keep the current admin tab while global renders happen.
const bbV76BaseRenderAll = renderAll;
renderAll = function() {
  const wasAdmin = state.page === 'admin' && currentRole() === 'admin';
  const savedTab = wasAdmin ? state.adminTab : null;
  const savedScroll = wasAdmin ? window.scrollY : 0;
  if (wasAdmin && bbV76ValidAdminTab(savedTab)) {
    try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY, savedTab); } catch (err) {}
  }
  const out = bbV76BaseRenderAll();
  if (wasAdmin && bbV76ValidAdminTab(savedTab)) {
    state.adminTab = savedTab;
    try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY, savedTab); } catch (err) {}
    requestAnimationFrame(() => {
      if (state.page === 'admin' && currentRole() === 'admin' && bbV76ValidAdminTab(savedTab)) {
        // If a background render changed the tab, restore it without jumping the page.
        if (state.adminTab !== savedTab) {
          state.adminTab = savedTab;
          renderAdmin();
        }
        window.scrollTo({ top: savedScroll, behavior: 'auto' });
      }
    });
  }
  return out;
};

async function bbV76BackgroundSync() {
  if (bbV76SyncBusy || !getCloudClient()) return false;
  bbV76SyncBusy = true;
  try {
    const ok = await cloudLoadAll();
    return ok;
  } catch (err) {
    console.warn('v76 background sync failed', err);
    return false;
  } finally {
    bbV76SyncBusy = false;
  }
}

// Override production realtime/polling so it does not kick Admin out of the current tab.
bbProductionStartRealtime = function() {
  if (bbProductionRealtimeStarted) return;
  const client = getCloudClient();
  if (!client || typeof client.channel !== 'function') return;
  bbProductionRealtimeStarted = true;
  try {
    client.channel('bb_state_v76_stable_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bb_state' }, debounce(async () => {
        const tab = state.adminTab;
        const page = state.page;
        const ok = await bbV76BackgroundSync();
        if (!ok) return;
        if (page === 'admin' && currentRole() === 'admin') {
          state.adminTab = tab;
          try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY, tab); } catch (err) {}
          // Do not render while user is scrolling/typing. User can tap Refresh or switch tabs.
          if (Date.now() > bbV76UserInteractingUntil && state.adminTab !== 'agents') renderAdminTab(state.adminTab);
        } else {
          renderAll();
        }
      }, 1200))
      .subscribe(status => { if (status === 'SUBSCRIBED') setCloudStatus('online'); });
  } catch (err) { console.warn('v76 realtime subscribe failed', err); }
};

bbProductionStartPolling = function() {
  clearInterval(bbProductionPollTimer);
  bbProductionPollTimer = setInterval(async () => {
    if (document.hidden) return;
    const tab = state.adminTab;
    const page = state.page;
    const ok = await bbV76BackgroundSync();
    if (!ok) return;
    if (page === 'admin' && currentRole() === 'admin') {
      state.adminTab = tab;
      try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY, tab); } catch (err) {}
      if (Date.now() > bbV76UserInteractingUntil && state.adminTab !== 'agents') renderAdminTab(state.adminTab);
    } else {
      renderAll();
    }
  }, Math.max(25000, BB_PRODUCTION_SYNC_MS || 18000));
};

// Make status summary buttons use safe tab switching.
const bbV76BaseAdminOverview = adminOverview;
adminOverview = function() {
  bbV76BaseAdminOverview();
  $$('[data-v58-status]', $('#adminContent')).forEach(btn => btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); state.adminStatus = btn.dataset.v58Status; bbV76SetAdminTab('orders', { silent: true }); });
};

// Re-render Agent page without letting external async customer sync steal the tab.
const bbV76BaseAdminAgents = adminAgents;
adminAgents = function() {
  state.adminTab = 'agents';
  try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY, 'agents'); } catch (err) {}
  return bbV76BaseAdminAgents();
};

Object.assign(window, { BB_V76_VERSION, bbV76SetAdminTab, bbV76BackgroundSync });

/* v77 final agent system stabilization
   - Agent active state uses one boolean only.
   - Disabled agents render grayscale and button changes to open.
   - Delete writes tombstone + cleaned list to Supabase immediately.
   - Password change writes to Supabase immediately.
   - Admin agent tab never jumps while working. */
const BB_V77_VERSION = 'v77 final agent system';

function bbV77BoolActive(a) {
  if (!a) return true;
  if (a.active === false || a.active === 'false' || a.is_active === false || a.is_active === 'false' || a.status === 'disabled' || a.status === 'closed') return false;
  return true;
}
function bbV77NormalizeAgent(a) {
  const active = bbV77BoolActive(a);
  return {
    ...a,
    id: String(a?.id || '').trim(),
    name: String(a?.name || '').trim(),
    pass: String(a?.pass ?? a?.password ?? ''),
    phone: a?.phone ? String(a.phone).trim() : '',
    active,
    is_active: active,
    status: active ? 'active' : 'disabled',
    updatedAt: a?.updatedAt || a?.updated_at || new Date().toISOString(),
    createdAt: a?.createdAt || a?.created_at || new Date().toISOString()
  };
}
function bbV77DeletedAgentIds() {
  const d = typeof bbV73ReadTombstone === 'function' ? bbV73ReadTombstone(DB.deletedAgents) : { ids: [], phones: [] };
  return { ids: (d.ids || []).map(String), phones: (d.phones || []).map(String) };
}
function bbV77IsAgentDeleted(a) {
  const d = bbV77DeletedAgentIds();
  return !!a && ((a.id && d.ids.includes(String(a.id))) || (a.phone && d.phones.includes(String(a.phone))));
}
function bbV77CleanAgents(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(raw => {
    if (!raw || !raw.id) return;
    const a = bbV77NormalizeAgent(raw);
    if (!a.id || bbV77IsAgentDeleted(a)) return;
    const old = map.get(a.id) || {};
    // Newer updatedAt wins; merge password/status safely.
    const oldTime = Date.parse(old.updatedAt || old.createdAt || 0) || 0;
    const newTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    map.set(a.id, newTime >= oldTime ? { ...old, ...a } : { ...a, ...old });
  });
  return Array.from(map.values()).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function bbV77RawAgents() {
  try {
    const raw = JSON.parse(localStorage.getItem(DB.agents) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (err) { return []; }
}
async function bbV77PersistAgents(list, label = 'agents') {
  const clean = bbV77CleanAgents(list);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  try {
    if (getCloudClient()) await cloudSaveNow(DB.agents, clean);
    else cloudSave(DB.agents, clean);
  } catch (err) {
    console.warn('v77 persist agents failed:', label, err);
    try { cloudSave(DB.agents, clean); } catch (e) {}
  }
  return clean;
}

agents = function() { return bbV77CleanAgents(bbV77RawAgents()); };
saveAgents = function(list) {
  const clean = bbV77CleanAgents(list || []);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  if (!cloudPulling) cloudSave(DB.agents, clean);
};
bbV73PersistAgentsNow = async function(list) { return bbV77PersistAgents(list || [], 'compat persist'); };
bbV75PersistAgentsHard = async function(list, reason = 'v75 compat') { return bbV77PersistAgents(list || [], reason); };

function bbV77AgentBadge(a) {
  return bbV77BoolActive(a) ? '<span class="status good">ເປີດໃຊ້ງານ</span>' : '<span class="status bad">ປິດ ID</span>';
}
function bbV77AgentButtonLabel(a) {
  return bbV77BoolActive(a) ? 'ປິດ ID' : 'ເປີດ ID';
}
function bbV77AgentCardClass(a) {
  return bbV77BoolActive(a) ? 'agent-row' : 'agent-row agent-disabled';
}
function bbV77BindAgentButtons(root = document) {
  $$('[data-agent-toggle]', root).forEach(btn => btn.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await toggleAgent(btn.dataset.agentToggle); });
  $$('[data-agent-delete]', root).forEach(btn => btn.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await deleteAgent(btn.dataset.agentDelete); });
  $$('[data-agent-pass]', root).forEach(btn => btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openAgentPassword(btn.dataset.agentPass); });
}

adminAgents = function() {
  state.adminTab = 'agents';
  try { localStorage.setItem(BB_V76_ADMIN_TAB_KEY || 'BB76_adminTab', 'agents'); } catch (err) {}
  enforceAgentRules();
  const d = state.agentDraft || {};
  const list = agents();
  const rows = list.map(a => {
    const st = agentStats(a.id);
    const rule = agentRuleStatus(a);
    const active = bbV77BoolActive(a);
    return `<div class="${bbV77AgentCardClass(a)}" data-agent-card="${esc(a.id)}">
      <div><b>${esc(a.name || '-')}</b> ${bbV77AgentBadge(a)}<br>
        <span class="muted">ID: ${esc(a.id)} · ເບີ: ${esc(a.phone || '-')}</span><br>
        <span class="muted">Password: <b>${esc(a.pass || '-')}</b></span>
        ${!active ? '<br><span class="muted">ສະຖານະ: ປິດໄອດີແລ້ວ ຕົວແທນ login ບໍ່ໄດ້</span>' : ''}
        ${a.blockReason ? `<br><span class="muted">${esc(a.blockReason)}</span>` : ''}
      </div>
      <div>ອໍເດີທັງໝົດ: <b>${st.count}</b><br><span class="muted">ອາທິດນີ້: ${rule.count}/${rule.min}</span></div>
      <div>${money(st.sales)}<br><span class="muted">ເຫຼືອ ${rule.daysLeft} ມື້${rule.selfCount ? ` · self ${rule.selfCount}` : ''}</span></div>
      <div class="action-row">
        <button type="button" class="outline" data-agent-pass="${esc(a.id)}">🔐 ປ່ຽນລະຫັດ</button>
        <button type="button" class="${active ? 'outline' : 'success'}" data-agent-toggle="${esc(a.id)}">${bbV77AgentButtonLabel(a)}</button>
        <button type="button" class="danger" data-agent-delete="${esc(a.id)}">🗑 ລົບ</button>
      </div>
    </div>`;
  }).join('');
  $('#adminContent').innerHTML = `<div class="auth-card"><h3>ເພີ່ມຕົວແທນ</h3><div class="prod-manage"><input id="agentNameNew" placeholder="ຊື່" value="${esc(d.name || '')}"><input id="agentIdNew" placeholder="Agent ID" value="${esc(d.id || '')}"><input id="agentPassNew" placeholder="Password" value="${esc(d.pass || '')}"><input id="agentPhoneNew" placeholder="ເບີໂທ" value="${esc(d.phone || '')}"><button type="button" class="success" id="addAgentBtn">ເພີ່ມຕົວແທນ</button></div><p class="muted">ພິມແລ້ວຂໍ້ມູນຈະບໍ່ຫາຍ. ປິດ ID = ກາດຈະເປັນຂາວດຳ ແລະ login ບໍ່ໄດ້.</p></div><h3>ລາຍຊື່ຕົວແທນ</h3><div class="order-list agent-clean-list">${rows || '<div class="note">ຍັງບໍ່ມີຕົວແທນ</div>'}</div>`;
  $('#addAgentBtn').onclick = addAgent;
  bbV73BindAgentDraft();
  bbV77BindAgentButtons($('#adminContent'));
};

addAgent = async function() {
  bbV73CaptureAgentDraft();
  const draft = state.agentDraft || {};
  const id = String(draft.id || '').trim();
  const name = String(draft.name || '').trim();
  const pass = String(draft.pass || '').trim();
  const phone = String(draft.phone || '').trim();
  if (!id || !name || !pass) return toast('ກອກຊື່, Agent ID, Password ໃຫ້ຄົບ');
  if (pass.length < 2) return toast('Password ຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  const current = agents();
  if (current.some(a => String(a.id).toLowerCase() === id.toLowerCase())) return toast('Agent ID ຊ້ຳ');
  const del = bbV73ReadTombstone(DB.deletedAgents);
  del.ids = (del.ids || []).filter(x => String(x).toLowerCase() !== id.toLowerCase());
  const np = phone ? normPhone(phone) : '';
  if (np) del.phones = (del.phones || []).filter(x => String(x) !== np);
  const tomb = bbV73SaveTombstone(DB.deletedAgents, del);
  try { if (getCloudClient()) await cloudSaveNow(DB.deletedAgents, tomb); } catch (err) { console.warn('v77 save tomb after add failed', err); }
  const now = new Date().toISOString();
  const agent = { id, name, pass, password: pass, phone: np, active: true, is_active: true, status: 'active', createdAt: now, updatedAt: now, weekStartedAt: now };
  await bbV77PersistAgents([...current, agent], 'add agent');
  state.agentDraft = { name:'', id:'', pass:'', phone:'' };
  play('success');
  toast('ເພີ່ມຕົວແທນແລ້ວ');
  adminAgents();
};

toggleAgent = async function(id) {
  const raw = bbV77RawAgents();
  let found = false;
  const next = raw.map(item => {
    if (!item || String(item.id) !== String(id)) return item;
    found = true;
    const active = !bbV77BoolActive(item);
    return bbV77NormalizeAgent({
      ...item,
      active,
      is_active: active,
      status: active ? 'active' : 'disabled',
      blockReason: active ? '' : (item.blockReason || 'Admin ປິດ ID ດ້ວຍມື'),
      autoBlocked: active ? false : item.autoBlocked,
      weekStartedAt: active ? new Date().toISOString() : item.weekStartedAt,
      updatedAt: new Date().toISOString()
    });
  });
  if (!found) return toast('ບໍ່ພົບຕົວແທນ');
  const clean = await bbV77PersistAgents(next, 'toggle agent');
  const a = clean.find(x => String(x.id) === String(id));
  if (currentAgent()?.id === id && !bbV77BoolActive(a)) removeKey(DB.agentSession);
  play('success');
  toast(bbV77BoolActive(a) ? 'ເປີດ ID ຕົວແທນແລ້ວ' : 'ປິດ ID ຕົວແທນແລ້ວ');
  adminAgents();
};

deleteAgent = async function(id) {
  const raw = bbV77RawAgents();
  const a = raw.find(x => x && String(x.id) === String(id));
  if (!a || bbV77IsAgentDeleted(a)) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${a.name || a.id} ອອກຖາວອນ?`)) return;
  const d = bbV73ReadTombstone(DB.deletedAgents);
  d.ids.push(String(a.id));
  if (a.phone) d.phones.push(String(a.phone));
  const tomb = bbV73SaveTombstone(DB.deletedAgents, d);
  const next = raw.filter(x => !x || String(x.id) !== String(a.id));
  localStorage.setItem(DB.deletedAgents, JSON.stringify(tomb));
  localStorage.setItem(DB.agents, JSON.stringify(bbV77CleanAgents(next)));
  try {
    if (getCloudClient()) {
      await cloudSaveNow(DB.deletedAgents, tomb);
      await cloudSaveNow(DB.agents, bbV77CleanAgents(next));
    }
  } catch (err) { console.warn('v77 delete agent cloud save failed', err); }
  if (currentAgent()?.id === a.id) removeKey(DB.agentSession);
  play('delete');
  toast('ລົບຕົວແທນແລ້ວ');
  adminAgents();
};

saveAgentPassword = async function(id) {
  const p1 = String($('#agentNewPass')?.value || '').trim();
  const p2 = String($('#agentNewPass2')?.value || '').trim();
  if (p1.length < 2) return toast('ລະຫັດຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  if (p1 !== p2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const raw = bbV77RawAgents();
  let found = false;
  const next = raw.map(item => {
    if (!item || String(item.id) !== String(id)) return item;
    found = true;
    return bbV77NormalizeAgent({ ...item, pass: p1, password: p1, passwordUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  if (!found) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV77PersistAgents(next, 'agent password');
  play('success');
  toast('ປ່ຽນລະຫັດຕົວແທນແລ້ວ');
  closeModal();
  adminAgents();
};

// Make agent login use normalized active/pass data.
bbV73FindAgentForLogin = async function(idRaw, pass) {
  const id = String(idRaw || '').trim();
  if (getCloudClient()) {
    try { await cloudLoadAll(); } catch (err) { console.warn('v77 cloud load before agent login failed', err); }
  }
  enforceAgentRules();
  const raw = bbV77RawAgents().map(bbV77NormalizeAgent).filter(a => !bbV77IsAgentDeleted(a));
  const closed = raw.find(a => String(a.id) === id && String(a.pass) === String(pass) && !bbV77BoolActive(a));
  if (closed) return { ...closed, __closed: true };
  return raw.find(a => String(a.id) === id && String(a.pass) === String(pass) && bbV77BoolActive(a)) || null;
};

// One-time cleanup on load: normalize active/is_active/status so UI and login match.
setTimeout(async () => {
  try {
    await bbV77PersistAgents(bbV77RawAgents(), 'startup normalize');
    if (state.page === 'admin' && state.adminTab === 'agents') adminAgents();
  } catch (err) { console.warn('v77 startup normalize failed', err); }
}, 1200);

Object.assign(window, { BB_V77_VERSION, bbV77PersistAgents, bbV77NormalizeAgent, bbV77BoolActive });

/* v78 true Supabase agents table bridge
   - Keeps old bb_state cache, but also writes agents to public.agents.
   - Fixes delete/toggle/password/login when bb_state and agents table drift.
   - Requires supabase-agent-v78.sql once. */
const BB_V78_VERSION = 'v78 true agents table bridge';

function bbV78Client() { return getCloudClient ? getCloudClient() : null; }
function bbV78AgentRowToApp(row) {
  if (!row) return null;
  const code = String(row.agent_code || row.code || row.agent_id || '').trim();
  if (!code) return null;
  const active = !(row.is_active === false || row.is_active === 'false' || row.status === 'disabled' || row.status === 'closed');
  return bbV77NormalizeAgent({
    id: code,
    name: row.name || code,
    phone: row.phone || '',
    pass: row.password || row.pass || '',
    password: row.password || row.pass || '',
    active,
    is_active: active,
    status: active ? 'active' : 'disabled',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    tableUuid: row.id || row.uuid || ''
  });
}
function bbV78AgentAppToRow(a) {
  const n = bbV77NormalizeAgent(a);
  return {
    agent_code: n.id,
    name: n.name || n.id,
    phone: n.phone || null,
    password: String(n.pass || ''),
    is_active: bbV77BoolActive(n),
    updated_at: new Date().toISOString()
  };
}
function bbV78MergeAgentLists(localList, tableList) {
  const map = new Map();
  [...(Array.isArray(localList) ? localList : []), ...(Array.isArray(tableList) ? tableList : [])].forEach(item => {
    const a = bbV77NormalizeAgent(item);
    if (!a.id || bbV77IsAgentDeleted(a)) return;
    const old = map.get(String(a.id).toLowerCase());
    if (!old) { map.set(String(a.id).toLowerCase(), a); return; }
    const oldTime = Date.parse(old.updatedAt || old.createdAt || 0) || 0;
    const newTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    map.set(String(a.id).toLowerCase(), newTime >= oldTime ? { ...old, ...a } : { ...a, ...old });
  });
  return bbV77CleanAgents(Array.from(map.values()));
}
async function bbV78LoadAgentsTable() {
  const client = bbV78Client();
  if (!client) return agents();
  try {
    const { data, error } = await client
      .from('agents')
      .select('id,agent_code,name,phone,password,is_active,created_at,updated_at');
    if (error) throw error;
    const fromTable = (data || []).map(bbV78AgentRowToApp).filter(Boolean);
    if (!fromTable.length) return agents();
    const merged = bbV78MergeAgentLists(agents(), fromTable);
    localStorage.setItem(DB.agents, JSON.stringify(merged));
    await cloudSaveNow(DB.agents, merged);
    return merged;
  } catch (err) {
    console.warn('v78 load agents table failed. Run supabase-agent-v78.sql if needed.', err);
    return agents();
  }
}
async function bbV78UpsertAgentTable(agent) {
  const client = bbV78Client();
  if (!client || !agent || !agent.id) return false;
  try {
    const { error } = await client
      .from('agents')
      .upsert(bbV78AgentAppToRow(agent), { onConflict: 'agent_code' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('v78 upsert agent table failed', err);
    return false;
  }
}
async function bbV78DeleteAgentTable(agent) {
  const client = bbV78Client();
  if (!client || !agent) return false;
  try {
    let query = client.from('agents').delete().eq('agent_code', String(agent.id));
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('v78 delete by agent_code failed, trying phone', err);
    try {
      if (agent.phone) {
        const { error } = await client.from('agents').delete().eq('phone', String(agent.phone));
        if (error) throw error;
        return true;
      }
    } catch (err2) { console.warn('v78 delete by phone failed', err2); }
    return false;
  }
}
async function bbV78UpdateAgentTable(id, patch) {
  const client = bbV78Client();
  if (!client || !id) return false;
  try {
    const { error } = await client.from('agents').update({ ...patch, updated_at: new Date().toISOString() }).eq('agent_code', String(id));
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('v78 update agent table failed', err);
    return false;
  }
}
async function bbV78PersistAgentsEverywhere(list, label = 'v78 agents') {
  const clean = await bbV77PersistAgents(list, label);
  for (const a of clean) await bbV78UpsertAgentTable(a);
  return clean;
}

const bbV78BaseAdminAgents = adminAgents;
adminAgents = function() {
  if (state) state.adminTab = 'agents';
  bbV78BaseAdminAgents();
  // Pull table data after first paint, then repaint once if needed. This avoids scroll/form jumping.
  setTimeout(async () => {
    if (!state || state.page !== 'admin' || state.adminTab !== 'agents') return;
    if (Date.now && typeof bbV76UserInteractingUntil !== 'undefined' && Date.now() < bbV76UserInteractingUntil) return;
    const before = JSON.stringify(agents().map(a => [a.id, a.pass, a.active, a.phone]));
    await bbV78LoadAgentsTable();
    const after = JSON.stringify(agents().map(a => [a.id, a.pass, a.active, a.phone]));
    if (before !== after && state.page === 'admin' && state.adminTab === 'agents') bbV78BaseAdminAgents();
  }, 500);
};

addAgent = async function() {
  bbV73CaptureAgentDraft();
  const draft = state.agentDraft || {};
  const id = String(draft.id || '').trim();
  const name = String(draft.name || '').trim();
  const pass = String(draft.pass || '').trim();
  const phone = String(draft.phone || '').trim();
  if (!id || !name || !pass) return toast('ກອກຊື່, Agent ID, Password ໃຫ້ຄົບ');
  if (pass.length < 2) return toast('Password ຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  await bbV78LoadAgentsTable();
  const current = agents();
  if (current.some(a => String(a.id).toLowerCase() === id.toLowerCase())) return toast('Agent ID ຊ້ຳ');
  const np = phone ? normPhone(phone) : '';
  const del = bbV73ReadTombstone(DB.deletedAgents);
  del.ids = (del.ids || []).filter(x => String(x).toLowerCase() !== id.toLowerCase());
  if (np) del.phones = (del.phones || []).filter(x => String(x) !== np);
  const tomb = bbV73SaveTombstone(DB.deletedAgents, del);
  try { if (getCloudClient()) await cloudSaveNow(DB.deletedAgents, tomb); } catch (err) {}
  const now = new Date().toISOString();
  const agent = { id, name, pass, password: pass, phone: np, active: true, is_active: true, status: 'active', createdAt: now, updatedAt: now, weekStartedAt: now };
  const savedTable = await bbV78UpsertAgentTable(agent);
  await bbV78PersistAgentsEverywhere([...current, agent], 'v78 add agent');
  state.agentDraft = { name:'', id:'', pass:'', phone:'' };
  play('success');
  toast(savedTable ? 'ເພີ່ມຕົວແທນແລ້ວ ແລະ sync ກັບ Supabase' : 'ເພີ່ມແລ້ວ ແຕ່ກວດ SQL agents table ອີກຄັ້ງ');
  adminAgents();
};

toggleAgent = async function(id) {
  await bbV78LoadAgentsTable();
  const raw = bbV77RawAgents();
  let found = false;
  let nextAgent = null;
  const next = raw.map(item => {
    if (!item || String(item.id) !== String(id)) return item;
    found = true;
    const active = !bbV77BoolActive(item);
    nextAgent = bbV77NormalizeAgent({
      ...item,
      active,
      is_active: active,
      status: active ? 'active' : 'disabled',
      blockReason: active ? '' : (item.blockReason || 'Admin ປິດ ID ດ້ວຍມື'),
      autoBlocked: active ? false : item.autoBlocked,
      weekStartedAt: active ? new Date().toISOString() : item.weekStartedAt,
      updatedAt: new Date().toISOString()
    });
    return nextAgent;
  });
  if (!found || !nextAgent) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV78UpdateAgentTable(nextAgent.id, { is_active: bbV77BoolActive(nextAgent), password: nextAgent.pass || '', name: nextAgent.name || nextAgent.id, phone: nextAgent.phone || null });
  await bbV78PersistAgentsEverywhere(next, 'v78 toggle agent');
  if (currentAgent()?.id === id && !bbV77BoolActive(nextAgent)) removeKey(DB.agentSession);
  play('success');
  toast(bbV77BoolActive(nextAgent) ? 'ເປີດ ID ຕົວແທນແລ້ວ' : 'ປິດ ID ຕົວແທນແລ້ວ');
  adminAgents();
};

deleteAgent = async function(id) {
  await bbV78LoadAgentsTable();
  const raw = bbV77RawAgents();
  const a = raw.find(x => x && String(x.id) === String(id));
  if (!a || bbV77IsAgentDeleted(a)) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${a.name || a.id} ອອກຖາວອນ?`)) return;
  await bbV78DeleteAgentTable(a);
  const d = bbV73ReadTombstone(DB.deletedAgents);
  d.ids.push(String(a.id));
  if (a.phone) d.phones.push(String(a.phone));
  const tomb = bbV73SaveTombstone(DB.deletedAgents, d);
  const next = raw.filter(x => !x || String(x.id) !== String(a.id));
  localStorage.setItem(DB.deletedAgents, JSON.stringify(tomb));
  await bbV78PersistAgentsEverywhere(next, 'v78 delete agent');
  try { if (getCloudClient()) await cloudSaveNow(DB.deletedAgents, tomb); } catch (err) {}
  if (currentAgent()?.id === a.id) removeKey(DB.agentSession);
  play('delete');
  toast('ລົບຕົວແທນແລ້ວ');
  adminAgents();
};

saveAgentPassword = async function(id) {
  const p1 = String($('#agentNewPass')?.value || '').trim();
  const p2 = String($('#agentNewPass2')?.value || '').trim();
  if (p1.length < 2) return toast('ລະຫັດຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  if (p1 !== p2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  await bbV78LoadAgentsTable();
  const raw = bbV77RawAgents();
  let found = false;
  const next = raw.map(item => {
    if (!item || String(item.id) !== String(id)) return item;
    found = true;
    return bbV77NormalizeAgent({ ...item, pass: p1, password: p1, passwordUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  if (!found) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV78UpdateAgentTable(id, { password: p1 });
  await bbV78PersistAgentsEverywhere(next, 'v78 agent password');
  play('success');
  toast('ປ່ຽນລະຫັດຕົວແທນແລ້ວ');
  closeModal();
  adminAgents();
};

bbV73FindAgentForLogin = async function(idRaw, pass) {
  const id = String(idRaw || '').trim();
  if (getCloudClient()) {
    try { await cloudLoadAll(); await bbV78LoadAgentsTable(); } catch (err) { console.warn('v78 cloud/table load before agent login failed', err); }
  }
  enforceAgentRules();
  const raw = bbV77RawAgents().map(bbV77NormalizeAgent).filter(a => !bbV77IsAgentDeleted(a));
  const closed = raw.find(a => String(a.id) === id && String(a.pass) === String(pass) && !bbV77BoolActive(a));
  if (closed) return { ...closed, __closed: true };
  return raw.find(a => String(a.id) === id && String(a.pass) === String(pass) && bbV77BoolActive(a)) || null;
};

setTimeout(async () => {
  try {
    const local = agents();
    for (const a of local) await bbV78UpsertAgentTable(a);
    await bbV78LoadAgentsTable();
    if (state.page === 'admin' && state.adminTab === 'agents') adminAgents();
  } catch (err) { console.warn('v78 startup agent bridge failed', err); }
}, 1600);

Object.assign(window, { BB_V78_VERSION, bbV78LoadAgentsTable, bbV78UpsertAgentTable, bbV78DeleteAgentTable, addAgent, toggleAgent, deleteAgent, saveAgentPassword, adminAgents });

/* ===== V79: hard fix for real public.agents table sync =====
   Important: run supabase-agent-v79.sql once so public.agents has agent_code + RLS policy.
   This patch makes agent create/toggle/delete/password/login use the real Supabase agents table first,
   while keeping bb_state/localStorage only as offline cache. */
const BB_V79_VERSION = 'v79 real agents table persistence fix';

function bbV79Client() { return typeof getCloudClient === 'function' ? getCloudClient() : null; }
function bbV79NormPhone(v) { return typeof normPhone === 'function' ? normPhone(v || '') : String(v || '').replace(/\D/g, ''); }
function bbV79AgentKey(a) { return String(a?.id || a?.agent_code || a?.agent_id || a?.code || '').trim(); }
function bbV79RowToAgent(row) {
  if (!row) return null;
  const code = String(row.agent_code || row.agent_id || row.code || '').trim();
  if (!code) return null;
  const active = !(row.is_active === false || row.is_active === 'false' || row.active === false || row.status === 'disabled' || row.status === 'closed');
  return bbV77NormalizeAgent({
    id: code,
    name: row.name || code,
    phone: row.phone || '',
    pass: row.password || row.pass || '',
    password: row.password || row.pass || '',
    active,
    is_active: active,
    status: active ? 'active' : 'disabled',
    tableUuid: row.id || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  });
}
function bbV79AgentToRow(agent) {
  const a = bbV77NormalizeAgent(agent || {});
  const code = bbV79AgentKey(a);
  return {
    agent_code: code,
    name: a.name || code,
    phone: a.phone ? bbV79NormPhone(a.phone) : null,
    password: String(a.pass || a.password || ''),
    is_active: bbV77BoolActive(a),
    updated_at: new Date().toISOString()
  };
}
function bbV79MergeAgents(...lists) {
  const map = new Map();
  lists.flat().filter(Boolean).forEach(raw => {
    const a = bbV77NormalizeAgent(raw);
    const key = bbV79AgentKey(a).toLowerCase();
    if (!key || bbV77IsAgentDeleted(a)) return;
    const old = map.get(key);
    if (!old) { map.set(key, a); return; }
    const oldTime = Date.parse(old.updatedAt || old.createdAt || 0) || 0;
    const newTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    map.set(key, newTime >= oldTime ? { ...old, ...a } : { ...a, ...old });
  });
  return bbV77CleanAgents(Array.from(map.values()));
}
async function bbV79LoadAgentsTable() {
  const client = bbV79Client();
  const local = typeof agents === 'function' ? agents() : [];
  if (!client) return local;
  try {
    const { data, error } = await client.from('agents').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const tableAgents = (data || []).map(bbV79RowToAgent).filter(Boolean);
    const merged = bbV79MergeAgents(local, tableAgents);
    localStorage.setItem(DB.agents, JSON.stringify(merged));
    if (typeof cloudSaveNow === 'function') await cloudSaveNow(DB.agents, merged);
    return merged;
  } catch (err) {
    console.warn('v79 load agents table failed. Run supabase-agent-v79.sql once.', err);
    return local;
  }
}
async function bbV79UpsertAgentTable(agent) {
  const client = bbV79Client();
  if (!client) return false;
  const row = bbV79AgentToRow(agent);
  if (!row.agent_code) return false;
  try {
    const { error } = await client.from('agents').upsert(row, { onConflict: 'agent_code' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('v79 upsert public.agents failed. Run supabase-agent-v79.sql.', err);
    return false;
  }
}
async function bbV79DeleteAgentTable(agent) {
  const client = bbV79Client();
  if (!client || !agent) return false;
  const code = bbV79AgentKey(agent);
  const phone = agent.phone ? bbV79NormPhone(agent.phone) : '';
  try {
    let ok = false;
    if (code) {
      const { error } = await client.from('agents').delete().eq('agent_code', code);
      if (error) throw error;
      ok = true;
    }
    if (phone) {
      const { error } = await client.from('agents').delete().eq('phone', phone);
      if (error) throw error;
      ok = true;
    }
    return ok;
  } catch (err) {
    console.error('v79 delete public.agents failed', err);
    return false;
  }
}
async function bbV79PersistAgentsEverywhere(list, label = 'v79 agents') {
  const clean = bbV79MergeAgents(list || []);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  if (typeof cloudSaveNow === 'function') await cloudSaveNow(DB.agents, clean);
  for (const a of clean) await bbV79UpsertAgentTable(a);
  return clean;
}

adminAgents = function() {
  if (state) state.adminTab = 'agents';
  const box = document.querySelector('#adminContent');
  if (!box) return;
  const list = agents();
  const d = state.agentDraft || { name:'', id:'', pass:'', phone:'' };
  box.innerHTML = `<div class="admin-clean-head"><h3>ຈັດການຕົວແທນ</h3><p class="muted">ຂໍ້ມູນນີ້ sync ກັບ Supabase table <b>agents</b>. ຖ້າຕາຕະລາງຍັງວ່າງ ໃຫ້ Run <b>supabase-agent-v79.sql</b>.</p></div>
  <div class="auth-card agent-form-stable"><h3>ເພີ່ມຕົວແທນ</h3><div class="form-grid">
    <input id="agentNameNew" placeholder="ຊື່ຕົວແທນ" value="${esc(d.name || '')}">
    <input id="agentIdNew" placeholder="Agent ID" value="${esc(d.id || '')}">
    <input id="agentPassNew" placeholder="Password" value="${esc(d.pass || '')}">
    <input id="agentPhoneNew" placeholder="ເບີໂທ" value="${esc(d.phone || '')}">
  </div><button type="button" class="success full" id="addAgentBtn">+ ເພີ່ມຕົວແທນ</button></div>
  <div class="order-list agent-clean-list">${list.map(a => {
    const active = bbV77BoolActive(a);
    return `<div class="${active ? 'agent-row' : 'agent-row agent-disabled'}" data-agent-card="${esc(a.id)}">
      <div><b>${esc(a.name || '-')}</b> ${active ? '<span class="status good">ເປີດໃຊ້ງານ</span>' : '<span class="status bad">ປິດ ID</span>'}<br><span class="muted">ID: ${esc(a.id || '-')} · ເບີ: ${esc(a.phone || '-')}</span><br><span class="muted">Password: <b>${esc(a.pass || a.password || '-')}</b></span></div>
      <div class="action-row"><button type="button" class="outline" data-agent-pass="${esc(a.id)}">🔐 ປ່ຽນລະຫັດ</button><button type="button" class="${active ? 'outline' : 'success'}" data-agent-toggle="${esc(a.id)}">${active ? 'ປິດ ID' : 'ເປີດ ID'}</button><button type="button" class="danger" data-agent-delete="${esc(a.id)}">🗑 ລົບ</button></div>
    </div>`;
  }).join('') || '<div class="note">ຍັງບໍ່ມີຕົວແທນ</div>'}</div>`;
  if (typeof bbV73BindAgentDraft === 'function') bbV73BindAgentDraft();
  const addBtn = document.querySelector('#addAgentBtn');
  if (addBtn) addBtn.onclick = addAgent;
  document.querySelectorAll('[data-agent-toggle]').forEach(btn => btn.onclick = () => toggleAgent(btn.dataset.agentToggle));
  document.querySelectorAll('[data-agent-delete]').forEach(btn => btn.onclick = () => deleteAgent(btn.dataset.agentDelete));
  document.querySelectorAll('[data-agent-pass]').forEach(btn => btn.onclick = () => openAgentPassword(btn.dataset.agentPass));
  setTimeout(async () => {
    if (!state || state.page !== 'admin' || state.adminTab !== 'agents') return;
    const before = JSON.stringify(agents().map(a => [a.id,a.pass,a.active,a.phone]));
    await bbV79LoadAgentsTable();
    const after = JSON.stringify(agents().map(a => [a.id,a.pass,a.active,a.phone]));
    if (before !== after && state.page === 'admin' && state.adminTab === 'agents') adminAgents();
  }, 700);
};

addAgent = async function() {
  if (typeof bbV73CaptureAgentDraft === 'function') bbV73CaptureAgentDraft();
  const draft = state.agentDraft || {};
  const id = String(draft.id || '').trim();
  const name = String(draft.name || '').trim();
  const pass = String(draft.pass || '').trim();
  const phone = draft.phone ? bbV79NormPhone(draft.phone) : '';
  if (!id || !name || !pass) return toast('ກອກຊື່, Agent ID, Password ໃຫ້ຄົບ');
  if (pass.length < 2) return toast('Password ຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  const current = await bbV79LoadAgentsTable();
  if (current.some(a => String(a.id).toLowerCase() === id.toLowerCase())) return toast('Agent ID ຊ້ຳ');
  if (phone && current.some(a => bbV79NormPhone(a.phone) === phone)) return toast('ເບີຕົວແທນຊ້ຳ');
  const del = bbV73ReadTombstone(DB.deletedAgents);
  del.ids = (del.ids || []).filter(x => String(x).toLowerCase() !== id.toLowerCase());
  if (phone) del.phones = (del.phones || []).filter(x => bbV79NormPhone(x) !== phone);
  const tomb = bbV73SaveTombstone(DB.deletedAgents, del);
  if (typeof cloudSaveNow === 'function') await cloudSaveNow(DB.deletedAgents, tomb);
  const now = new Date().toISOString();
  const agent = { id, name, pass, password: pass, phone, active: true, is_active: true, status: 'active', createdAt: now, updatedAt: now, weekStartedAt: now };
  const tableOK = await bbV79UpsertAgentTable(agent);
  await bbV79PersistAgentsEverywhere([...current, agent], 'v79 add agent');
  state.agentDraft = { name:'', id:'', pass:'', phone:'' };
  play('success');
  toast(tableOK ? 'ເພີ່ມຕົວແທນແລ້ວ' : 'ເພີ່ມໃນ cache ແລ້ວ ແຕ່ກວດ SQL v79 ກ່ອນ');
  adminAgents();
};

toggleAgent = async function(id) {
  const current = await bbV79LoadAgentsTable();
  let target = null;
  const next = current.map(a => {
    if (String(a.id) !== String(id)) return a;
    const active = !bbV77BoolActive(a);
    target = bbV77NormalizeAgent({ ...a, active, is_active: active, status: active ? 'active' : 'disabled', blockReason: active ? '' : (a.blockReason || 'Admin ປິດ ID'), updatedAt: new Date().toISOString() });
    return target;
  });
  if (!target) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV79UpsertAgentTable(target);
  await bbV79PersistAgentsEverywhere(next, 'v79 toggle agent');
  if (currentAgent()?.id === id && !bbV77BoolActive(target)) removeKey(DB.agentSession);
  toast(bbV77BoolActive(target) ? 'ເປີດ ID ຕົວແທນແລ້ວ' : 'ປິດ ID ຕົວແທນແລ້ວ');
  adminAgents();
};

deleteAgent = async function(id) {
  const current = await bbV79LoadAgentsTable();
  const target = current.find(a => String(a.id) === String(id));
  if (!target) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${target.name || target.id} ຖາວອນ?`)) return;
  const tableOK = await bbV79DeleteAgentTable(target);
  const d = bbV73ReadTombstone(DB.deletedAgents);
  d.ids.push(String(target.id));
  if (target.phone) d.phones.push(String(target.phone));
  const tomb = bbV73SaveTombstone(DB.deletedAgents, d);
  const next = current.filter(a => String(a.id) !== String(target.id));
  localStorage.setItem(DB.deletedAgents, JSON.stringify(tomb));
  if (typeof cloudSaveNow === 'function') await cloudSaveNow(DB.deletedAgents, tomb);
  await bbV79PersistAgentsEverywhere(next, 'v79 delete agent');
  if (currentAgent()?.id === target.id) removeKey(DB.agentSession);
  play('delete');
  toast(tableOK ? 'ລົບຕົວແທນແລ້ວ' : 'ລົບອອກຈາກເວັບແລ້ວ ແຕ່ກວດ SQL v79/RLS');
  adminAgents();
};

saveAgentPassword = async function(id) {
  const p1 = String(document.querySelector('#agentNewPass')?.value || '').trim();
  const p2 = String(document.querySelector('#agentNewPass2')?.value || '').trim();
  if (p1.length < 2) return toast('ລະຫັດຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  if (p1 !== p2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const current = await bbV79LoadAgentsTable();
  let target = null;
  const next = current.map(a => {
    if (String(a.id) !== String(id)) return a;
    target = bbV77NormalizeAgent({ ...a, pass: p1, password: p1, passwordUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return target;
  });
  if (!target) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV79UpsertAgentTable(target);
  await bbV79PersistAgentsEverywhere(next, 'v79 password agent');
  toast('ປ່ຽນລະຫັດຕົວແທນແລ້ວ');
  closeModal();
  adminAgents();
};

bbV73FindAgentForLogin = async function(idRaw, pass) {
  const id = String(idRaw || '').trim();
  if (bbV79Client()) {
    try { await bbV79LoadAgentsTable(); } catch (err) { console.warn('v79 load before login skipped', err); }
  }
  const list = bbV79MergeAgents(agents()).filter(a => !bbV77IsAgentDeleted(a));
  const found = list.find(a => String(a.id) === id && String(a.pass) === String(pass));
  if (!found) return null;
  return bbV77BoolActive(found) ? found : { ...found, active: false };
};

setTimeout(async () => {
  try {
    await bbV79LoadAgentsTable();
    const list = agents();
    for (const a of list) await bbV79UpsertAgentTable(a);
    if (state.page === 'admin' && state.adminTab === 'agents') adminAgents();
  } catch (err) { console.warn('v79 startup agent sync skipped', err); }
}, 1800);

Object.assign(window, { BB_V79_VERSION, bbV79LoadAgentsTable, bbV79UpsertAgentTable, bbV79DeleteAgentTable, addAgent, toggleAgent, deleteAgent, saveAgentPassword, adminAgents });

/* ===== V80: final stable agent source of truth =====
   This patch stops agent delete/toggle/login from depending on older merge code.
   Source of truth: public.bb_state key BB4_agents + deleted tombstone.
   public.agents is mirrored for Table Editor visibility when possible. */
const BB_V80_VERSION = 'v80 stable agent exact sync';

function bbV80Client(){ return (typeof getCloudClient === 'function') ? getCloudClient() : null; }
function bbV80Tomb(){
  try { return bbV73ReadTombstone(DB.deletedAgents); }
  catch(e){ return {ids:[], phones:[], names:[]}; }
}
function bbV80NormPhone(v){
  try { return normPhone(v || ''); } catch(e) { return String(v || '').replace(/\D/g,''); }
}
function bbV80AgentId(a){ return String(a?.id || a?.agent_code || a?.agent_id || a?.code || '').trim(); }
function bbV80Active(a){ return !(a?.active === false || a?.active === 'false' || a?.is_active === false || a?.is_active === 'false' || a?.status === 'disabled' || a?.status === 'closed'); }
function bbV80NormalizeAgent(a){
  const id = bbV80AgentId(a);
  const active = bbV80Active(a);
  return {
    ...a,
    id,
    name: String(a?.name || id || 'Agent').replace(/^\[[^\]]+\]\s*/, '').trim() || id || 'Agent',
    phone: a?.phone ? bbV80NormPhone(a.phone) : '',
    pass: String(a?.pass ?? a?.password ?? ''),
    password: String(a?.password ?? a?.pass ?? ''),
    active,
    is_active: active,
    status: active ? 'active' : 'disabled',
    createdAt: a?.createdAt || a?.created_at || new Date().toISOString(),
    updatedAt: a?.updatedAt || a?.updated_at || new Date().toISOString()
  };
}
function bbV80IsDeleted(a){
  const d = bbV80Tomb();
  const id = bbV80AgentId(a);
  const phone = a?.phone ? bbV80NormPhone(a.phone) : '';
  return !!((id && (d.ids || []).map(String).includes(id)) || (phone && (d.phones || []).map(String).includes(phone)));
}
function bbV80CleanAgents(list){
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(raw => {
    const a = bbV80NormalizeAgent(raw);
    if (!a.id || bbV80IsDeleted(a)) return;
    const key = a.id.toLowerCase();
    const old = map.get(key);
    if (!old) { map.set(key, a); return; }
    const ot = Date.parse(old.updatedAt || old.createdAt || 0) || 0;
    const nt = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    map.set(key, nt >= ot ? {...old, ...a} : {...a, ...old});
  });
  return Array.from(map.values()).sort((a,b)=>String(a.name || a.id).localeCompare(String(b.name || b.id)));
}
async function bbV80LoadStateKey(key, fallback){
  const client = bbV80Client();
  if (!client) return fallback;
  try {
    const { data, error } = await client.from('bb_state').select('data').eq('key', key).maybeSingle();
    if (error) throw error;
    return data ? data.data : fallback;
  } catch(e){ console.warn('v80 load state failed', key, e); return fallback; }
}
async function bbV80SaveStateKey(key, data){
  const client = bbV80Client();
  if (!client) return false;
  try {
    const { error } = await client.from('bb_state').upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return true;
  } catch(e){ console.warn('v80 save state failed', key, e); return false; }
}
async function bbV80LoadAgentsExact(){
  const localRaw = (() => { try { return JSON.parse(localStorage.getItem(DB.agents) || '[]'); } catch(e){ return []; } })();
  const remoteRaw = await bbV80LoadStateKey(DB.agents, []);
  const merged = bbV80CleanAgents([...(Array.isArray(remoteRaw) ? remoteRaw : []), ...(Array.isArray(localRaw) ? localRaw : [])]);
  localStorage.setItem(DB.agents, JSON.stringify(merged));
  return merged;
}
async function bbV80SaveAgentsExact(list, alsoMirror = true){
  const clean = bbV80CleanAgents(list);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  await bbV80SaveStateKey(DB.deletedAgents, bbV80Tomb());
  await bbV80SaveStateKey(DB.agents, clean);
  if (alsoMirror) {
    for (const a of clean) await bbV80MirrorAgentRow(a);
  }
  return clean;
}
function bbV80AgentRow(a){
  const n = bbV80NormalizeAgent(a);
  return {
    agent_code: n.id,
    name: n.name || n.id,
    phone: n.phone || null,
    password: n.pass || n.password || '',
    is_active: bbV80Active(n),
    updated_at: new Date().toISOString()
  };
}
async function bbV80MirrorAgentRow(agent){
  const client = bbV80Client();
  if (!client || !agent) return false;
  const n = bbV80NormalizeAgent(agent);
  const row = bbV80AgentRow(n);
  try {
    const { error } = await client.from('agents').upsert(row, { onConflict: 'agent_code' });
    if (error) throw error;
    return true;
  } catch(e1) {
    // Fallback for old agents table that does not have agent_code/updated_at yet.
    try {
      const fallback = { name: `[${n.id}] ${n.name || n.id}`, phone: n.phone || null, password: n.pass || n.password || '', is_active: bbV80Active(n) };
      const opts = n.phone ? { onConflict: 'phone' } : undefined;
      const { error } = await client.from('agents').upsert(fallback, opts);
      if (error) throw error;
      return true;
    } catch(e2) {
      console.warn('v80 mirror agent row failed. Run supabase-agent-v80.sql.', e1, e2);
      return false;
    }
  }
}
async function bbV80DeleteAgentRow(agent){
  const client = bbV80Client();
  if (!client || !agent) return false;
  const n = bbV80NormalizeAgent(agent);
  let ok = false;
  try { const { error } = await client.from('agents').delete().eq('agent_code', n.id); if (!error) ok = true; } catch(e) {}
  if (n.phone) { try { const { error } = await client.from('agents').delete().eq('phone', n.phone); if (!error) ok = true; } catch(e) {} }
  try { const { error } = await client.from('agents').delete().eq('name', `[${n.id}] ${n.name || n.id}`); if (!error) ok = true; } catch(e) {}
  return ok;
}
function bbV80ReadAgentDraft(){
  return {
    name: String(document.querySelector('#agentNameNew')?.value || '').trim(),
    id: String(document.querySelector('#agentIdNew')?.value || '').trim(),
    pass: String(document.querySelector('#agentPassNew')?.value || '').trim(),
    phone: String(document.querySelector('#agentPhoneNew')?.value || '').trim()
  };
}
function bbV80BindAgentDraft(){
  ['agentNameNew','agentIdNew','agentPassNew','agentPhoneNew'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => { state.agentDraft = bbV80ReadAgentDraft(); });
  });
}

agents = function(){
  try { return bbV80CleanAgents(JSON.parse(localStorage.getItem(DB.agents) || '[]')); }
  catch(e){ return []; }
};
saveAgents = function(list){
  const clean = bbV80CleanAgents(list || []);
  localStorage.setItem(DB.agents, JSON.stringify(clean));
  bbV80SaveStateKey(DB.agents, clean);
  return clean;
};

adminAgents = function(){
  if (state) state.adminTab = 'agents';
  const box = document.querySelector('#adminContent');
  if (!box) return;
  const d = state.agentDraft || {name:'', id:'', pass:'', phone:''};
  const list = agents();
  box.innerHTML = `<div class="admin-clean-head"><h3>ຈັດການຕົວແທນ</h3><p class="muted">v80: ບັນທຶກຫຼັກໃນ Supabase <b>bb_state</b> ແລະ mirror ໄປ <b>agents</b>.</p></div>
  <div class="auth-card agent-form-stable"><h3>ເພີ່ມຕົວແທນ</h3><div class="form-grid">
    <input id="agentNameNew" placeholder="ຊື່ຕົວແທນ" value="${esc(d.name || '')}">
    <input id="agentIdNew" placeholder="Agent ID" value="${esc(d.id || '')}">
    <input id="agentPassNew" placeholder="Password" value="${esc(d.pass || '')}">
    <input id="agentPhoneNew" placeholder="ເບີໂທ" value="${esc(d.phone || '')}">
  </div><button type="button" class="success full" id="addAgentBtn">+ ເພີ່ມຕົວແທນ</button></div>
  <div class="order-list agent-clean-list">${list.map(a => {
    const active = bbV80Active(a);
    return `<div class="${active ? 'agent-row' : 'agent-row agent-disabled'}" data-agent-card="${esc(a.id)}">
      <div><b>${esc(a.name || '-')}</b> ${active ? '<span class="status good">ເປີດໃຊ້ງານ</span>' : '<span class="status bad">ປິດ ID</span>'}<br><span class="muted">ID: ${esc(a.id || '-')} · ເບີ: ${esc(a.phone || '-')}</span><br><span class="muted">Password: <b>${esc(a.pass || a.password || '-')}</b></span></div>
      <div class="action-row"><button type="button" class="outline" data-agent-pass="${esc(a.id)}">🔐 ປ່ຽນລະຫັດ</button><button type="button" class="${active ? 'outline' : 'success'}" data-agent-toggle="${esc(a.id)}">${active ? 'ປິດ ID' : 'ເປີດ ID'}</button><button type="button" class="danger" data-agent-delete="${esc(a.id)}">🗑 ລົບ</button></div>
    </div>`;
  }).join('') || '<div class="note">ຍັງບໍ່ມີຕົວແທນ</div>'}</div>`;
  bbV80BindAgentDraft();
  const add = document.getElementById('addAgentBtn');
  if (add) add.onclick = addAgent;
  document.querySelectorAll('[data-agent-toggle]').forEach(btn => btn.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await toggleAgent(btn.dataset.agentToggle); });
  document.querySelectorAll('[data-agent-delete]').forEach(btn => btn.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await deleteAgent(btn.dataset.agentDelete); });
  document.querySelectorAll('[data-agent-pass]').forEach(btn => btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openAgentPassword(btn.dataset.agentPass); });
};

addAgent = async function(){
  state.agentDraft = bbV80ReadAgentDraft();
  const d = state.agentDraft;
  const id = String(d.id || '').trim();
  const name = String(d.name || '').trim();
  const pass = String(d.pass || '').trim();
  const phone = d.phone ? bbV80NormPhone(d.phone) : '';
  if (!id || !name || !pass) return toast('ກອກຊື່, Agent ID, Password ໃຫ້ຄົບ');
  const current = await bbV80LoadAgentsExact();
  if (current.some(a => a.id.toLowerCase() === id.toLowerCase())) return toast('Agent ID ຊ້ຳ');
  if (phone && current.some(a => bbV80NormPhone(a.phone) === phone)) return toast('ເບີຕົວແທນຊ້ຳ');
  const del = bbV80Tomb();
  del.ids = (del.ids || []).filter(x => String(x).toLowerCase() !== id.toLowerCase());
  if (phone) del.phones = (del.phones || []).filter(x => bbV80NormPhone(x) !== phone);
  if (typeof bbV73SaveTombstone === 'function') bbV73SaveTombstone(DB.deletedAgents, del);
  const now = new Date().toISOString();
  const agent = {id, name, pass, password: pass, phone, active:true, is_active:true, status:'active', createdAt:now, updatedAt:now, weekStartedAt:now};
  const next = await bbV80SaveAgentsExact([...current, agent]);
  await bbV80MirrorAgentRow(agent);
  state.agentDraft = {name:'', id:'', pass:'', phone:''};
  play('success');
  toast('ເພີ່ມຕົວແທນແລ້ວ');
  adminAgents();
};

toggleAgent = async function(id){
  const current = await bbV80LoadAgentsExact();
  let target = null;
  const next = current.map(a => {
    if (String(a.id) !== String(id)) return a;
    const active = !bbV80Active(a);
    target = bbV80NormalizeAgent({...a, active, is_active:active, status:active ? 'active' : 'disabled', blockReason: active ? '' : (a.blockReason || 'Admin ປິດ ID'), updatedAt:new Date().toISOString()});
    return target;
  });
  if (!target) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV80SaveAgentsExact(next);
  await bbV80MirrorAgentRow(target);
  if (currentAgent()?.id === id && !bbV80Active(target)) removeKey(DB.agentSession);
  toast(bbV80Active(target) ? 'ເປີດ ID ຕົວແທນແລ້ວ' : 'ປິດ ID ຕົວແທນແລ້ວ');
  adminAgents();
};

deleteAgent = async function(id){
  const current = await bbV80LoadAgentsExact();
  const target = current.find(a => String(a.id) === String(id));
  if (!target) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${target.name || target.id} ຖາວອນ?`)) return;
  const del = bbV80Tomb();
  del.ids = Array.from(new Set([...(del.ids || []), String(target.id)]));
  if (target.phone) del.phones = Array.from(new Set([...(del.phones || []), String(target.phone)]));
  if (typeof bbV73SaveTombstone === 'function') bbV73SaveTombstone(DB.deletedAgents, del);
  localStorage.setItem(DB.deletedAgents, JSON.stringify(del));
  const next = current.filter(a => String(a.id) !== String(target.id));
  localStorage.setItem(DB.agents, JSON.stringify(next));
  await bbV80SaveStateKey(DB.deletedAgents, del);
  await bbV80SaveStateKey(DB.agents, next);
  await bbV80DeleteAgentRow(target);
  if (currentAgent()?.id === target.id) removeKey(DB.agentSession);
  play('delete');
  toast('ລົບຕົວແທນແລ້ວ');
  adminAgents();
};

saveAgentPassword = async function(id){
  const p1 = String(document.querySelector('#agentNewPass')?.value || '').trim();
  const p2 = String(document.querySelector('#agentNewPass2')?.value || '').trim();
  if (p1.length < 2) return toast('ລະຫັດຕ້ອງມີຢ່າງນ້ອຍ 2 ຕົວ');
  if (p1 !== p2) return toast('ລະຫັດຢືນຢັນບໍ່ກົງກັນ');
  const current = await bbV80LoadAgentsExact();
  let target = null;
  const next = current.map(a => {
    if (String(a.id) !== String(id)) return a;
    target = bbV80NormalizeAgent({...a, pass:p1, password:p1, passwordUpdatedAt:new Date().toISOString(), updatedAt:new Date().toISOString()});
    return target;
  });
  if (!target) return toast('ບໍ່ພົບຕົວແທນ');
  await bbV80SaveAgentsExact(next);
  await bbV80MirrorAgentRow(target);
  toast('ປ່ຽນລະຫັດຕົວແທນແລ້ວ');
  closeModal();
  adminAgents();
};

bbV73FindAgentForLogin = async function(idRaw, pass){
  const id = String(idRaw || '').trim();
  await bbV80LoadAgentsExact();
  const list = agents();
  const found = list.find(a => String(a.id) === id && String(a.pass || a.password) === String(pass));
  if (!found) return null;
  return bbV80Active(found) ? found : {...found, __closed:true, active:false};
};

setTimeout(async () => {
  try {
    await bbV80LoadAgentsExact();
    if (state.page === 'admin' && state.adminTab === 'agents') adminAgents();
  } catch(e){ console.warn('v80 startup skipped', e); }
}, 1200);

Object.assign(window, { BB_V80_VERSION, bbV80LoadAgentsExact, bbV80SaveAgentsExact, addAgent, toggleAgent, deleteAgent, saveAgentPassword, adminAgents });

/* =========================
   v81 DELETE + SQL SYNC REPAIR
   =========================
   Fixes permanent delete for orders/customers/agents by saving exact cleaned arrays
   to Supabase bb_state and writing tombstones before the next realtime/poll sync can
   re-merge deleted rows back into the UI.
*/
const BB_V81_VERSION = 'v81 delete persistence repair';

DB.deletedCustomers = DB.deletedCustomers || 'BB4_deletedCustomers';
DB.deletedOrders = DB.deletedOrders || 'BB4_deletedOrders';
DB.deletedAgents = DB.deletedAgents || 'BB4_deletedAgents';
DB.customerRegistry = DB.customerRegistry || 'BB4_customerRegistry';
[DB.deletedCustomers, DB.deletedOrders, DB.deletedAgents, DB.customerRegistry].forEach(key => {
  if (!CLOUD_KEYS.includes(key)) CLOUD_KEYS.push(key);
});

function bbV81CleanTombstone(raw = {}) {
  const uniq = arr => Array.from(new Set((Array.isArray(arr) ? arr : []).map(x => String(x || '').trim()).filter(Boolean)));
  return { ids: uniq(raw.ids), phones: uniq(raw.phones), names: uniq(raw.names) };
}
function bbV81ReadTombstone(key) { return bbV81CleanTombstone(load(key, { ids: [], phones: [], names: [] })); }
function bbV81SaveTombstoneLocal(key, tomb) {
  const clean = bbV81CleanTombstone(tomb);
  localStorage.setItem(key, JSON.stringify(clean));
  return clean;
}
function bbV81Norm(value) { return String(value || '').trim(); }
function bbV81Phone(value) { try { return normPhone(value); } catch (err) { return String(value || '').replace(/\D/g, ''); } }
function bbV81IsDeletedByTombstone(item, tomb) {
  if (!item) return true;
  const id = bbV81Norm(item.id || item.agent_code);
  const phone = bbV81Norm(item.phone);
  const name = bbV81Norm(item.name);
  return (id && tomb.ids.includes(id)) || (phone && tomb.phones.includes(phone)) || (name && tomb.names.includes(name));
}
async function bbV81SaveStateExact(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  const client = getCloudClient();
  if (!client) { cloudSave(key, data); return data; }
  try {
    setCloudStatus('syncing');
    const { error } = await client.from('bb_state').upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    setCloudStatus('online');
  } catch (err) {
    console.warn('v81 exact bb_state save failed:', key, err);
    setCloudStatus('offline');
    cloudSave(key, data);
  }
  return data;
}
function bbV81FilterOrders(list) {
  const tomb = bbV81ReadTombstone(DB.deletedOrders);
  return (Array.isArray(list) ? list : []).filter(o => o && !bbV81IsDeletedByTombstone(o, tomb));
}
function bbV81FilterCustomers(list) {
  const tomb = bbV81ReadTombstone(DB.deletedCustomers);
  return (Array.isArray(list) ? list : []).filter(u => u && !bbV81IsDeletedByTombstone(u, tomb));
}
function bbV81FilterAgents(list) {
  const tomb = bbV81ReadTombstone(DB.deletedAgents);
  return (Array.isArray(list) ? list : []).filter(a => a && !bbV81IsDeletedByTombstone({ ...a, id: a.id || a.agent_code }, tomb));
}
async function bbV81DeleteCustomerTable(u) {
  const client = getCloudClient();
  if (!client || !u) return;
  const table = typeof BB_CUSTOMERS_TABLE !== 'undefined' ? BB_CUSTOMERS_TABLE : 'bb_customers';
  try { if (u.phone) await client.from(table).delete().eq('phone', u.phone); } catch (err) { console.warn('v81 delete customer by phone failed', err); }
  try { if (u.id) await client.from(table).delete().eq('id', u.id); } catch (err) { console.warn('v81 delete customer by id failed', err); }
}
async function bbV81DeleteAgentTable(a) {
  const client = getCloudClient();
  if (!client || !a) return;
  const id = a.id || a.agent_code;
  try { if (id) await client.from('agents').delete().eq('agent_code', id); } catch (err) { console.warn('v81 delete agent by code failed', err); }
  try { if (a.phone) await client.from('agents').delete().eq('phone', a.phone); } catch (err) { console.warn('v81 delete agent by phone failed', err); }
}
async function bbV81ApplyDeleteFilters() {
  const cleanOrders = bbV81FilterOrders(load(DB.orders, []));
  const cleanUsers = bbV81FilterCustomers(load(DB.users, []));
  const cleanRegistry = bbV81FilterCustomers(load(DB.customerRegistry, []));
  const cleanAgents = bbV81FilterAgents(load(DB.agents, []));
  localStorage.setItem(DB.orders, JSON.stringify(cleanOrders));
  localStorage.setItem(DB.users, JSON.stringify(cleanUsers));
  localStorage.setItem(DB.customerRegistry, JSON.stringify(cleanRegistry));
  localStorage.setItem(DB.agents, JSON.stringify(cleanAgents));
  return { cleanOrders, cleanUsers, cleanRegistry, cleanAgents };
}

const bbV81BaseOrders = orders;
orders = function() { return bbV81FilterOrders(bbV81BaseOrders()); };
const bbV81BaseUsers = users;
users = function() { return bbV81FilterCustomers(bbV81BaseUsers()); };
const bbV81BaseAgents = agents;
agents = function() { return bbV81FilterAgents(bbV81BaseAgents()); };

const bbV81BaseCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const ok = await bbV81BaseCloudLoadAll();
  await bbV81ApplyDeleteFilters();
  return ok;
};

deleteOrder = async function(id) {
  if (currentRole() !== 'admin') return toast('Admin ເທົ່ານັ້ນທີ່ລົບອໍເດີໄດ້');
  const raw = load(DB.orders, []);
  const o = raw.find(x => String(x.id) === String(id));
  if (!o) return toast('ບໍ່ພົບອໍເດີ');
  if (!confirm(`ລົບອໍເດີ ${o.id} ອອກຖາວອນ?`)) return;
  try { restoreStockForOrder(o); } catch (err) { console.warn('v81 restore stock skipped', err); }
  const tomb = bbV81ReadTombstone(DB.deletedOrders);
  tomb.ids.push(String(o.id));
  const cleanTomb = bbV81SaveTombstoneLocal(DB.deletedOrders, tomb);
  const next = raw.filter(x => String(x.id) !== String(o.id));
  await bbV81SaveStateExact(DB.deletedOrders, cleanTomb);
  await bbV81SaveStateExact(DB.orders, next);
  play('delete');
  toast('ລົບອໍເດີແລ້ວ');
  closeModal();
  renderAll();
};

deleteCustomer = async function(id) {
  const rawUsers = load(DB.users, []);
  const rawRegistry = load(DB.customerRegistry, []);
  const u = [...rawUsers, ...rawRegistry].find(x => String(x.id) === String(id));
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  if (!confirm(`ລົບລູກຄ້າ ${u.name || u.phone || u.id} ອອກຖາວອນ?`)) return;
  const tomb = bbV81ReadTombstone(DB.deletedCustomers);
  if (u.id) tomb.ids.push(String(u.id));
  if (u.phone) tomb.phones.push(String(u.phone));
  if (u.name) tomb.names.push(String(u.name));
  const cleanTomb = bbV81SaveTombstoneLocal(DB.deletedCustomers, tomb);
  const same = x => String(x.id || '') === String(u.id || '') || String(x.phone || '') === String(u.phone || '');
  const nextUsers = rawUsers.filter(x => !same(x));
  const nextRegistry = rawRegistry.filter(x => !same(x));
  await bbV81SaveStateExact(DB.deletedCustomers, cleanTomb);
  await bbV81SaveStateExact(DB.users, nextUsers);
  await bbV81SaveStateExact(DB.customerRegistry, nextRegistry);
  await bbV81DeleteCustomerTable(u);
  if (currentCustomer()?.id === u.id || currentCustomer()?.phone === u.phone) removeKey(DB.session);
  play('delete');
  toast('ລົບລູກຄ້າແລ້ວ');
  closeModal();
  renderAll();
  if (state.page === 'admin' && state.adminTab === 'customers') adminCustomers();
};

deleteAgent = async function(id) {
  let raw = load(DB.agents, []);
  try { if (typeof bbV80LoadAgentsExact === 'function') raw = await bbV80LoadAgentsExact(); } catch (err) { console.warn('v81 load agents exact fallback', err); }
  const a = raw.find(x => String(x.id || x.agent_code) === String(id));
  if (!a) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${a.name || a.id || a.agent_code} ຖາວອນ?`)) return;
  const agentId = a.id || a.agent_code;
  const tomb = bbV81ReadTombstone(DB.deletedAgents);
  if (agentId) tomb.ids.push(String(agentId));
  if (a.phone) tomb.phones.push(String(a.phone));
  if (a.name) tomb.names.push(String(a.name));
  const cleanTomb = bbV81SaveTombstoneLocal(DB.deletedAgents, tomb);
  const next = raw.filter(x => String(x.id || x.agent_code) !== String(agentId));
  await bbV81SaveStateExact(DB.deletedAgents, cleanTomb);
  await bbV81SaveStateExact(DB.agents, next);
  await bbV81DeleteAgentTable({ ...a, id: agentId });
  if (currentAgent()?.id === agentId) removeKey(DB.agentSession);
  play('delete');
  toast('ລົບຕົວແທນແລ້ວ');
  renderAll();
  if (state.page === 'admin' && state.adminTab === 'agents') adminAgents();
};

Object.assign(window, { BB_V81_VERSION, bbV81ApplyDeleteFilters, deleteOrder, deleteCustomer, deleteAgent });
setTimeout(() => { bbV81ApplyDeleteFilters().then(() => { if (state.page === 'admin') renderAdmin(); }).catch(err => console.warn('v81 startup filter failed', err)); }, 1200);


/* =========================
   v82 HARD SYNC + DELETE REPAIR
   =========================
   Purpose:
   - Stop old Supabase/local cache from reviving deleted orders/agents/customers.
   - Pull remote tombstones before every sync, then save exact cleaned arrays back to bb_state.
   - Keep public.agents/public.bb_customers as mirrors only; bb_state + tombstones are source of truth.
*/
const BB_V82_VERSION = 'v82 hard delete and sync repair';
const BB_V83_VERSION = 'v83 createOrder console error fix';
DB.deletedCustomers = DB.deletedCustomers || 'BB4_deletedCustomers';
DB.deletedOrders = DB.deletedOrders || 'BB4_deletedOrders';
DB.deletedAgents = DB.deletedAgents || 'BB4_deletedAgents';
DB.customerRegistry = DB.customerRegistry || 'BB4_customerRegistry';
[DB.deletedCustomers, DB.deletedOrders, DB.deletedAgents, DB.customerRegistry, DB.users, DB.agents, DB.orders].forEach(key => {
  if (!CLOUD_KEYS.includes(key)) CLOUD_KEYS.push(key);
});

let bbV82RepairBusy = false;

function bbV82Now() { return new Date().toISOString(); }
function bbV82Arr(v) { return Array.isArray(v) ? v : []; }
function bbV82Str(v) { return String(v ?? '').trim(); }
function bbV82Phone(v) {
  try { return normPhone(v || ''); }
  catch (e) { return String(v || '').replace(/\D/g, ''); }
}
function bbV82Load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch (e) { return fallback; }
}
function bbV82SetLocal(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  return data;
}
function bbV82Tomb(raw = {}) {
  const uniq = arr => Array.from(new Set(bbV82Arr(arr).map(x => bbV82Str(x)).filter(Boolean)));
  return { ids: uniq(raw.ids), phones: uniq(raw.phones).map(bbV82Phone).filter(Boolean), names: uniq(raw.names) };
}
function bbV82MergeTombstones(...items) {
  const out = { ids: [], phones: [], names: [] };
  items.forEach(item => {
    const t = bbV82Tomb(item || {});
    out.ids.push(...t.ids);
    out.phones.push(...t.phones);
    out.names.push(...t.names);
  });
  return bbV82Tomb(out);
}
function bbV82ReadTombstone(key) { return bbV82Tomb(bbV82Load(key, { ids: [], phones: [], names: [] })); }
async function bbV82FetchState(key, fallback) {
  const client = getCloudClient();
  if (!client) return fallback;
  try {
    const { data, error } = await client.from('bb_state').select('data').eq('key', key).maybeSingle();
    if (error) throw error;
    return data && data.data !== undefined ? data.data : fallback;
  } catch (err) {
    console.warn('v82 fetch state failed', key, err);
    return fallback;
  }
}
async function bbV82ExactSave(key, data) {
  bbV82SetLocal(key, data);
  const client = getCloudClient();
  if (!client) { cloudSave(key, data); return data; }
  try {
    setCloudStatus('syncing');
    const { error } = await client.from('bb_state').upsert({ key, data, updated_at: bbV82Now() }, { onConflict: 'key' });
    if (error) throw error;
    setCloudStatus('online');
  } catch (err) {
    console.warn('v82 exact save failed', key, err);
    setCloudStatus('offline');
    cloudSave(key, data);
  }
  return data;
}
async function bbV82PullTombstone(key) {
  const local = bbV82ReadTombstone(key);
  const remote = bbV82Tomb(await bbV82FetchState(key, local));
  const merged = bbV82MergeTombstones(remote, local);
  bbV82SetLocal(key, merged);
  if (JSON.stringify(remote) !== JSON.stringify(merged)) await bbV82ExactSave(key, merged);
  return merged;
}
async function bbV82PullAllTombstones() {
  const [ordersTomb, agentsTomb, customersTomb] = await Promise.all([
    bbV82PullTombstone(DB.deletedOrders),
    bbV82PullTombstone(DB.deletedAgents),
    bbV82PullTombstone(DB.deletedCustomers)
  ]);
  return { ordersTomb, agentsTomb, customersTomb };
}
function bbV82IsDeletedOrder(o, tomb = bbV82ReadTombstone(DB.deletedOrders)) {
  return !!o && !!bbV82Str(o.id) && tomb.ids.includes(bbV82Str(o.id));
}
function bbV82NormalizeCustomer(u) {
  if (!u) return null;
  const phone = bbV82Phone(u.phone || u.idRaw || '');
  const id = bbV82Str(u.id || (phone ? `CUS${phone}` : ''));
  if (!id && !phone) return null;
  return { ...u, id, phone, updatedAt: u.updatedAt || u.updated_at || u.createdAt || bbV82Now() };
}
function bbV82IsDeletedCustomer(u, tomb = bbV82ReadTombstone(DB.deletedCustomers)) {
  const n = bbV82NormalizeCustomer(u);
  if (!n) return true;
  return (!!n.id && tomb.ids.includes(bbV82Str(n.id))) || (!!n.phone && tomb.phones.includes(bbV82Phone(n.phone)));
}
function bbV82AgentId(a) { return bbV82Str(a?.id || a?.agent_code || a?.agent_id || a?.code || ''); }
function bbV82NormalizeAgent(a) {
  if (!a) return null;
  const id = bbV82AgentId(a);
  if (!id) return null;
  const active = !(a.active === false || a.active === 'false' || a.is_active === false || a.is_active === 'false' || a.status === 'disabled' || a.status === 'closed');
  return {
    ...a,
    id,
    name: bbV82Str(a.name || id).replace(/^\[[^\]]+\]\s*/, '') || id,
    phone: a.phone ? bbV82Phone(a.phone) : '',
    pass: bbV82Str(a.pass ?? a.password ?? ''),
    password: bbV82Str(a.password ?? a.pass ?? ''),
    active,
    is_active: active,
    status: active ? 'active' : 'disabled',
    createdAt: a.createdAt || a.created_at || bbV82Now(),
    updatedAt: a.updatedAt || a.updated_at || bbV82Now()
  };
}
function bbV82IsDeletedAgent(a, tomb = bbV82ReadTombstone(DB.deletedAgents)) {
  const n = bbV82NormalizeAgent(a);
  if (!n) return true;
  return (!!n.id && tomb.ids.includes(bbV82Str(n.id))) || (!!n.phone && tomb.phones.includes(bbV82Phone(n.phone)));
}
function bbV82MergeById(list, normalize, isDeleted, idFn) {
  const map = new Map();
  bbV82Arr(list).forEach(raw => {
    const item = normalize(raw);
    if (!item || isDeleted(item)) return;
    const key = bbV82Str(idFn(item)).toLowerCase();
    if (!key) return;
    const old = map.get(key);
    if (!old) { map.set(key, item); return; }
    const ot = Date.parse(old.updatedAt || old.updated_at || old.createdAt || old.created_at || 0) || 0;
    const nt = Date.parse(item.updatedAt || item.updated_at || item.createdAt || item.created_at || 0) || 0;
    map.set(key, nt >= ot ? { ...old, ...item } : { ...item, ...old });
  });
  return Array.from(map.values());
}
function bbV82MergeOrders(...lists) {
  const tomb = bbV82ReadTombstone(DB.deletedOrders);
  const map = new Map();
  lists.flat().filter(Boolean).forEach(raw => {
    if (!raw || !raw.id || bbV82IsDeletedOrder(raw, tomb)) return;
    const id = bbV82Str(raw.id);
    const old = map.get(id);
    if (!old) { map.set(id, raw); return; }
    const ot = Date.parse(old.updatedAt || old.statusAt || old.createdAt || 0) || 0;
    const nt = Date.parse(raw.updatedAt || raw.statusAt || raw.createdAt || 0) || 0;
    map.set(id, nt >= ot ? { ...old, ...raw, id } : { ...raw, ...old, id });
  });
  return Array.from(map.values()).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function bbV82MergeCustomers(...lists) {
  const tomb = bbV82ReadTombstone(DB.deletedCustomers);
  const map = new Map();
  lists.flat().filter(Boolean).forEach(raw => {
    const u = bbV82NormalizeCustomer(raw);
    if (!u || bbV82IsDeletedCustomer(u, tomb)) return;
    const key = u.phone ? `phone:${u.phone}` : `id:${u.id}`;
    const old = map.get(key);
    map.set(key, old ? { ...old, ...u } : u);
  });
  return Array.from(map.values()).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function bbV82MergeAgents(...lists) {
  const tomb = bbV82ReadTombstone(DB.deletedAgents);
  return bbV82MergeById(lists.flat(), bbV82NormalizeAgent, a => bbV82IsDeletedAgent(a, tomb), a => a.id)
    .sort((a,b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
}

const bbV82BaseMergeArrayState = typeof bbMergeArrayState === 'function' ? bbMergeArrayState : null;
bbMergeArrayState = function(key, remoteValue, localValue) {
  if (key === DB.orders) return bbV82MergeOrders(remoteValue, localValue);
  if (key === DB.agents) return bbV82MergeAgents(remoteValue, localValue);
  if (key === DB.users || key === DB.customerRegistry) return bbV82MergeCustomers(remoteValue, localValue);
  if (key === DB.deletedOrders || key === DB.deletedAgents || key === DB.deletedCustomers) return bbV82MergeTombstones(remoteValue, localValue);
  return bbV82BaseMergeArrayState ? bbV82BaseMergeArrayState(key, remoteValue, localValue) : (localValue ?? remoteValue);
};

const bbV82BaseOrdersFn = orders;
orders = function() { return bbV82MergeOrders(bbV82BaseOrdersFn()); };
const bbV82BaseUsersFn = users;
users = function() { return bbV82MergeCustomers(bbV82BaseUsersFn()); };
const bbV82BaseAgentsFn = agents;
agents = function() { return bbV82MergeAgents(bbV82BaseAgentsFn()); };

saveOrders = function(list) {
  const clean = bbV82MergeOrders(list || []);
  bbV82SetLocal(DB.orders, clean);
  if (!cloudPulling) bbV82ExactSave(DB.orders, clean);
  return clean;
};
saveUsers = function(list) {
  const clean = bbV82MergeCustomers(list || []);
  bbV82SetLocal(DB.users, clean);
  if (DB.customerRegistry) bbV82SetLocal(DB.customerRegistry, clean);
  if (!cloudPulling) {
    bbV82ExactSave(DB.users, clean);
    if (DB.customerRegistry) bbV82ExactSave(DB.customerRegistry, clean);
  }
  return clean;
};
saveAgents = function(list) {
  const clean = bbV82MergeAgents(list || []);
  bbV82SetLocal(DB.agents, clean);
  if (!cloudPulling) bbV82ExactSave(DB.agents, clean);
  return clean;
};

async function bbV82RepairNow(push = true, keep = {}) {
  if (bbV82RepairBusy) return false;
  bbV82RepairBusy = true;
  try {
    await bbV82PullAllTombstones();
    const remoteOrders = await bbV82FetchState(DB.orders, []);
    const remoteAgents = await bbV82FetchState(DB.agents, []);
    const remoteUsers = await bbV82FetchState(DB.users, []);
    const remoteRegistry = await bbV82FetchState(DB.customerRegistry, []);
    const cleanOrders = bbV82MergeOrders(remoteOrders, keep.orders || [], bbV82Load(DB.orders, []));
    const cleanAgents = bbV82MergeAgents(remoteAgents, keep.agents || [], bbV82Load(DB.agents, []));
    const cleanUsers = bbV82MergeCustomers(remoteUsers, remoteRegistry, keep.users || [], keep.customerRegistry || [], bbV82Load(DB.users, []), bbV82Load(DB.customerRegistry, []));
    bbV82SetLocal(DB.orders, cleanOrders);
    bbV82SetLocal(DB.agents, cleanAgents);
    bbV82SetLocal(DB.users, cleanUsers);
    bbV82SetLocal(DB.customerRegistry, cleanUsers);
    if (push) {
      await bbV82ExactSave(DB.deletedOrders, bbV82ReadTombstone(DB.deletedOrders));
      await bbV82ExactSave(DB.deletedAgents, bbV82ReadTombstone(DB.deletedAgents));
      await bbV82ExactSave(DB.deletedCustomers, bbV82ReadTombstone(DB.deletedCustomers));
      await bbV82ExactSave(DB.orders, cleanOrders);
      await bbV82ExactSave(DB.agents, cleanAgents);
      await bbV82ExactSave(DB.users, cleanUsers);
      await bbV82ExactSave(DB.customerRegistry, cleanUsers);
    }
    return true;
  } catch (err) {
    console.warn('v82 repair failed', err);
    return false;
  } finally {
    bbV82RepairBusy = false;
  }
}

const bbV82BaseCloudLoadAll = cloudLoadAll;
cloudLoadAll = async function() {
  const keep = {
    orders: bbV82Load(DB.orders, []),
    agents: bbV82Load(DB.agents, []),
    users: bbV82Load(DB.users, []),
    customerRegistry: bbV82Load(DB.customerRegistry, [])
  };
  await bbV82PullAllTombstones();
  const ok = await bbV82BaseCloudLoadAll();
  await bbV82RepairNow(true, keep);
  return ok;
};

async function bbV82DeleteCustomerTable(u) {
  const client = getCloudClient();
  if (!client || !u) return false;
  const table = typeof BB_CUSTOMERS_TABLE !== 'undefined' ? BB_CUSTOMERS_TABLE : 'bb_customers';
  let ok = false;
  try { if (u.phone) { const { error } = await client.from(table).delete().eq('phone', bbV82Phone(u.phone)); if (!error) ok = true; } } catch (e) { console.warn('v82 delete customer table phone failed', e); }
  try { if (u.id) { const { error } = await client.from(table).delete().eq('id', bbV82Str(u.id)); if (!error) ok = true; } } catch (e) { console.warn('v82 delete customer table id failed', e); }
  return ok;
}
async function bbV82DeleteAgentTable(a) {
  const client = getCloudClient();
  if (!client || !a) return false;
  const n = bbV82NormalizeAgent(a);
  if (!n) return false;
  let ok = false;
  try { const { error } = await client.from('agents').delete().eq('agent_code', n.id); if (!error) ok = true; } catch (e) { console.warn('v82 delete agent_code failed', e); }
  try { if (n.phone) { const { error } = await client.from('agents').delete().eq('phone', n.phone); if (!error) ok = true; } } catch (e) { console.warn('v82 delete agent phone failed', e); }
  try { const { error } = await client.from('agents').delete().eq('name', `[${n.id}] ${n.name}`); if (!error) ok = true; } catch (e) { console.warn('v82 delete agent legacy name failed', e); }
  try { const { error } = await client.from('agents').delete().eq('name', n.name); if (!error) ok = true; } catch (e) { console.warn('v82 delete agent name failed', e); }
  return ok;
}

async function bbV82LoadAgentsTableSafe() {
  await bbV82PullTombstone(DB.deletedAgents);
  const client = getCloudClient();
  let tableAgents = [];
  if (client) {
    try {
      const { data, error } = await client.from('agents').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      tableAgents = bbV82Arr(data).map(row => bbV82NormalizeAgent({
        id: row.agent_code || row.agent_id || row.code || '',
        name: row.name || row.agent_code || '',
        phone: row.phone || '',
        pass: row.password || row.pass || '',
        password: row.password || row.pass || '',
        active: !(row.is_active === false || row.status === 'disabled'),
        is_active: row.is_active,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })).filter(Boolean);
    } catch (err) { console.warn('v82 load agents mirror skipped', err); }
  }
  const remote = await bbV82FetchState(DB.agents, []);
  const clean = bbV82MergeAgents(remote, bbV82Load(DB.agents, []), tableAgents);
  await bbV82ExactSave(DB.agents, clean);
  return clean;
}

if (typeof bbV79LoadAgentsTable === 'function') bbV79LoadAgentsTable = bbV82LoadAgentsTableSafe;
if (typeof bbV80LoadAgentsExact === 'function') bbV80LoadAgentsExact = bbV82LoadAgentsTableSafe;

if (typeof bbV80MirrorAgentRow === 'function') {
  const bbV82BaseMirrorAgentRow = bbV80MirrorAgentRow;
  bbV80MirrorAgentRow = async function(agent) {
    if (bbV82IsDeletedAgent(agent)) return false;
    return bbV82BaseMirrorAgentRow(agent);
  };
}
if (typeof bbV79UpsertAgentTable === 'function') {
  const bbV82BaseUpsertAgentTable = bbV79UpsertAgentTable;
  bbV79UpsertAgentTable = async function(agent) {
    if (bbV82IsDeletedAgent(agent)) return false;
    return bbV82BaseUpsertAgentTable(agent);
  };
}

async function bbV82AddDeleteMark(key, item, type) {
  const tomb = await bbV82PullTombstone(key);
  if (type === 'order') {
    if (item?.id) tomb.ids.push(bbV82Str(item.id));
  } else if (type === 'customer') {
    if (item?.id) tomb.ids.push(bbV82Str(item.id));
    if (item?.phone) tomb.phones.push(bbV82Phone(item.phone));
  } else if (type === 'agent') {
    const n = bbV82NormalizeAgent(item);
    if (n?.id) tomb.ids.push(bbV82Str(n.id));
    if (n?.phone) tomb.phones.push(bbV82Phone(n.phone));
  }
  const clean = bbV82Tomb(tomb);
  await bbV82ExactSave(key, clean);
  return clean;
}

deleteOrder = async function(id) {
  if (currentRole() !== 'admin') return toast('Admin ເທົ່ານັ້ນທີ່ລົບອໍເດີໄດ້');
  await bbV82PullTombstone(DB.deletedOrders);
  const remote = await bbV82FetchState(DB.orders, []);
  const all = bbV82MergeOrders(remote, bbV82Load(DB.orders, []));
  const o = all.find(x => bbV82Str(x.id) === bbV82Str(id));
  if (!o) return toast('ບໍ່ພົບອໍເດີ');
  if (!confirm(`ລົບອໍເດີ ${o.id} ອອກຖາວອນ?`)) return;
  try { restoreStockForOrder(o); } catch (err) { console.warn('v82 restore stock skipped', err); }
  await bbV82AddDeleteMark(DB.deletedOrders, o, 'order');
  const next = bbV82MergeOrders(all.filter(x => bbV82Str(x.id) !== bbV82Str(o.id)));
  await bbV82ExactSave(DB.orders, next);
  await bbV82RepairNow(true, { orders: next });
  play('delete');
  toast('ລົບອໍເດີຖາວອນແລ້ວ');
  try { closeModal(); } catch (e) {}
  renderAll();
};

deleteCustomer = async function(id) {
  await bbV82PullTombstone(DB.deletedCustomers);
  const remoteUsers = await bbV82FetchState(DB.users, []);
  const remoteRegistry = await bbV82FetchState(DB.customerRegistry, []);
  const all = bbV82MergeCustomers(remoteUsers, remoteRegistry, bbV82Load(DB.users, []), bbV82Load(DB.customerRegistry, []));
  const u = all.find(x => bbV82Str(x.id) === bbV82Str(id));
  if (!u) return toast('ບໍ່ພົບລູກຄ້າ');
  if (!confirm(`ລົບລູກຄ້າ ${u.name || u.phone || u.id} ອອກຖາວອນ?`)) return;
  await bbV82AddDeleteMark(DB.deletedCustomers, u, 'customer');
  const same = x => bbV82Str(x.id) === bbV82Str(u.id) || (!!x.phone && !!u.phone && bbV82Phone(x.phone) === bbV82Phone(u.phone));
  const next = bbV82MergeCustomers(all.filter(x => !same(x)));
  await bbV82ExactSave(DB.users, next);
  await bbV82ExactSave(DB.customerRegistry, next);
  await bbV82DeleteCustomerTable(u);
  if (currentCustomer()?.id === u.id || currentCustomer()?.phone === u.phone) removeKey(DB.session);
  await bbV82RepairNow(true, { users: next, customerRegistry: next });
  play('delete');
  toast('ລົບລູກຄ້າຖາວອນແລ້ວ');
  try { closeModal(); } catch (e) {}
  renderAll();
  if (state.page === 'admin' && state.adminTab === 'customers') adminCustomers();
};

deleteAgent = async function(id) {
  await bbV82PullTombstone(DB.deletedAgents);
  const remote = await bbV82FetchState(DB.agents, []);
  let all = bbV82MergeAgents(remote, bbV82Load(DB.agents, []));
  const a = all.find(x => bbV82Str(x.id) === bbV82Str(id) || bbV82Str(x.agent_code) === bbV82Str(id));
  if (!a) return toast('ບໍ່ພົບຕົວແທນ');
  if (!confirm(`ລົບຕົວແທນ ${a.name || a.id || a.agent_code} ອອກຖາວອນ?`)) return;
  const n = bbV82NormalizeAgent(a);
  await bbV82AddDeleteMark(DB.deletedAgents, n, 'agent');
  const next = bbV82MergeAgents(all.filter(x => bbV82Str(x.id || x.agent_code) !== bbV82Str(n.id)));
  await bbV82ExactSave(DB.agents, next);
  await bbV82DeleteAgentTable(n);
  if (currentAgent()?.id === n.id) removeKey(DB.agentSession);
  await bbV82RepairNow(true, { agents: next });
  play('delete');
  toast('ລົບຕົວແທນຖາວອນແລ້ວ');
  renderAll();
  if (state.page === 'admin' && state.adminTab === 'agents') adminAgents();
};

const bbV82BaseAdminAgents = adminAgents;
adminAgents = async function() {
  if (state) state.adminTab = 'agents';
  await bbV82LoadAgentsTableSafe();
  return bbV82BaseAdminAgents();
};

const bbV82BaseAdminOrders = typeof adminOrders === 'function' ? adminOrders : null;
if (bbV82BaseAdminOrders) {
  adminOrders = function() {
    bbV82RepairNow(false).catch(err => console.warn('v82 background order filter failed', err));
    return bbV82BaseAdminOrders();
  };
}

window.BB_V82_VERSION = BB_V82_VERSION;
window.BB_V83_VERSION = BB_V83_VERSION;
Object.assign(window, {
  BB_V82_VERSION,
  BB_V83_VERSION,
  bbV82RepairNow,
  bbV82PullAllTombstones,
  bbV82LoadAgentsTableSafe,
  deleteOrder,
  deleteCustomer,
  deleteAgent
});

setTimeout(async () => {
  try {
    await bbV82RepairNow(true);
    if (state.page === 'admin') renderAdmin();
  } catch (err) { console.warn('v82 startup repair skipped', err); }
}, 900);
