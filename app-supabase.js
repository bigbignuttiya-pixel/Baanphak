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
  if (error) { toast('❌ ส่งคำสั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้ง'); console.error(error); e.target.disabled=false; e.target.textContent='ยืนยันคำสั่งซื้อ'; return; }
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
