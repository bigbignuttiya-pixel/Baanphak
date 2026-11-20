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

/* ---------- 1) โหลดข้อมูลจากฐานข้อมูล ---------- */
async function loadFromDB(){
  const [p, k, ki] = await Promise.all([
    sb.from('products').select('*, farms(name)').order('category_id'),
    sb.from('kits').select('*'),
    sb.from('kit_items').select('*'),
  ]);
  if (p.error || k.error || ki.error || !p.data?.length) throw (p.error || k.error || ki.error || new Error('no data'));
  const veg = [], goods = [];
  for (const r of p.data) {
    if (r.photo_url) PHOTOS[r.id] = r.photo_url;
    if (!r.active) continue;
    if (r.sell_by === 'weight') veg.push({ id:r.id, n:r.name, e:r.emoji, c:r.category_id, p:+r.price, cost:+r.cost, loss:+r.loss_pct,
      farm:r.farms?.name || '', s:r.season_months || undefined, k:r.storage || undefined, d:r.shelf_days || undefined, col:r.color || undefined,
      prep: /ซอย|พร้อมใช้/.test(r.name) });
    else goods.push({ id:r.id, n:r.name, e:r.emoji, c:r.category_id, p:+r.price, cost:+r.cost, u:r.unit || 'ชิ้น' });
  }
  const kits = k.data.filter(r=>r.active).map(r => {
    if (r.photo_url) PHOTOS[r.id] = r.photo_url;
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
  document.querySelector('.top').insertBefore(b, document.getElementById('cartBtn'));
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
    const unit = ['pantry','home'].includes(o.c);
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

/* ---------- 5) สั่งซื้อออนไลน์ → place_order (ราคาคิดจากฐานข้อมูล) ---------- */
const _renderCart = renderCart;
renderCart = function(){
  _renderCart();
  const ck = document.getElementById('checkout'); if (!ck || document.getElementById('cuName')) return;
  ck.insertAdjacentHTML('beforebegin', `<input id="cuName" placeholder="ชื่อผู้รับ" style="width:100%;padding:8px;border-radius:10px;border:1px solid var(--line);font:inherit;margin:4px 0">
    <input id="cuPhone" placeholder="เบอร์โทร" inputmode="tel" style="width:100%;padding:8px;border-radius:10px;border:1px solid var(--line);font:inherit;margin:4px 0">`);
  ck.textContent = 'ยืนยันคำสั่งซื้อ';
};
document.addEventListener('click', async e => {
  if (e.target.id !== 'checkout') return;
  e.stopImmediatePropagation();
  const name = $('#cuName').value.trim(), phone = $('#cuPhone').value.trim();
  if (!name || phone.replace(/\D/g,'').length < 9) { toast('กรอกชื่อและเบอร์โทรให้ครบก่อน'); return; }
  const items = Object.keys(cart).filter(k=>cart[k]>0).map(k=>({ id:k, qty:cart[k] }));
  e.target.disabled = true; e.target.textContent = 'กำลังส่งคำสั่งซื้อ…';
  const { data, error } = await sb.rpc('place_order', { items, customer_name:name, phone, delivery_slot:slot, no_bag:noBag });
  if (error) { toast('❌ ส่งคำสั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้ง'); console.error(error); e.target.disabled=false; e.target.textContent='ยืนยันคำสั่งซื้อ'; return; }
  cart = {}; renderCart(); openCart(false);
  openModal(`<h3>✅ รับคำสั่งซื้อแล้ว</h3><p>เลขที่ออเดอร์ <b>#${data.order_id}</b><br>ยอดรวม <b>${baht(data.total)}</b> (ค่าส่ง ${data.shipping?baht(data.shipping):'ฟรี'})<br>รอบส่ง ${slot}<br>แต้มรักษ์โลกที่ได้ 🌱 ${data.points}</p><p class="meta">ร้านจะติดต่อกลับที่เบอร์ ${phone}</p><button class="btn full" data-close>ตกลง</button>`);
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
