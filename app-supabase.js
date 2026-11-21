/* =========================================================
   บ้านผัก — ชั้นเชื่อมต่อ Supabase
   - โหลดสินค้า/ชุด/ราคา จากฐานข้อมูล (ถ้าโหลดไม่ได้ ใช้ข้อมูลในไฟล์แทน)
   - ล็อกอินผู้ดูแล → ใช้งาน เคาน์เตอร์ / หลังบ้าน / แดชบอร์ด
   - บันทึก: ราคา, สินค้าใหม่, รูป, ออเดอร์ออนไลน์, บิลเคาน์เตอร์
   ========================================================= */
const SB_URL = 'https://frtcdigitkwpuzafwdlf.supabase.co';
const SB_KEY = 'sb_publishable_jD8WjHd4N_GHBairuruoJA_IA-LEPZV';
if (!window.supabase) throw new Error('โหลด supabase-js ไม่ได้');
const sb = window.supabase.createClient(SB_URL, SB_KEY);
let IS_ADMIN = false, ME = null;
const STOCK = {};   // id → คงเหลือ (สินค้าชั่ง = กรัม, อื่นๆ = ชิ้น/ชุด) · null = ไม่จำกัด

/* ---------- 1) โหลดข้อมูลจากฐานข้อมูล ---------- */
async function loadFromDB(){
  const [p, k, ki] = await Promise.all([
    sb.from('products').select('*, farms(name)').order('category_id'),
    sb.from('kits').select('*'),
    sb.from('kit_items').select('*'),
  ]);
  if (p.error || k.error || ki.error || !p.data?.length) throw (p.error || k.error || ki.error || new Error('no data'));
  const veg = [], goods = [];
  for (const k in STOCK) delete STOCK[k];
  for (const r of p.data) {
    if (r.photo_url) PHOTOS[r.id] = r.photo_url;
    STOCK[r.id] = r.stock == null ? null : +r.stock;
    if (!r.active) continue;
    if (r.sell_by === 'weight') veg.push({ id:r.id, n:r.name, e:r.emoji, c:r.category_id, p:+r.price, cost:+r.cost, loss:+r.loss_pct,
      farm:r.farms?.name || '', s:r.season_months || undefined, k:r.storage || undefined, d:r.shelf_days || undefined, col:r.color || undefined,
      prep: /ซอย|พร้อมใช้/.test(r.name) });
    else goods.push({ id:r.id, n:r.name, e:r.emoji, c:r.category_id, p:+r.price, cost:+r.cost, u:r.unit || 'ชิ้น' });
  }
  const kits = k.data.filter(r=>r.active).map(r => {
    if (r.photo_url) PHOTOS[r.id] = r.photo_url;
    STOCK[r.id] = r.stock == null ? null : +r.stock;
    return { id:r.id, grp: r.grp==='kit' ? undefined : r.grp, n:r.name, t:r.kit_type, e:r.emoji, serv:r.serving, p:+r.price,
      pack: r.pack_cost!=null ? +r.pack_cost : undefined, labor: r.labor_cost!=null ? +r.labor_cost : undefined, whole:r.whole, tip:r.tip,
      bom: ki.data.filter(i=>i.kit_id===r.id).map(i=>[i.product_id, +i.qty]) };
  });
  const order = id => KITS.findIndex(x=>x.id===id);           // คงลำดับเดิมในไฟล์
  kits.sort((a,b)=> (order(a.id)<0?999:order(a.id)) - (order(b.id)<0?999:order(b.id)));
  VEG.length = 0; VEG.push(...veg); GOODS.length = 0; GOODS.push(...goods); KITS.length = 0; KITS.push(...kits);
  for (const key in byId) delete byId[key];
  [...VEG, ...GOODS].forEach(x => byId[x.id] = x);
}
function rerenderAll(){ for (const f of [renderCats, renderShop, renderCart, renderBack, renderDash, fillPhSel, renderPos]) { try { f(); } catch(e) { console.warn(e); } } }

/* ---------- 2) ล็อกอินผู้ดูแล ---------- */
async function refreshAuth(){
  const { data:{ session } } = await sb.auth.getSession();
  ME = session?.user || null; IS_ADMIN = false;
  if (ME) { const r = await sb.rpc('is_admin'); IS_ADMIN = !!r.data; }
  document.body.classList.toggle('is-admin', IS_ADMIN);
  const b = document.getElementById('authBtn');
  if (b) b.textContent = IS_ADMIN ? '🔓 ' + (ME.email||'').split('@')[0] : '🔐';
  if (b) b.style.display = IS_ADMIN ? '' : 'none';
  document.body.classList.toggle('admin', !!IS_ADMIN);
}
function loginModal(after){
  openModal(`<h3>🔐 เข้าสู่ระบบผู้ดูแล</h3><p class="meta">เคาน์เตอร์ หลังบ้าน และแดชบอร์ด ใช้ได้เฉพาะผู้ดูแลร้าน</p>
    <form id="lgForm" class="addf" style="grid-template-columns:1fr">
      <label>อีเมล<input id="lgEmail" type="email" required autocomplete="username"></label>
      <label>รหัสผ่าน<input id="lgPass" type="password" required autocomplete="current-password"></label>
      <div class="meta" id="lgMsg"></div><button class="btn full" type="submit">เข้าสู่ระบบ</button>
      <button class="btn ghost full" type="button" id="lgSignup">สร้างบัญชีผู้ดูแล (ครั้งแรก)</button>
    </form>`);
  document.getElementById('lgSignup').onclick = async () => {
    const msg = document.getElementById('lgMsg'), email = lgEmail.value.trim(), pass = lgPass.value;
    if (!email || pass.length < 8) { msg.textContent = 'ใส่อีเมล และตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร'; return; }
    msg.textContent = 'กำลังสร้างบัญชี…';
    const { data, error } = await sb.auth.signUp({ email, password: pass, options:{ emailRedirectTo: location.origin } });
    if (error) { msg.textContent = '❌ ' + error.message; return; }
    if (!data.session) { msg.textContent = '📧 ส่งอีเมลยืนยันแล้ว เปิดอีเมลแล้วกดลิงก์ยืนยัน จากนั้นกลับมาเข้าสู่ระบบ'; return; }
    await refreshAuth();
    msg.textContent = IS_ADMIN ? '✅ สร้างบัญชีแล้ว' : '⚠️ สร้างบัญชีแล้ว แต่อีเมลนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล';
    if (IS_ADMIN) { closeModal(); await loadPosSalesFromDB(); rerenderAll(); after && after(); }
  };
  document.getElementById('lgForm').onsubmit = async e => {
    e.preventDefault(); const msg = document.getElementById('lgMsg'); msg.textContent = 'กำลังเข้าสู่ระบบ…';
    const { error } = await sb.auth.signInWithPassword({ email: lgEmail.value.trim(), password: lgPass.value });
    if (error) { msg.textContent = '❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง'; return; }
    await refreshAuth();
    if (!IS_ADMIN) { msg.textContent = '⚠️ บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล'; return; }
    closeModal(); toast('เข้าสู่ระบบแล้ว'); await loadPosSalesFromDB(); rerenderAll(); after && after();
  };
}
// ปุ่มล็อกอินบนแถบด้านบน
(function(){
  const b = document.createElement('button'); b.id='authBtn'; b.className='cartbtn'; b.style.background='rgba(255,255,255,.18)'; b.textContent='🔐';
  b.style.display='none'; // แสดงเฉพาะตอนเป็นผู้ดูแล
  document.querySelector('.top').insertBefore(b, document.getElementById('cartBtn'));
  const al=document.getElementById('adminLink'); if(al) al.onclick=()=>{ IS_ADMIN ? document.querySelector('#views [data-v=back]').click() : loginModal(); };
  // แตะโลโก้ "บ้านผัก" 5 ครั้งติดกัน → เข้าระบบหลังบ้าน
  let taps=0, tt=null; const goBack=()=>document.querySelector('#views [data-v=back]').click();
  const br=document.querySelector('.top .brand'); if(br){ br.style.cursor='pointer'; br.style.userSelect='none'; br.style.webkitUserSelect='none';
    br.addEventListener('click',()=>{ taps++; clearTimeout(tt); tt=setTimeout(()=>taps=0,1500);
      if(taps>=5){ taps=0; IS_ADMIN ? goBack() : loginModal(goBack); } }); }
  if (location.hash==='#admin') setTimeout(()=>{ if(!IS_ADMIN) loginModal(); },800);
  b.onclick = async () => { if (IS_ADMIN) { await sb.auth.signOut(); await refreshAuth(); toast('ออกจากระบบแล้ว'); document.querySelector('#views [data-v=shop]').click(); } else loginModal(); };
})();
// กันเข้าแท็บผู้ดูแลถ้ายังไม่ล็อกอิน
document.addEventListener('click', e => {
  const t = e.target.closest('#views [data-v]'); if (!t || t.dataset.v==='shop' || IS_ADMIN) return;
  e.stopImmediatePropagation(); e.preventDefault(); loginModal(() => t.click());
}, true);

/* ---------- 3) บันทึกการแก้ไขในหลังบ้าน ---------- */
const save = async (q, ok) => { const { error } = await q; if (error) { toast('❌ บันทึกไม่สำเร็จ: ' + error.message); console.error(error); } else if (ok) toast(ok); };
document.addEventListener('change', e => {
  if (!IS_ADMIN) return;
  const d = e.target.dataset, v = parseFloat(e.target.value); if (isNaN(v)) return;
  if (d.kp) save(sb.from('kits').update({ price:v }).eq('id', d.kp), '💾 บันทึกราคาชุดแล้ว');
  else if (d.vc) save(sb.from('products').update({ cost:v }).eq('id', d.vc), '💾 บันทึกต้นทุนแล้ว');
  else if (d.vp) save(sb.from('products').update({ price:v }).eq('id', d.vp), '💾 บันทึกราคาขายแล้ว');
  else if (d.vl) save(sb.from('products').update({ loss_pct:v }).eq('id', d.vl), '💾 บันทึก % สูญเสียแล้ว');
});
// สินค้าใหม่ → ฐานข้อมูล
const _addProduct = addProduct;
addProduct = function(o){
  _addProduct(o);
  if (!IS_ADMIN || o._fromDB) return;
  (async () => {
    let farm_id = null;
    if (o.farm && o.farm !== 'ยังไม่ระบุสวน') {
      const f = await sb.from('farms').upsert({ name:o.farm }, { onConflict:'name' }).select('id').single();
      farm_id = f.data?.id ?? null;
    }
    const unit = ['pack','pantry','home'].includes(o.c);
    await save(sb.from('products').insert({ id:o.id, name:o.n, category_id:o.c, sell_by: unit?'unit':'weight', emoji:o.e, price:o.p, cost:o.cost,
      loss_pct: o.loss ?? 0, unit: o.u ?? null, farm_id, season_months: o.s ?? null, storage:o.k ?? null, shelf_days:o.d ?? null }), '💾 เพิ่มสินค้าลงฐานข้อมูลแล้ว');
  })();
};
store.get = () => []; store.set = () => {};                      // เลิกใช้ localStorage สำหรับสินค้า
// ลบสินค้าที่เพิ่มเอง → ปิดขาย
document.addEventListener('click', e => { const d = e.target.closest('[data-delp]'); if (d && IS_ADMIN) save(sb.from('products').update({ active:false }).eq('id', d.dataset.delp), 'ปิดการขายสินค้าแล้ว'); });

/* ---------- 4) รูปสินค้า → Supabase Storage ---------- */
setPhoto = async function(id, file){
  if (!IS_ADMIN) { $('#phMsg').textContent = 'ต้องเข้าสู่ระบบผู้ดูแลก่อน'; return; }
  $('#phMsg').textContent = 'กำลังอัปโหลด…';
  let dataUrl; try { dataUrl = await shrink(file, 900); } catch(e) { $('#phMsg').textContent='❌ เปิดไฟล์ภาพนี้ไม่ได้'; return; }
  const blob = await (await fetch(dataUrl)).blob(), path = `${id}-${Date.now()}.jpg`;
  const up = await sb.storage.from('product-photos').upload(path, blob, { contentType:'image/jpeg', upsert:true });
  if (up.error) { $('#phMsg').textContent = '❌ อัปโหลดไม่สำเร็จ: ' + up.error.message; return; }
  const url = sb.storage.from('product-photos').getPublicUrl(path).data.publicUrl;
  const table = KITS.some(k=>k.id===id) ? 'kits' : 'products';
  const r = await sb.from(table).update({ photo_url:url }).eq('id', id);
  if (r.error) { $('#phMsg').textContent = '❌ บันทึกไม่สำเร็จ: ' + r.error.message; return; }
  PHOTOS[id] = url; $('#phMsg').textContent = '✅ บันทึกรูปแล้ว ทุกเครื่องเห็นรูปนี้'; fillPhSel(); renderShop();
};
document.getElementById('phDel').addEventListener('click', () => {
  if (!IS_ADMIN) return; const id = $('#phSel').value, table = KITS.some(k=>k.id===id) ? 'kits' : 'products';
  save(sb.from(table).update({ photo_url:null }).eq('id', id), 'ลบรูปที่ใส่เองแล้ว');
}, true);
savePhotos = () => true;

/* ---------- 5) สั่งซื้อออนไลน์ → place_order (ราคาคิดจากฐานข้อมูล) + ที่อยู่ + ชำระเงิน ---------- */
const SHOP_PP = '0863515259';   // พร้อมเพย์ร้าน
let cuLat = null, cuLng = null, payM = 'promptpay';
const fld = 'width:100%;padding:9px;border-radius:10px;border:1px solid var(--line);font:inherit;margin:4px 0;box-sizing:border-box';
const _renderCart = renderCart;
renderCart = function(){
  const keep = {}; ['cuName','cuPhone','cuAddr'].forEach(i=>{ const el=document.getElementById(i); if(el) keep[i]=el.value; });
  _renderCart();
  const ck = document.getElementById('checkout'); if (!ck || document.getElementById('cuName')) return;
  const pickup = /รับเอง/.test(slot);
  ck.insertAdjacentHTML('beforebegin', `<div style="margin-top:8px;font-family:Prompt;font-size:14px">📦 ข้อมูลผู้รับ</div>
    <input id="cuName" placeholder="ชื่อผู้รับ" style="${fld}">
    <input id="cuPhone" placeholder="เบอร์โทร" inputmode="tel" style="${fld}">
    ${pickup ? '<div class="meta" style="margin:4px 0">🏪 รับเองที่ร้าน — ไม่ต้องกรอกที่อยู่ ไม่มีค่าส่ง</div>' : `
    <textarea id="cuAddr" rows="2" placeholder="ที่อยู่จัดส่ง (บ้านเลขที่ ซอย ถนน จุดสังเกต)" style="${fld};resize:vertical"></textarea>
    <button type="button" class="btn sm ghost full" id="cuGps" style="margin:2px 0 4px">${cuLat?'✅ ปักหมุดแล้ว':'📍 ใช้ตำแหน่งปัจจุบัน (ช่วยให้ส่งถูกที่)'}</button>`}
    <div style="margin-top:6px;font-family:Prompt;font-size:14px">💳 วิธีชำระเงิน</div>
    <div class="seg" style="margin:4px 0 8px"><button type="button" data-pay="promptpay" class="${payM==='promptpay'?'on':''}">พร้อมเพย์ (สแกน QR)</button><button type="button" data-pay="cod" class="${payM==='cod'?'on':''}">${pickup?'จ่ายที่ร้าน':'เก็บเงินปลายทาง'}</button></div>`);
  for (const k in keep) { const el=document.getElementById(k); if(el) el.value=keep[k]; }
  ck.textContent = 'ยืนยันคำสั่งซื้อ';
};
document.addEventListener('click', e => {
  const pb = e.target.closest('[data-pay]'); if (pb) { payM = pb.dataset.pay; pb.parentElement.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===pb)); return; }
  if (e.target.id === 'cuGps') {
    if (!navigator.geolocation) { toast('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง'); return; }
    e.target.textContent = 'กำลังหาตำแหน่ง…';
    navigator.geolocation.getCurrentPosition(p => { cuLat = p.coords.latitude; cuLng = p.coords.longitude; e.target.textContent = '✅ ปักหมุดแล้ว'; },
      () => { e.target.textContent = '📍 ใช้ตำแหน่งปัจจุบัน (ช่วยให้ส่งถูกที่)'; toast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — กรอกที่อยู่อย่างเดียวได้'); }, { enableHighAccuracy:true, timeout:10000 });
  }
});
document.addEventListener('click', async e => {
  if (e.target.id !== 'checkout') return;
  e.stopImmediatePropagation();
  const name = $('#cuName').value.trim(), phone = $('#cuPhone').value.trim();
  const pickup = /รับเอง/.test(slot), addr = pickup ? '' : ($('#cuAddr')?.value.trim() || '');
  if (!name || phone.replace(/\D/g,'').length < 9) { toast('กรอกชื่อและเบอร์โทรให้ครบก่อน'); return; }
  if (!pickup && addr.length < 5) { toast('กรอกที่อยู่จัดส่งก่อน'); $('#cuAddr').focus(); return; }
  const items = Object.keys(cart).filter(k=>cart[k]>0).map(k=>({ id:k, qty:cart[k] }));
  e.target.disabled = true; e.target.textContent = 'กำลังส่งคำสั่งซื้อ…';
  const { data, error } = await sb.rpc('place_order', { items, customer_name:name, phone, delivery_slot:slot, no_bag:noBag,
    address: addr || null, lat: pickup?null:cuLat, lng: pickup?null:cuLng, pay_method: payM });
  if (error) { const oos = /OUT_OF_STOCK:(.+)/.exec(error.message||''); toast(oos ? '❌ '+oos[1]+' เหลือไม่พอ — ปรับจำนวนแล้วลองใหม่' : '❌ ส่งคำสั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้ง'); if (oos) loadFromDB().then(rerenderAll).catch(()=>{}); console.error(error); e.target.disabled=false; e.target.textContent='ยืนยันคำสั่งซื้อ'; return; }
  cart = {}; cuLat = cuLng = null; renderCart(); openCart(false);
  const sum = `เลขที่ออเดอร์ <b>#${data.order_id}</b><br>ยอดที่ต้องชำระ <b style="font-size:1.25em">${baht(data.total)}</b> (ค่าส่ง ${data.shipping?baht(data.shipping):'ฟรี'})<br>รอบส่ง ${esc(slot)}`;
  if (payM === 'promptpay') {
    openModal(`<h3>✅ รับคำสั่งซื้อแล้ว — ชำระเงิน</h3><p>${sum}</p>
      <div style="text-align:center"><div id="ckQr" style="display:inline-block;padding:10px;background:#fff;border-radius:12px"></div>
      <div class="meta">สแกนด้วยแอปธนาคาร · พร้อมเพย์ ${SHOP_PP.replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3')}</div></div>
      <label class="btn full ghost" style="margin-top:10px;cursor:pointer">📎 แนบสลิปการโอน<input type="file" id="slipIn" accept="image/*" hidden></label>
      <div id="slipMsg" class="meta" style="text-align:center;margin:6px 0"></div>
      <button class="btn full" data-close>เสร็จสิ้น</button>`);
    try { new QRCode(document.getElementById('ckQr'), { text: promptPay(SHOP_PP, data.total), width:200, height:200, correctLevel: QRCode.CorrectLevel.M }); } catch(err) { console.warn(err); }
    document.getElementById('slipIn').onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return; const msg = document.getElementById('slipMsg');
      if (f.size > 8e6) { msg.textContent = '❌ ไฟล์ใหญ่เกิน 8MB'; return; }
      msg.textContent = 'กำลังส่งสลิป…';
      const path = `slips/${data.order_id}-${Date.now()}.${(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')}`;
      const up = await sb.storage.from('order-slips').upload(path, f, { contentType: f.type });
      if (up.error) { msg.textContent = '❌ ส่งสลิปไม่สำเร็จ ลองอีกครั้ง'; console.error(up.error); return; }
      const r = await sb.rpc('attach_slip', { order_id: data.order_id, path });
      msg.textContent = r.error ? '❌ บันทึกสลิปไม่สำเร็จ' : '✅ ได้รับสลิปแล้ว ร้านจะตรวจสอบและจัดส่งตามรอบ';
    };
  } else {
    openModal(`<h3>✅ รับคำสั่งซื้อแล้ว</h3><p>${sum}<br>ชำระเงิน: ${pickup?'จ่ายที่ร้าน':'เก็บเงินปลายทาง'}<br>แต้มรักษ์โลกที่ได้ 🌱 ${data.points}</p><p class="meta">ร้านจะติดต่อกลับที่เบอร์ ${esc(phone)}</p><button class="btn full" data-close>ตกลง</button>`);
  }
}, true);

/* ---------- 6) บิลเคาน์เตอร์ → orders (channel = pos) ---------- */
const _finish = finish;
finish = function(method, extra = {}){
  _finish(method, extra);
  const s = posSales[posSales.length - 1]; if (!IS_ADMIN || !s) return;
  (async () => {
    const sub = s.lines.reduce((a,l)=>a+l.t,0);
    const o = await sb.from('orders').insert({ channel:'pos', bill_no:s.no, status:'done', payment_method: s.method==='card' ? 'card' : s.method,
      subtotal: sub, total: s.total, discount_pct: s.disc, received: s.received ?? null, change_amt: s.change ?? null, pay_ref: s.ref || null }).select('id').single();
    if (o.error) { toast('⚠️ บันทึกบิลลงฐานข้อมูลไม่สำเร็จ (เก็บไว้ในเครื่องแล้ว)'); console.error(o.error); return; }
    const isKit = id => KITS.some(k=>k.id===id);
    await save(sb.from('order_items').insert(s.lines.map(l => ({ order_id:o.data.id, kit_id: isKit(l.id)?l.id:null, product_id: isKit(l.id)?null:l.id,
      qty: l.kind==='w' ? l.g/100 : l.q, grams: l.kind==='w' ? l.g : null, unit_price:l.p, line_total:l.t, name:l.n }))));
  })();
};
async function loadPosSalesFromDB(){
  if (!IS_ADMIN) return;
  const since = new Date(); since.setDate(since.getDate()-2);
  const { data, error } = await sb.from('orders').select('*, order_items(*)').eq('channel','pos').gte('created_at', since.toISOString()).order('created_at');
  if (error || !data) return;
  posSales = data.map(o => { const t = new Date(o.created_at);
    return { no:o.bill_no, day:t.toISOString().slice(0,10), time:t.toTimeString().slice(0,5), method:o.payment_method, total:+o.total, disc:+o.discount_pct,
      received:o.received!=null?+o.received:undefined, change:o.change_amt!=null?+o.change_amt:undefined, ref:o.pay_ref, void:o.is_void,
      lines:o.order_items.map(i=>({ id:i.kit_id||i.product_id, n:i.name, kind:i.grams?'w':'u', q:+i.qty, g:i.grams?+i.grams:undefined, p:+i.unit_price, t:+i.line_total })) }; });
}
document.addEventListener('click', e => { const d = e.target.closest('[data-vok]'); if (d && IS_ADMIN) save(sb.from('orders').update({ is_void:true }).eq('bill_no', d.dataset.vok), 'ยกเลิกบิลแล้ว'); });

/* ---------- 7) เริ่มทำงาน ---------- */
(async () => {
  try { await loadFromDB(); rerenderAll(); }
  catch (e) { console.warn('ใช้ข้อมูลสำรองในไฟล์', e); toast('⚠️ ต่อฐานข้อมูลไม่ได้ ใช้ข้อมูลสำรอง'); }
  await refreshAuth();
  if (IS_ADMIN) { await loadPosSalesFromDB(); renderPosSummary(); }
  sb.auth.onAuthStateChange(() => refreshAuth());
})();

/* =========================================================
   8) ออเดอร์ออนไลน์ + ใบเตรียมของ + ยอดขายจริง (เฉพาะผู้ดูแล)
   ========================================================= */
const ST = { new:'🆕 ใหม่', packing:'📦 กำลังแพ็ก', delivering:'🛵 กำลังส่ง', done:'✅ ส่งแล้ว', cancelled:'✖️ ยกเลิก' };
let ORDERS = [];
(function injectAdminSections(){
  const back = document.getElementById('v-back');
  back.insertAdjacentHTML('afterbegin', `
    <div class="sec-h"><h2>📦 ออเดอร์ออนไลน์</h2><span><button class="btn sm ghost" id="ordReload">↻ โหลดใหม่</button></span></div>
    <div class="cats" id="ordTabs"></div>
    <div class="tw" style="margin-bottom:12px"><table class="tbl" id="ordTbl"></table></div>
    <div class="sec-h"><h2>🔪 ใบเตรียมของ</h2><span class="meta">จากออเดอร์ที่ยังไม่ส่ง (ใหม่ + กำลังแพ็ก)</span></div>
    <div class="two" style="margin-bottom:16px"><div class="panel"><div class="ph"><h3>ชุด/กล่องที่ต้องแพ็ก</h3></div><div id="prepKits"></div></div>
      <div class="panel"><div class="ph"><h3>วัตถุดิบที่ต้องเตรียม (รวมส่วนสูญเสีย)</h3></div><div id="prepRaw"></div></div></div>`);
  document.getElementById('v-dash').insertAdjacentHTML('afterbegin', `
    <div class="sec-h"><h2>💰 ยอดขายจริงจากระบบ</h2><div class="seg" id="realRange"><button data-rr="1" class="on">วันนี้</button><button data-rr="7">7 วัน</button><button data-rr="30">30 วัน</button></div></div>
    <div class="kpis big" id="realKpi"><div class="kpi"><div>เข้าสู่ระบบเพื่อดูยอดขายจริง</div></div></div>
    <div class="panel"><div class="ph"><h3>สินค้าขายดี (ยอดจริง)</h3></div><div id="realTop" class="meta">—</div></div>
    <p class="note" style="margin:4px 0 18px">ส่วนด้านล่างเป็นข้อมูลจำลองสำหรับวางแผน</p>`);
})();
let ordFilter = 'open', realDays = 1;
async function loadOrders(){
  if (!IS_ADMIN) return;
  const since = new Date(); since.setDate(since.getDate() - 30);
  const { data, error } = await sb.from('orders').select('*, order_items(*)').gte('created_at', since.toISOString()).order('created_at', { ascending:false });
  if (error) { toast('❌ โหลดออเดอร์ไม่ได้'); console.error(error); return; }
  ORDERS = data; renderOrders(); renderPrep(); renderReal();
}
function renderOrders(){
  const online = ORDERS.filter(o => o.channel === 'online');
  const tabs = [['open','ยังไม่ส่ง'],['new',ST.new],['packing',ST.packing],['delivering',ST.delivering],['done',ST.done],['all','ทั้งหมด']];
  const cnt = f => online.filter(o => f==='all' || (f==='open' ? ['new','packing','delivering'].includes(o.status) : o.status===f)).length;
  $('#ordTabs').innerHTML = tabs.map(([f,n]) => `<button class="tab ${f===ordFilter?'on':''}" data-of="${f}">${n} (${cnt(f)})</button>`).join('');
  const list = online.filter(o => ordFilter==='all' || (ordFilter==='open' ? ['new','packing','delivering'].includes(o.status) : o.status===ordFilter));
  $('#ordTbl').innerHTML = `<tr><th>#</th><th>เวลา</th><th>ลูกค้า</th><th>รอบส่ง</th><th class="r">ยอด</th><th>สถานะ</th></tr>` +
    (list.map(o => { const t = new Date(o.created_at);
      return `<tr class="k" data-ord="${o.id}"><td>#${o.id}</td><td>${t.toLocaleDateString('th-TH',{day:'numeric',month:'short'})} ${t.toTimeString().slice(0,5)}</td>
        <td>${esc(o.customer_name||'-')}<br><a class="meta" href="tel:${esc(o.phone||'')}">${esc(o.phone||'')}</a></td><td class="meta">${esc(o.delivery_slot||'')}${o.no_bag?'<br>🌍 ไม่รับถุง':''}${o.address?'<br>🏠 '+esc(o.address):''}${o.lat?`<br><a href="https://maps.google.com/?q=${+o.lat},${+o.lng}" target="_blank" rel="noopener">📍 เปิดแผนที่</a>`:''}</td>
        <td class="r">${baht(+o.total)}<br>${payBadge(o)}</td>
        <td><select data-os="${o.id}" class="in" style="width:auto;text-align:left">${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${k===o.status?'selected':''}>${v}</option>`).join('')}</select></td></tr>
        <tr class="det" data-odet="${o.id}" hidden><td colspan="6">${o.order_items.map(i=>`${esc(i.name||i.kit_id||i.product_id)} — ${i.grams?(+i.grams)+' ก.':(+i.qty)+' ชิ้น'} · ${baht(+i.line_total)}`).join('<br>')}</td></tr>`; }).join('')
     || '<tr><td colspan="6" class="meta">ไม่มีออเดอร์ในกลุ่มนี้</td></tr>');
}
const payBadge = o => o.channel!=='online' ? '' : o.payment_method==='cod' ? '<span class="meta">💵 ปลายทาง</span>'
  : o.pay_status==='paid' ? '<span style="color:#2f7d3c">✅ จ่ายแล้ว</span>'
  : o.slip_path ? `<button class="btn sm ghost" data-slip="${o.id}">🧾 ดูสลิป</button>` : '<span style="color:#c62828">⏳ รอโอน</span>';
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-slip]'); if (!b || !IS_ADMIN) return; e.stopPropagation();
  const o = ORDERS.find(x => String(x.id) === b.dataset.slip); if (!o) return;
  const { data, error } = await sb.storage.from('order-slips').createSignedUrl(o.slip_path, 600);
  if (error) { toast('❌ เปิดสลิปไม่ได้'); return; }
  openModal(`<h3>สลิปออเดอร์ #${o.id} · ${baht(+o.total)}</h3><img src="${data.signedUrl}" style="width:100%;border-radius:10px"><div class="two" style="margin-top:10px"><button class="btn" data-paid="${o.id}">✅ ยืนยันรับเงินแล้ว</button><button class="btn ghost" data-close>ปิด</button></div>`);
}, true);
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-paid]'); if (!b || !IS_ADMIN) return;
  const { error } = await sb.from('orders').update({ pay_status:'paid' }).eq('id', b.dataset.paid);
  if (error) { toast('❌ บันทึกไม่สำเร็จ'); return; }
  const o = ORDERS.find(x => String(x.id) === b.dataset.paid); if (o) o.pay_status = 'paid';
  closeModal(); toast('บันทึกรับเงินแล้ว'); renderOrders();
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderPrep(){
  const open = ORDERS.filter(o => o.channel==='online' && ['new','packing'].includes(o.status));
  const kitsCnt = {}, raw = {};
  const addRaw = (id, g) => { raw[id] = (raw[id]||0) + g; };
  for (const o of open) for (const i of o.order_items) {
    if (i.kit_id) { kitsCnt[i.kit_id] = (kitsCnt[i.kit_id]||0) + (+i.qty);
      const k = KITS.find(x=>x.id===i.kit_id); if (!k) continue;
      for (const [pid, q] of k.bom) { const v = byId[pid]; if (!v) continue;
        if (isVeg(pid)) addRaw(pid, q * (k.whole ? 1 : 1 + (v.loss||0)/100) * (+i.qty)); else addRaw(pid, q * (+i.qty)); } }
    else if (i.product_id) { const v = byId[i.product_id]; if (!v) continue; addRaw(i.product_id, isVeg(i.product_id) ? (+i.grams || +i.qty*100) : +i.qty); }
  }
  const kl = Object.entries(kitsCnt).sort((a,b)=>b[1]-a[1]);
  $('#prepKits').innerHTML = kl.length ? kl.map(([id,n]) => { const k = KITS.find(x=>x.id===id); return `<div class="pl"><div>${k?k.n:id}</div><b style="font-family:Prompt">${n} ชุด</b></div>`; }).join('') : '<div class="meta">ยังไม่มีชุดที่ต้องแพ็ก</div>';
  const rl = Object.entries(raw).sort((a,b)=>b[1]-a[1]);
  $('#prepRaw').innerHTML = rl.length ? rl.map(([id,g]) => { const v = byId[id];
      const amt = isVeg(id) ? (g>=1000 ? (g/1000).toFixed(2)+' กก.' : Math.round(g)+' ก.') : (Math.round(g*10)/10)+' '+(v?.u||'ชิ้น');
      return `<div class="pl"><div>${v?v.e+' '+v.n:id}</div><b style="font-family:Prompt">${amt}</b></div>`; }).join('') : '<div class="meta">—</div>';
}
function renderReal(){
  if (!IS_ADMIN) return;
  const since = new Date(); since.setHours(0,0,0,0); since.setDate(since.getDate() - (realDays-1));
  const os = ORDERS.filter(o => new Date(o.created_at) >= since && !o.is_void && o.status !== 'cancelled');
  const sum = f => os.filter(f).reduce((a,o)=>a + +o.total, 0);
  const on = sum(o=>o.channel==='online'), pos = sum(o=>o.channel==='pos');
  $('#realKpi').innerHTML = `<div class="kpi"><div>ยอดขายรวม</div><b>${fmt(on+pos)}</b><small>${os.length} บิล/ออเดอร์</small></div>
    <div class="kpi"><div>🛒 ออนไลน์</div><b>${fmt(on)}</b><small>${os.filter(o=>o.channel==='online').length} ออเดอร์</small></div>
    <div class="kpi"><div>🏪 หน้าร้าน</div><b>${fmt(pos)}</b><small>${os.filter(o=>o.channel==='pos').length} บิล</small></div>
    <div class="kpi"><div>ออเดอร์รอส่ง</div><b>${ORDERS.filter(o=>o.channel==='online'&&['new','packing','delivering'].includes(o.status)).length}</b><small>ทั้งหมดที่ยังไม่ส่ง</small></div>`;
  const by = {};
  for (const o of os) for (const i of o.order_items) { const k = i.name || i.kit_id || i.product_id; by[k] = (by[k]||0) + +i.line_total; }
  const top = Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,8);
  $('#realTop').innerHTML = top.length ? `<div class="hb">${top.map(([n,v])=>`<span>${esc(n)}</span><div class="tr"><i style="width:${v/top[0][1]*100}%"></i></div><span class="v">${fmt(v)}</span>`).join('')}</div>` : 'ยังไม่มียอดขายในช่วงนี้';
}
document.addEventListener('click', e => {
  const of = e.target.closest('[data-of]'); if (of) { ordFilter = of.dataset.of; renderOrders(); return; }
  const rr = e.target.closest('[data-rr]'); if (rr) { realDays = +rr.dataset.rr; document.querySelectorAll('#realRange button').forEach(b=>b.classList.toggle('on', b===rr)); renderReal(); return; }
  if (e.target.id === 'ordReload') { loadOrders(); return; }
  const tr = e.target.closest('tr[data-ord]'); if (tr && !e.target.closest('select')) { const d = document.querySelector(`[data-odet="${tr.dataset.ord}"]`); if (d) d.hidden = !d.hidden; }
  const v = e.target.closest('#views [data-v]'); if (v && IS_ADMIN && ['back','dash'].includes(v.dataset.v)) loadOrders();
});
document.addEventListener('change', async e => {
  const id = e.target.dataset?.os; if (!id || !IS_ADMIN) return;
  const { error } = await sb.from('orders').update({ status: e.target.value }).eq('id', id);
  if (error) { toast('❌ เปลี่ยนสถานะไม่สำเร็จ'); return; }
  const o = ORDERS.find(x => String(x.id) === id); if (o) o.status = e.target.value;
  toast('อัปเดตสถานะ #' + id + ' แล้ว'); renderOrders(); renderPrep(); renderReal();
});
// แจ้งเตือนออเดอร์ใหม่แบบเรียลไทม์
sb.channel('orders-live').on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, p => {
  if (!IS_ADMIN) return; if (p.new.channel === 'online') toast('🔔 ออเดอร์ใหม่ #' + p.new.id); loadOrders();
}).subscribe();
// โหลดออเดอร์หลังล็อกอิน
const _refreshAuth = refreshAuth;
refreshAuth = async function(){ await _refreshAuth(); if (IS_ADMIN) loadOrders(); };


/* =========================================================
   9) สต็อกสินค้า
   ========================================================= */
const isW = id => VEG.some(v=>v.id===id);
const needOf = (id, n) => isW(id) ? n*100 : n;                       // ขีด → กรัม
const left = id => { const s = STOCK[id]; if (s == null) return Infinity; return s - needOf(id, cart[id]||0); };
const fmtStock = id => { const s = STOCK[id]; if (s == null) return 'ไม่จำกัด'; return isW(id) ? (s>=1000 ? (s/1000).toFixed(1)+' กก.' : Math.round(s)+' ก.') : s+' '+((itemOf(id)||{}).u||'ชิ้น'); };
const _addToCart = addToCart;
addToCart = function(key){
  const q = isW(key) ? (pick[key]||1) : 1;
  if (left(key) < needOf(key, q)) { toast(STOCK[key] <= 0 ? '😢 '+itemOf(key).n+' หมดแล้ว' : '⚠️ '+itemOf(key).n+' เหลือ '+fmtStock(key)+' เท่านั้น'); return; }
  _addToCart(key);
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cinc]'); if (!b) return;
  const k = b.dataset.cinc; if (left(k) < needOf(k,1)) { e.stopImmediatePropagation(); toast('⚠️ เหลือ '+fmtStock(k)+' เท่านั้น'); }
}, true);
function markStock(){
  document.querySelectorAll('#shopBody [data-add]').forEach(btn => {
    const id = btn.dataset.add, s = STOCK[id], card = btn.closest('.card'); if (!card) return;
    card.querySelector('.stk')?.remove(); card.classList.remove('soldout');
    if (s == null) return;
    if (s <= 0) { card.classList.add('soldout'); btn.disabled = true; btn.textContent = 'สินค้าหมด'; card.insertAdjacentHTML('afterbegin','<span class="stk out">หมด</span>'); }
    else if (isW(id) ? s <= 500 : s <= 5) card.insertAdjacentHTML('afterbegin', `<span class="stk low">เหลือ ${fmtStock(id)}</span>`);
  });
}
const _renderShop = renderShop;
renderShop = function(){ _renderShop(); markStock(); };
document.head.insertAdjacentHTML('beforeend', `<style>
.card{position:relative}.stk{position:absolute;top:8px;left:8px;z-index:3;font:600 11.5px Prompt;padding:3px 9px;border-radius:999px;color:#fff}
.stk.out{background:#555}.stk.low{background:#e65100}.card.soldout .photo,.card.soldout .thumb,.card.soldout .ptray,.card.soldout .tray{filter:grayscale(1);opacity:.55}
.card.soldout button[disabled]{background:#bbb;border-color:#bbb;cursor:not-allowed}
#stkTbl{min-width:0}.stkin{width:72px;text-align:right}.stkrow.zero td{background:#fff3f0}
.shopinfo{margin:26px 0 10px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px;line-height:1.65}
.shopinfo h2{margin:0 0 6px;font-size:19px}.shopinfo .row2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px 18px;margin:8px 0}
.shopinfo a{color:var(--green)}.shopinfo details{margin-top:8px;border-top:1px dashed var(--line);padding-top:8px}.shopinfo summary{cursor:pointer;font-family:Prompt}
</style>`);

// ส่วนจัดการสต็อกในหลังบ้าน
let stkQ = '', stkCat = 'all';
(function(){
  (document.getElementById('prepRaw')?.closest('.two') || document.getElementById('v-back').firstElementChild).insertAdjacentHTML('afterend', `
    <div class="sec-h"><h2>📦 สต็อกสินค้า</h2><span class="meta">เว้นว่าง = ไม่จำกัด · ผักชั่งน้ำหนักกรอกเป็น กก.</span></div>
    <input class="search" id="stkQ" placeholder="ค้นหาสินค้าในสต็อก…" style="margin:4px 0 6px">
    <div class="cats" id="stkCats"></div>
    <div class="tw" style="max-height:420px;overflow:auto;margin-bottom:16px"><table class="tbl" id="stkTbl"></table></div>`);
})();
function renderStock(){
  if (!IS_ADMIN) return;
  const all = [...KITS.map(k=>({id:k.id,n:k.n,e:k.e,c:k.grp||'kit',kit:true})), ...VEG, ...GOODS];
  const cats = [{id:'all',name:'ทั้งหมด'},{id:'low',name:'⚠️ ใกล้หมด/หมด'},...CATS];
  $('#stkCats').innerHTML = cats.map(c=>`<button class="tab ${c.id===stkCat?'on':''}" data-sc="${c.id}">${c.name}</button>`).join('');
  const q = stkQ.trim();
  const list = all.filter(x => (!q || x.n.includes(q)) && (stkCat==='all' || (stkCat==='low' ? (STOCK[x.id]!=null && (isW(x.id)?STOCK[x.id]<=500:STOCK[x.id]<=5)) : x.c===stkCat)));
  $('#stkTbl').innerHTML = `<tr><th>สินค้า</th><th class="r">คงเหลือ</th><th></th></tr>` + list.map(x => {
    const s = STOCK[x.id], w = isW(x.id), val = s==null ? '' : (w ? +(s/1000).toFixed(2) : s);
    return `<tr class="stkrow ${s===0?'zero':''}"><td>${x.e||''} ${esc(x.n)}</td>
      <td class="r"><input class="in stkin" type="number" min="0" step="${w?0.1:1}" data-stk="${x.id}" value="${val}" placeholder="∞"> <span class="meta">${w?'กก.':((x.u)||(x.kit?'ชุด':'ชิ้น'))}</span></td>
      <td><button class="btn sm ghost" data-stk0="${x.id}">หมด</button> <button class="btn sm ghost" data-stkn="${x.id}">∞</button></td></tr>`; }).join('');
}
async function setStock(id, v){
  const kit = KITS.some(k=>k.id===id);
  const { error } = await sb.from(kit?'kits':'products').update({ stock: v }).eq('id', id);
  if (error) { toast('❌ บันทึกสต็อกไม่สำเร็จ'); console.error(error); return; }
  STOCK[id] = v; toast('💾 สต็อก '+(itemOf(id)||KITS.find(k=>k.id===id)||{n:id}).n+' = '+fmtStock(id)); renderStock(); markStock();
}
document.addEventListener('input', e => { if (e.target.id==='stkQ') { stkQ = e.target.value; renderStock(); } });
document.addEventListener('change', e => {
  const id = e.target.dataset?.stk; if (!id || !IS_ADMIN) return;
  const raw = e.target.value.trim(); if (raw === '') return setStock(id, null);
  const n = parseFloat(raw); if (isNaN(n) || n < 0) return;
  setStock(id, isW(id) ? Math.round(n*1000) : Math.round(n));
});
document.addEventListener('click', e => {
  const sc = e.target.closest('[data-sc]'); if (sc) { stkCat = sc.dataset.sc; renderStock(); return; }
  const z = e.target.closest('[data-stk0]'); if (z && IS_ADMIN) return setStock(z.dataset.stk0, 0);
  const n = e.target.closest('[data-stkn]'); if (n && IS_ADMIN) return setStock(n.dataset.stkn, null);
  const v = e.target.closest('#views [data-v]'); if (v && v.dataset.v==='back' && IS_ADMIN) setTimeout(renderStock, 50);
});

/* =========================================================
   10) ข้อมูลร้าน (แสดงท้ายหน้าร้าน + แก้ไขในหลังบ้าน)
   ========================================================= */
let SHOP = {};
const telHref = t => 'tel:' + String(t||'').replace(/[^\d+]/g,'');
function renderShopInfo(){
  let box = document.getElementById('shopInfo');
  if (!box) { document.getElementById('shopBody').insertAdjacentHTML('afterend','<section class="shopinfo" id="shopInfo"></section>'); box = document.getElementById('shopInfo'); }
  const S = SHOP, L = [];
  if (S.open_hours) L.push(`🕘 <b>เวลาเปิด</b> ${esc(S.open_hours)}`);
  if (S.phone) L.push(`📞 <b>โทร</b> <a href="${telHref(S.phone)}">${esc(S.phone)}</a>`);
  if (S.line_id) { const u = /^https:\/\/(line\.me|lin\.ee)\//.test(S.line_id) ? S.line_id : 'https://line.me/R/ti/p/'+encodeURIComponent(S.line_id.startsWith('@')?S.line_id:'~'+S.line_id); L.push(`💬 <b>LINE</b> <a href="${esc(u)}" target="_blank" rel="noopener">${/^https:/.test(S.line_id)?'แอดไลน์ร้าน':esc(S.line_id)}</a>`); }
  if (S.facebook) L.push(`📘 <b>Facebook</b> <a href="${/^https?:/.test(S.facebook)?esc(S.facebook):'https://www.facebook.com/search/top?q='+encodeURIComponent(S.facebook)}" target="_blank" rel="noopener">${esc(S.facebook.replace(/^https?:\/\/(www\.)?facebook\.com\//,''))}</a>`);
  if (S.address) L.push(`📍 <b>ที่ตั้ง</b> ${esc(S.address)}${S.map_url?` · <a href="${/^https?:/.test(S.map_url)?esc(S.map_url):'#'}" target="_blank" rel="noopener">เปิดแผนที่</a>`:''}`);
  if (S.delivery_area) L.push(`🛵 <b>จัดส่ง</b> ${esc(S.delivery_area)}`);
  box.innerHTML = `<h2>🥬 ${esc(S.name||'บ้านผัก')} <small class="meta" style="font-size:13px">${esc(S.tagline||'')}</small></h2>
    ${S.about?`<div>${esc(S.about)}</div>`:''}<div class="row2">${L.map(x=>`<div>${x}</div>`).join('')}</div>
    ${S.policy?`<details><summary>🔄 นโยบายเปลี่ยน/คืนสินค้า</summary><div style="white-space:pre-line;margin-top:6px">${esc(S.policy)}</div></details>`:''}
    <div class="supbox"><b>🤝 ร่วมเป็นซัพพลายเออร์กับบ้านผัก</b><div class="meta" style="margin:4px 0 8px">${esc(S.supplier_text||'เกษตรกรหรือผู้ผลิตที่อยากส่งสินค้าให้ร้าน ฝากข้อมูลไว้ได้เลย')}</div>
      <button class="btn sm" id="supOpen">📝 ฝากข้อมูลติดต่อ</button>${S.phone?` <a class="btn sm ghost" href="${telHref(S.phone)}">📞 โทรคุยกับร้าน</a>`:''}</div>
    <details><summary>💳 การชำระเงิน</summary><div style="margin-top:6px">พร้อมเพย์ (สแกน QR ตามยอด แล้วแนบสลิปได้ทันที) · เก็บเงินปลายทาง · จ่ายที่ร้าน</div></details>`;
}
async function loadShopInfo(){ const { data } = await sb.from('shop_info').select('*').eq('id',1).maybeSingle(); if (data) SHOP = data; renderShopInfo(); renderShopForm(); }
const SF = [['name','ชื่อร้าน'],['tagline','สโลแกน'],['about','เกี่ยวกับร้าน',1],['phone','เบอร์โทร'],['line_id','LINE (ID เช่น @baanphak หรือลิงก์ line.me)'],['facebook','Facebook (ชื่อเพจหรือลิงก์)'],
  ['open_hours','เวลาเปิด-ปิด'],['address','ที่ตั้งร้าน',1],['map_url','ลิงก์ Google Maps'],['delivery_area','พื้นที่/เงื่อนไขจัดส่ง',1],['policy','นโยบายเปลี่ยน/คืนสินค้า',1],['supplier_text','ข้อความเชิญซัพพลายเออร์',1]];
(function(){
  document.getElementById('v-back').insertAdjacentHTML('beforeend', `<div class="sec-h" style="margin-top:20px"><h2>ℹ️ ข้อมูลร้าน (แสดงท้ายหน้าร้าน)</h2></div><div class="panel" id="shopForm"></div>`);
})();
function renderShopForm(){
  const f = document.getElementById('shopForm'); if (!f) return;
  f.innerHTML = SF.map(([k,l,ta]) => `<label style="display:block;margin:6px 0"><span class="meta">${l}</span>${ta?`<textarea data-sf="${k}" rows="${k==='policy'?4:2}" style="${fld};resize:vertical">${esc(SHOP[k]||'')}</textarea>`:`<input data-sf="${k}" value="${esc(SHOP[k]||'')}" style="${fld}">`}</label>`).join('') +
    `<button class="btn full" id="sfSave" style="margin-top:6px">💾 บันทึกข้อมูลร้าน</button>`;
}
document.addEventListener('click', async e => {
  if (e.target.id !== 'sfSave' || !IS_ADMIN) return;
  const upd = { updated_at: new Date().toISOString() };
  document.querySelectorAll('[data-sf]').forEach(el => upd[el.dataset.sf] = el.value.trim() || null);
  const { error } = await sb.from('shop_info').update(upd).eq('id',1);
  if (error) { toast('❌ บันทึกไม่สำเร็จ'); console.error(error); return; }
  Object.assign(SHOP, upd); renderShopInfo(); toast('💾 บันทึกข้อมูลร้านแล้ว');
});
loadShopInfo().catch(console.warn);
const _refreshAuth2 = refreshAuth;
refreshAuth = async function(){ await _refreshAuth2(); if (IS_ADMIN) { renderStock(); renderShopForm(); } };

/* ---------- 11) ซัพพลายเออร์ร่วมงาน ---------- */
document.head.insertAdjacentHTML('beforeend','<style>.supbox{margin-top:12px;background:#f3f8ef;border:1px solid #d7e8cc;border-radius:12px;padding:12px 14px}</style>');
document.addEventListener('click', e => {
  if (e.target.id !== 'supOpen') return;
  const f = (id, ph, t='') => `<input id="${id}" placeholder="${ph}" ${t} style="${fld}">`;
  openModal(`<h3>🤝 ร่วมเป็นซัพพลายเออร์กับบ้านผัก</h3>
    ${f('spName','ชื่อผู้ติดต่อ *')}${f('spFarm','ชื่อสวน / ฟาร์ม / บริษัท')}${f('spPhone','เบอร์โทร *','inputmode="tel"')}${f('spLine','LINE ID')}
    <textarea id="spProd" rows="2" placeholder="สินค้าที่ส่งได้ เช่น ผักบุ้ง คะน้า 50 กก./สัปดาห์" style="${fld};resize:vertical"></textarea>
    ${f('spArea','จังหวัด / พื้นที่')}<textarea id="spNote" rows="2" placeholder="รายละเอียดเพิ่มเติม (ปลอดสาร, GAP, ราคาโดยประมาณ ฯลฯ)" style="${fld};resize:vertical"></textarea>
    <div class="two" style="margin-top:8px"><button class="btn" id="spSend">ส่งข้อมูล</button><button class="btn ghost" data-close>ยกเลิก</button></div>`);
});
document.addEventListener('click', async e => {
  if (e.target.id !== 'spSend') return;
  const v = id => (document.getElementById(id)?.value || '').trim();
  const row = { name:v('spName'), farm:v('spFarm')||null, phone:v('spPhone'), line_id:v('spLine')||null, products:v('spProd')||null, area:v('spArea')||null, note:v('spNote')||null };
  if (!row.name || row.phone.replace(/\D/g,'').length < 9) { toast('กรอกชื่อและเบอร์โทรให้ครบก่อน'); return; }
  e.target.disabled = true;
  const { error } = await sb.from('supplier_leads').insert(row);
  if (error) { e.target.disabled = false; toast('❌ ส่งไม่สำเร็จ ลองใหม่อีกครั้ง'); console.error(error); return; }
  closeModal(); toast('✅ ส่งข้อมูลแล้ว ร้านจะติดต่อกลับเร็วๆ นี้');
});
// หลังบ้าน: รายชื่อซัพพลายเออร์ที่ติดต่อมา
(function(){
  document.getElementById('shopForm').previousElementSibling.insertAdjacentHTML('beforebegin', `<div class="sec-h" style="margin-top:20px"><h2>🤝 ซัพพลายเออร์ที่ติดต่อมา</h2><span><button class="btn sm ghost" id="supReload">↻ โหลดใหม่</button></span></div><div class="tw" style="margin-bottom:12px"><table class="tbl" id="supTbl" style="min-width:0"></table></div>`);
})();
const SUPST = { new:'🆕 ใหม่', contacted:'📞 ติดต่อแล้ว', partner:'🤝 ร่วมงาน', rejected:'✖️ ไม่ร่วม' };
async function loadLeads(){
  if (!IS_ADMIN) return;
  const { data, error } = await sb.from('supplier_leads').select('*').order('created_at', { ascending:false }).limit(200);
  if (error) { console.error(error); return; }
  $('#supTbl').innerHTML = `<tr><th>ผู้ติดต่อ</th><th>สินค้า / พื้นที่</th><th>สถานะ</th></tr>` + (data.map(r => `<tr>
    <td><b>${esc(r.name)}</b>${r.farm?'<br>'+esc(r.farm):''}<br><a href="${telHref(r.phone)}">${esc(r.phone)}</a>${r.line_id?'<br>LINE '+esc(r.line_id):''}<br><span class="meta">${new Date(r.created_at).toLocaleDateString('th-TH')}</span></td>
    <td>${esc(r.products||'-')}${r.area?'<br><span class="meta">📍 '+esc(r.area)+'</span>':''}${r.note?'<br><span class="meta">'+esc(r.note)+'</span>':''}</td>
    <td><select class="in" style="width:auto;text-align:left" data-lead="${r.id}">${Object.entries(SUPST).map(([k,l])=>`<option value="${k}" ${k===r.status?'selected':''}>${l}</option>`).join('')}</select></td></tr>`).join('')
    || '<tr><td colspan="3" class="meta">ยังไม่มีซัพพลายเออร์ติดต่อมา</td></tr>');
}
document.addEventListener('change', async e => { const id = e.target.dataset?.lead; if (!id || !IS_ADMIN) return;
  const { error } = await sb.from('supplier_leads').update({ status:e.target.value }).eq('id', id); toast(error ? '❌ บันทึกไม่สำเร็จ' : '💾 อัปเดตสถานะแล้ว'); });
document.addEventListener('click', e => { if (e.target.id==='supReload') loadLeads(); const v = e.target.closest('#views [data-v]'); if (v && v.dataset.v==='back') setTimeout(loadLeads, 60); });
const _refreshAuth3 = refreshAuth;
refreshAuth = async function(){ await _refreshAuth3(); if (IS_ADMIN) loadLeads(); };
