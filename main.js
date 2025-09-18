const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const state = {
  query: '',
  sports: new Set(),
  brands: new Set(),
  priceMin: '',
  priceMax: '',
  ratingMin: 0,
  onlyInStock: false,
  sort: 'relevance',
  perPage: 12,
  page: 1,
  category: '',
  subcategory: '',
};

// Data source: Supabase if configured, else fallback to mock
let products = [];
let supabaseClient = null;
// Cart state
let cart = [];

function loadCart(){
  try{ cart = JSON.parse(localStorage.getItem('cart_v1')||'[]') || []; }
  catch{ cart = []; }
}
function saveCart(){ localStorage.setItem('cart_v1', JSON.stringify(cart)); }
function getCartCount(){ return cart.reduce((s,i)=>s+i.qty,0); }
function getCartTotal(){
  const map = new Map(products.map(p=>[p.id,p]));
  return cart.reduce((sum, item)=> sum + (map.get(item.id)?.price||0)*item.qty, 0);
}
function addToCart(id, qty=1){
  const idx = cart.findIndex(i=>i.id===id);
  if(idx>=0) cart[idx].qty += qty; else cart.push({ id, qty });
  cart = cart.filter(i=>i.qty>0);
  saveCart();
  renderCartBadge();
}
function setCartQty(id, qty){
  const idx = cart.findIndex(i=>i.id===id);
  if(idx>=0){ cart[idx].qty = qty; if(cart[idx].qty<=0) cart.splice(idx,1); }
  saveCart();
  renderCartBadge();
}
function removeFromCart(id){ cart = cart.filter(i=>i.id!==id); saveCart(); renderCartBadge(); }

function renderCartBadge(){
  const el = document.getElementById('cartCount');
  if(el) el.textContent = String(getCartCount());
  const totalEl = document.getElementById('cartTotal');
  if(totalEl) totalEl.textContent = getCartTotal().toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
}

function openCart(){
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if(drawer && overlay){
    drawer.hidden = false;
    overlay.hidden = false;
    // next frame to allow transition
    requestAnimationFrame(()=>{
      drawer.classList.add('open');
      overlay.classList.add('open');
      document.body.classList.add('cart-open');
    });
    renderCartList();
  }
}
function closeCart(){
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if(drawer && overlay){
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.classList.remove('cart-open');
    const onEnd = () => { drawer.hidden = true; overlay.hidden = true; drawer.removeEventListener('transitionend', onEnd); };
    drawer.addEventListener('transitionend', onEnd);
  }
}
function toggleCart(){
  const drawer = document.getElementById('cartDrawer');
  if(!drawer) return;
  if(drawer.hidden) openCart(); else closeCart();
}

function renderCartList(){
  const container = document.getElementById('cartItems');
  if(!container) return;
  const map = new Map(products.map(p=>[p.id,p]));
  container.innerHTML = '';
  if(cart.length===0){ container.innerHTML = '<div class="muted">Корзина пуста</div>'; renderCartBadge(); return; }
  for(const item of cart){
    const p = map.get(item.id);
    if(!p) continue;
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div class="cart-row-media"><img alt="${escapeHtml(p.name)}" src="${p.image || randomImage(p.name)}"></div>
      <div class="cart-row-info">
        <div class="cart-row-title">${escapeHtml(p.name)}</div>
        <div class="cart-row-meta">${p.brand} • ${p.sport}</div>
        <div class="cart-row-controls">
          <button class="qty-btn" data-action="dec" data-id="${p.id}">−</button>
          <input class="qty-input" type="number" min="1" value="${item.qty}" data-id="${p.id}">
          <button class="qty-btn" data-action="inc" data-id="${p.id}">+</button>
          <div class="cart-row-price">${(p.price*item.qty).toLocaleString('ru-RU',{style:'currency',currency:'RUB'})}</div>
          <button class="icon-btn danger" data-action="remove" data-id="${p.id}" aria-label="Удалить">✕</button>
        </div>
      </div>`;
    container.appendChild(row);
  }
  container.querySelectorAll('.qty-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = Number(e.currentTarget.getAttribute('data-id'));
      const act = e.currentTarget.getAttribute('data-action');
      const it = cart.find(i=>i.id===id);
      if(!it) return;
      if(act==='dec') it.qty = Math.max(0, it.qty-1);
      if(act==='inc') it.qty += 1;
      cart = cart.filter(i=>i.qty>0);
      saveCart();
      renderCartList();
      renderCartBadge();
    });
  });
  container.querySelectorAll('.qty-input').forEach(inp=>{
    inp.addEventListener('change', (e)=>{
      const id = Number(e.currentTarget.getAttribute('data-id'));
      const val = Math.max(1, Number(e.currentTarget.value)||1);
      setCartQty(id, val);
      renderCartList();
    });
  });
  container.querySelectorAll('[data-action="remove"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = Number(e.currentTarget.getAttribute('data-id'));
      removeFromCart(id);
      renderCartList();
    });
  });
  renderCartBadge();
}

async function initData(){
  try{
    const { loadSupabase } = await import('./supabase.js');
    supabaseClient = await loadSupabase();
  }catch(e){ supabaseClient = null; }
  if(supabaseClient){
    const ok = await loadFromSupabase();
    if(!ok) products = generateSampleProducts();
  }else{
    products = generateSampleProducts();
  }
}

const uniqueSports = [...new Set(products.map(p => p.sport))];
const uniqueBrands = [...new Set(products.map(p => p.brand))];

// Init UI
document.addEventListener('DOMContentLoaded', async () => {
  $('#year').textContent = new Date().getFullYear();
  loadCart();
  await initData();
  hydrateFromURL();
  const uniqueSports = [...new Set(products.map(p => p.sport))];
  const uniqueBrands = [...new Set(products.map(p => p.brand))];
  renderFilterChips('#sportFilters', uniqueSports, state.sports);
  renderFilterChips('#brandFilters', uniqueBrands, state.brands);
  bindEvents();
  // show default placeholders for price until user types
  setDefaultPricePlaceholders();
  enhanceSelect('#ratingMin');
  update();
  renderCartBadge();
});

function bindEvents(){
  // Search with debounce
  const searchInput = $('#searchInput');
  const debounced = debounce(val => { state.query = val.trim(); state.page = 1; update(); pushURL(); }, 250);
  searchInput.addEventListener('input', e => debounced(e.target.value));

  // Filters form submit
  $('#filtersForm').addEventListener('submit', e => { e.preventDefault(); collectForm(); state.page = 1; update(); pushURL(); });
  $('#resetFilters').addEventListener('click', () => { resetFilters(); update(); pushURL(); });

  // Price sort radios
  const asc = document.getElementById('sortAsc');
  const desc = document.getElementById('sortDesc');
  if(asc) asc.addEventListener('change', e => { if(e.target.checked){ state.sort='price-asc'; state.page=1; update(); pushURL(); }});
  if(desc) desc.addEventListener('change', e => { if(e.target.checked){ state.sort='price-desc'; state.page=1; update(); pushURL(); }});
  const perPageEl = document.getElementById('perPageSelect');
  if(perPageEl){ perPageEl.addEventListener('change', e => { state.perPage = Number(e.target.value); state.page = 1; update(); pushURL(); }); }

  // Catalog menu
  $$('.menu').forEach(menu => {
    const btn = menu.querySelector('.menu-btn');
    if(btn){ btn.addEventListener('click', ()=>{
      const exp = menu.getAttribute('aria-expanded')==='true';
      $$('.menu').forEach(m=>m.setAttribute('aria-expanded','false'));
      menu.setAttribute('aria-expanded', exp ? 'false' : 'true');
    }); }
    document.addEventListener('click', (e)=>{ if(!menu.contains(e.target)) menu.setAttribute('aria-expanded','false'); });
  });
  $$('.menu-item, .menu-link').forEach(item => {
    item.addEventListener('click', ()=>{
      state.category = item.getAttribute('data-cat') || '';
      state.subcategory = item.getAttribute('data-sub') || '';
      state.page = 1;
      update();
      pushURL();
    });
  });

  // Cart events
  const cartToggle = document.getElementById('cartToggle');
  const cartClose = document.getElementById('cartClose');
  const cartOverlay = document.getElementById('cartOverlay');
  const cartClear = document.getElementById('cartClear');
  if(cartToggle) cartToggle.addEventListener('click', toggleCart);
  if(cartClose) cartClose.addEventListener('click', closeCart);
  if(cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if(cartClear) cartClear.addEventListener('click', ()=>{ cart = []; saveCart(); renderCartList(); renderCartBadge(); });
}

function setDefaultPricePlaceholders(){
  const min = $('#priceMin');
  const max = $('#priceMax');
  const defaultMin = 'от 0';
  const defaultMax = 'до 9999';
  if(!min.value) min.placeholder = defaultMin; if(!max.value) max.placeholder = defaultMax;
  ['input','focus'].forEach(ev => {
    min.addEventListener(ev, ()=>{ if(min.value==='') min.placeholder=''; });
    max.addEventListener(ev, ()=>{ if(max.value==='') max.placeholder=''; });
  });
  ['blur','change'].forEach(ev => {
    min.addEventListener(ev, ()=>{ if(min.value==='') min.placeholder=defaultMin; });
    max.addEventListener(ev, ()=>{ if(max.value==='') max.placeholder=defaultMax; });
  });
}

// Accessible custom dropdown enhancement
const enhancedSelectMap = {};
function enhanceSelect(selector){
  const select = document.querySelector(selector);
  if(!select) return;
  select.classList.add('dropdown-hidden');
  const wrapper = document.createElement('div');
  wrapper.className = 'dropdown';
  wrapper.setAttribute('aria-expanded','false');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dropdown-btn';
  const labelSpan = document.createElement('span');
  labelSpan.textContent = select.options[select.selectedIndex]?.text || '—';
  const arrow = document.createElement('span');
  arrow.className = 'dropdown-arrow';
  arrow.textContent = '▾';
  btn.append(labelSpan, arrow);
  const list = document.createElement('div');
  list.className = 'dropdown-list';
  list.setAttribute('role','listbox');
  Array.from(select.options).forEach((opt,i)=>{
    const item = document.createElement('div');
    item.className = 'dropdown-option';
    item.setAttribute('role','option');
    item.setAttribute('data-value', opt.value || opt.text);
    item.textContent = opt.text;
    if(i === select.selectedIndex) item.setAttribute('aria-selected','true');
    item.addEventListener('click', ()=>{
      select.selectedIndex = i;
      labelSpan.textContent = opt.text;
      list.querySelectorAll('.dropdown-option[aria-selected="true"]').forEach(n=>n.setAttribute('aria-selected','false'));
      item.setAttribute('aria-selected','true');
      wrapper.setAttribute('aria-expanded','false');
      select.dispatchEvent(new Event('change', { bubbles:true }));
    });
    list.appendChild(item);
  });
  btn.addEventListener('click', ()=>{
    const expanded = wrapper.getAttribute('aria-expanded') === 'true';
    wrapper.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });
  document.addEventListener('click', (e)=>{
    if(!wrapper.contains(e.target)) wrapper.setAttribute('aria-expanded','false');
  });
  wrapper.append(btn, list);
  select.parentNode.insertBefore(wrapper, select);
  enhancedSelectMap[selector] = wrapper;
}

function updateSortArrow(){
  const wrapper = enhancedSelectMap['#sortSelect'];
  if(!wrapper) return;
  const arrow = wrapper.querySelector('.dropdown-arrow');
  if(!arrow) return;
  const val = document.querySelector('#sortSelect').value;
  arrow.style.display = val.startsWith('price') ? 'none' : '';
}

function toggleTheme(){
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  root.setAttribute('data-theme', isLight ? '' : 'light');
}

function collectForm(){
  state.priceMin = $('#priceMin').value;
  state.priceMax = $('#priceMax').value;
  state.ratingMin = Number($('#ratingMin').value);
  state.onlyInStock = $('#onlyInStock').checked;
  const onlyOut = $('#onlyOutOfStock');
  if(onlyOut){
    // mutual exclusivity
    if(onlyOut.checked) state.onlyInStock = false;
  }
}

function resetFilters(){
  state.query = '';
  state.sports.clear();
  state.brands.clear();
  state.priceMin = '';
  state.priceMax = '';
  state.ratingMin = 0;
  state.onlyInStock = false;
  $('#filtersForm').reset();
  const onlyOut = $('#onlyOutOfStock'); if(onlyOut) onlyOut.checked = false;
  $$('#sportFilters .chip, #brandFilters .chip').forEach(chip => chip.setAttribute('aria-pressed','false'));
}

function renderFilterChips(containerSel, items, set){
  const container = $(containerSel);
  container.innerHTML = '';
  items.sort().forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = item;
    btn.setAttribute('aria-pressed', set.has(item) ? 'true' : 'false');
    btn.addEventListener('click', () => {
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', pressed ? 'false' : 'true');
      if(pressed){ set.delete(item); } else { set.add(item); }
      state.page = 1; update(); pushURL();
    });
    container.appendChild(btn);
  });
}

function applyFilters(list){
  return list.filter(p => {
    if(state.query){
      const q = state.query.toLowerCase();
      const hay = `${p.name} ${p.brand} ${p.sport}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(state.sports.size && !state.sports.has(p.sport)) return false;
    if(state.brands.size && !state.brands.has(p.brand)) return false;
    if(state.category && p.category !== state.category) return false;
    if(state.subcategory && p.subcategory !== state.subcategory) return false;
    const onlyOut = $('#onlyOutOfStock')?.checked;
    if(state.onlyInStock && !p.inStock) return false;
    if(onlyOut && p.inStock) return false;
    const min = state.priceMin !== '' ? Number(state.priceMin) : -Infinity;
    const max = state.priceMax !== '' ? Number(state.priceMax) : Infinity;
    if(p.price < min || p.price > max) return false;
    if(p.rating < state.ratingMin) return false;
    return true;
  });
}

function sortProducts(list){
  const by = state.sort;
  const arr = [...list];
  switch(by){
    case 'price-asc': arr.sort((a,b)=>a.price-b.price); break;
    case 'price-desc': arr.sort((a,b)=>b.price-a.price); break;
    case 'rating-desc': arr.sort((a,b)=>b.rating-a.rating); break;
    case 'newest': arr.sort((a,b)=>b.addedAt - a.addedAt); break;
    case 'stock-out': arr.sort((a,b)=> Number(a.inStock) - Number(b.inStock)); break; // false first
    default: // relevance: prioritize matches in name > brand > sport
      if(state.query){
        const q = state.query.toLowerCase();
        arr.sort((a,b)=> score(b,q) - score(a,q));
      }
  }
  return arr;
}

function score(p,q){
  let s=0; const name=p.name.toLowerCase(), brand=p.brand.toLowerCase(), sport=p.sport.toLowerCase();
  if(name.startsWith(q)) s+=5; else if(name.includes(q)) s+=3;
  if(brand.startsWith(q)) s+=2; else if(brand.includes(q)) s+=1;
  if(sport.includes(q)) s+=0.5;
  return s + p.rating*0.05;
}

function paginate(list){
  const start = (state.page-1)*state.perPage;
  return list.slice(start, start+state.perPage);
}

function renderGrid(list, total){
  const grid = $('#productsGrid');
  grid.innerHTML = '';
  list.forEach(p => grid.appendChild(productCard(p)));
  $('#resultsCount').textContent = `Найдено: ${total}`;
}

function productCard(p){
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <div class="media"><img alt="${escapeHtml(p.name)}" src="${p.image || randomImage(p.name)}" loading="lazy"></div>
    <div class="body">
      <div class="badges">${p.inStock ? '<span class="badge">В наличии</span>' : '<span class="badge out">Нет в наличии</span>'}</div>
      <div class="title">${escapeHtml(p.name)}</div>
      <div class="muted">${p.brand} • ${p.sport}</div>
      <div class="rating">${'★'.repeat(Math.round(p.rating))}<span class="muted"> (${p.rating.toFixed(1)})</span></div>
      <div class="spacer"></div>
      <div class="price">${p.price.toLocaleString('ru-RU',{style:'currency',currency:'RUB'})}</div>
      <button class="btn primary add-to-cart" data-id="${p.id}" ${p.inStock?'':'disabled'}>В корзину</button>
    </div>`;
  const btn = el.querySelector('.add-to-cart');
  if(btn){ btn.addEventListener('click', ()=>{ addToCart(p.id, 1); }); }
  return el;
}

function renderPagination(total){
  const pages = Math.max(1, Math.ceil(total / state.perPage));
  state.page = Math.min(state.page, pages);
  const nav = $('#pagination');
  nav.innerHTML = '';
  const addBtn = (label, page, disabled=false, current=false) => {
    const b = document.createElement('button');
    b.className = 'page-btn';
    b.textContent = label;
    if(current) b.setAttribute('aria-current','page');
    if(disabled) b.disabled = true;
    b.addEventListener('click', () => { state.page = page; update(); pushURL(false); window.scrollTo({top:0,behavior:'smooth'}); });
    nav.appendChild(b);
  };
  addBtn('«', 1, state.page===1);
  addBtn('‹', Math.max(1,state.page-1), state.page===1);
  for(let p=Math.max(1,state.page-2); p<=Math.min(pages, state.page+2); p++){
    addBtn(String(p), p, false, p===state.page);
  }
  addBtn('›', Math.min(pages,state.page+1), state.page===pages);
  addBtn('»', pages, state.page===pages);
}

function update(){
  const filtered = applyFilters(products);
  const sorted = sortProducts(filtered);
  const paged = paginate(sorted);
  renderGrid(paged, filtered.length);
  renderPagination(filtered.length);
}

function pushURL(includePage=true){
  const params = new URLSearchParams();
  if(state.query) params.set('q', state.query);
  if(state.sports.size) params.set('sport', [...state.sports].join(','));
  if(state.brands.size) params.set('brand', [...state.brands].join(','));
  if(state.priceMin!=='') params.set('min', state.priceMin);
  if(state.priceMax!=='') params.set('max', state.priceMax);
  if(state.ratingMin>0) params.set('rate', String(state.ratingMin));
  if(state.onlyInStock) params.set('stock','1');
  if(state.sort!=='relevance') params.set('sort', state.sort);
  if(state.perPage!==12) params.set('pp', String(state.perPage));
  if(state.category) params.set('cat', state.category);
  if(state.subcategory) params.set('sub', state.subcategory);
  if(includePage && state.page>1) params.set('p', String(state.page));
  const qs = params.toString();
  history.replaceState({}, '', qs ? `?${qs}` : location.pathname);
}

function hydrateFromURL(){
  const params = new URLSearchParams(location.search);
  state.query = params.get('q') || '';
  $('#searchInput').value = state.query;
  (params.get('sport')||'').split(',').filter(Boolean).forEach(s=>state.sports.add(s));
  (params.get('brand')||'').split(',').filter(Boolean).forEach(b=>state.brands.add(b));
  $('#priceMin').value = state.priceMin = params.get('min') || '';
  $('#priceMax').value = state.priceMax = params.get('max') || '';
  $('#ratingMin').value = String(state.ratingMin = Number(params.get('rate')||0));
  $('#onlyInStock').checked = state.onlyInStock = params.get('stock')==='1';
  state.sort = params.get('sort') || 'relevance';
  if(state.sort==='price-asc'){ const el=document.getElementById('sortAsc'); if(el) el.checked=true; }
  if(state.sort==='price-desc'){ const el=document.getElementById('sortDesc'); if(el) el.checked=true; }
  const pp = Number(params.get('pp')||12); state.perPage = pp;
  const perSel = document.getElementById('perPageSelect'); if(perSel) perSel.value = String(pp);
  state.page = Number(params.get('p')||1);
  state.category = params.get('cat') || '';
  state.subcategory = params.get('sub') || '';
}

function debounce(fn, ms){
  let id; return (...args)=>{ clearTimeout(id); id=setTimeout(()=>fn.apply(null,args), ms); };
}

function escapeHtml(s){
  const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' };
  return String(s).replace(/[&<>"']/g, ch=>map[ch]);
}

function randomImage(seed){
  const id = Math.abs(hashCode(seed))%1000;
  return `https://picsum.photos/seed/${id}/600/400`;
}
function hashCode(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return h; }

function generateSampleProducts(){
  const sports = ['Бадминтон','Футбол','Баскетбол','Теннис','Бег','Фитнес'];
  const brands = ['Yonex','Li ning','Taan','Victor','Kumpoo'];
  const apparelSubs = ['футболки','шорты','юбки','носки','кроссовки'];
  const accessorySubs = ['обмотки','Сумки и рюкзаки'];
  const items = [];
  let id=1;
  for(const sport of sports){
    for(let i=0;i<18;i++){
      const brand = brands[(i+sport.length)%brands.length];
      const name = `${sport} — ${brand} #${i+1}`;
      const price = Math.round(800 + Math.random()*20000);
      const rating = Math.round((3 + Math.random()*2)*10)/10; // 3.0 - 5.0
      const inStock = Math.random()>0.2;
      const addedAt = Date.now() - Math.floor(Math.random()*120)*86400000;
      // Assign categories for browsing
      const category = i%3===0 ? 'Одежда' : (i%3===1 ? 'Аксессуары' : 'Ракетки');
      const subcategory = category==='Одежда' ? apparelSubs[i%apparelSubs.length]
        : category==='Аксессуары' ? accessorySubs[i%accessorySubs.length] : '';
      items.push({ id:id++, name, brand, sport, price, rating, inStock, addedAt, image: randomImage(name), category, subcategory });
    }
  }
  return items;
}

async function loadFromSupabase(){
  if(!supabaseClient) return false;
  try{
    const { data, error } = await supabaseClient
      .from('products_view')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(500);
    if(error) throw error;
    products = (data||[]).map(row => ({
      id: row.id,
      name: row.name,
      brand: row.brand_name || row.brand,
      sport: row.sport,
      price: row.price,
      rating: row.rating ?? 4.5,
      inStock: row.in_stock ?? true,
      addedAt: new Date(row.created_at).getTime(),
      image: row.image_url || null,
    }));
    return true;
  }catch(e){
    console.warn('Supabase load failed', e);
    return false;
  }
}


