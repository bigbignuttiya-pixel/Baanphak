import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const baht = (n: number) => "฿" + Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const thTime = (d: string) => new Date(d).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const PAY: Record<string, string> = { cash: "เงินสด", promptpay: "พร้อมเพย์", transfer: "โอน", card: "บัตร", cod: "เก็บเงินปลายทาง" };

async function cfg() { const { data } = await db.from("line_config").select("*").eq("id", 1).single(); return data; }
async function lineApi(token: string, path: string, body: unknown) {
  const r = await fetch("https://api.line.me/v2/bot/message/" + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) });
  return r.ok ? null : `${r.status} ${await r.text()}`;
}
async function pushAll(c: any, text: string) {
  const errs: string[] = [];
  for (const t of c.targets || []) { const e = await lineApi(c.channel_token, "push", { to: t.id, messages: [{ type: "text", text: text.slice(0, 4900) }] }); if (e) errs.push(e); }
  await db.from("line_config").update(errs.length ? { last_error: errs.join(" | ").slice(0, 500) } : { last_error: null, last_sent_at: new Date().toISOString() }).eq("id", 1);
  return errs;
}
function itemLine(i: any) {
  const q = i.grams ? (i.grams >= 1000 ? (i.grams / 1000) + " กก." : i.grams + " ก.") : "x" + Number(i.qty);
  return `• ${i.name} ${q}  ${baht(i.line_total)}`;
}
async function orderText(ev: string, id: number) {
  const { data: o } = await db.from("orders").select("*, order_items(*)").eq("id", id).single();
  if (!o) return null;
  const items = (o.order_items || []).map(itemLine).join("\n");
  const head: Record<string, string> = {
    pos: `🧾 บิลหน้าร้าน ${o.bill_no || "#" + o.id} · ชำระแล้ว`,
    online_new: `🛒 ออเดอร์ออนไลน์ใหม่ #${o.id}`,
    online_slip: `📎 ลูกค้าแนบสลิปแล้ว #${o.id} · รอตรวจ`,
    online_paid: `✅ ยืนยันรับเงินแล้ว #${o.id}`,
  };
  const L = [head[ev] || "บ้านผัก", `🕘 ${thTime(o.created_at)}`];
  if (o.channel === "online") {
    L.push(`👤 ${o.customer_name || "-"}  📞 ${o.phone || "-"}`);
    if (o.address) L.push(`🏠 ${o.address}`);
    if (o.lat) L.push(`📍 https://maps.google.com/?q=${o.lat},${o.lng}`);
    if (o.delivery_slot) L.push(`🚚 ${o.delivery_slot}${o.no_bag ? " · ไม่รับถุง" : ""}`);
  }
  L.push("", items || "(ไม่มีรายการ)", "");
  if (o.discount_pct) L.push(`ส่วนลด ${o.discount_pct}%`);
  if (+o.shipping) L.push(`ค่าส่ง ${baht(o.shipping)}`);
  L.push(`💰 ยอดรวม ${baht(o.total)}`, `💳 ${PAY[o.payment_method] || o.payment_method || "-"}${o.channel === "pos" && o.received ? ` · รับ ${baht(o.received)} ทอน ${baht(o.change_amt)}` : ""}`);
  return L.join("\n");
}
const CUST: Record<string, string> = {
  paid: "✅ ร้านได้รับเงินแล้ว ขอบคุณค่ะ",
  new: "🆕 ร้านได้รับออเดอร์แล้ว",
  packing: "🧺 กำลังคัดและแพ็กสินค้าให้คุณ",
  delivering: "🛵 กำลังนำส่ง เตรียมรับของได้เลย",
  done: "🎉 ส่งถึงเรียบร้อยแล้ว ขอบคุณที่อุดหนุนบ้านผักนะคะ",
  cancelled: "❌ ออเดอร์นี้ถูกยกเลิก หากสงสัยโทร 086-351-5259",
};
async function custText(o: any, what: string) {
  return `บ้านผัก · ออเดอร์ #${o.id}\n${CUST[what] || "สถานะอัปเดตแล้ว"}\n💰 ${baht(o.total)}${o.delivery_slot ? `\n🚚 ${o.delivery_slot}` : ""}\n(พิมพ์ "เลิกติดตาม ${o.id}" เพื่อหยุดรับแจ้งเตือน)`;
}
async function saveBasicId(token: string) {
  const bi = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: "Bearer " + token } });
  const info = bi.ok ? await bi.json() : {};
  if (info.basicId) await db.from("shop_info").update({ line_basic_id: info.basicId }).eq("id", 1);
  return info;
}
async function verifySig(secret: string, body: string, sig: string | null) {
  if (!secret || !sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac))) === sig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const raw = await req.text();
  const c = await cfg();

  // 1) จาก trigger ในฐานข้อมูล
  const hook = req.headers.get("x-hook-secret");
  if (hook) {
    if (!c || hook !== c.hook_secret) return json({ error: "forbidden" }, 403);
    const { event, order_id, what } = JSON.parse(raw || "{}");
    if (c.channel_token) {   // เก็บ LINE ID ร้าน (@xxxx) ไว้ให้ปุ่ม "รับแจ้งเตือนทาง LINE" หน้าเว็บ
      const { data: si } = await db.from("shop_info").select("line_basic_id").eq("id", 1).maybeSingle();
      if (si && !si.line_basic_id) await saveBasicId(c.channel_token);
    }
    if (event === "noop") return json({ ok: true });
    if (event === "cust") {   // แจ้งลูกค้าที่กดติดตามออเดอร์
      const { data: o } = await db.from("orders").select("id,total,delivery_slot,line_user_id").eq("id", order_id).single();
      if (!o?.line_user_id) return json({ skipped: true });
      const err = await lineApi(c.channel_token, "push", { to: o.line_user_id, messages: [{ type: "text", text: await custText(o, what) }] });
      return json({ ok: !err, err });
    }
    if ((event === "pos" && !c.notify_pos) || (event === "online_new" && !c.notify_online) || (event?.startsWith("online_") && event !== "online_new" && !c.notify_paid)) return json({ skipped: true });
    if (event === "pos") await new Promise((r) => setTimeout(r, 2500));   // รอรายการบิลบันทึกครบ
    const text = await orderText(event, order_id);
    if (!text) return json({ error: "order not found" }, 404);
    const errs = await pushAll(c, text);
    return json({ ok: errs.length === 0, errs });
  }

  // 2) Webhook จาก LINE (เชื่อมต่อผู้รับแจ้งเตือน)
  const sig = req.headers.get("x-line-signature");
  if (sig) {
    if (!c || !(await verifySig(c.channel_secret, raw, sig))) return json({ error: "bad signature" }, 401);
    const { events = [] } = JSON.parse(raw || "{}");
    let targets: any[] = c.targets || [];
    for (const e of events) {
      const src = e.source || {}; const id = src.groupId || src.roomId || src.userId; const type = src.groupId ? "group" : src.roomId ? "room" : "user";
      const text = e.type === "message" && e.message?.type === "text" ? String(e.message.text).trim() : "";
      // ลูกค้า: "ติดตาม <เลขออเดอร์> <รหัส>" รับแจ้งสถานะออเดอร์ของตัวเอง
      const tr = text.match(/^ติดตาม\s*#?(\d+)\s+([a-z0-9]{6})/i);
      if (tr && src.userId) {
        const { data: o } = await db.from("orders").select("id,status,pay_status,total,delivery_slot,track_code").eq("id", +tr[1]).eq("channel", "online").maybeSingle();
        const okc = o && String(o.track_code).toLowerCase() === tr[2].toLowerCase();
        if (okc) await db.from("orders").update({ line_user_id: src.userId }).eq("id", o.id);
        if (e.replyToken) await lineApi(c.channel_token, "reply", { replyToken: e.replyToken, messages: [{ type: "text", text: okc
          ? `🔔 ติดตามออเดอร์ #${o.id} แล้ว\nร้านจะแจ้งที่นี่เมื่อรับเงิน แพ็กของ และออกส่ง\nสถานะตอนนี้: ${CUST[o.pay_status === "paid" && o.status === "new" ? "paid" : o.status] || o.status}`
          : "❌ ไม่พบออเดอร์หรือรหัสไม่ถูกต้อง ลองกดปุ่ม \"รับแจ้งเตือนทาง LINE\" จากหน้าเว็บอีกครั้ง" }] });
        continue;
      }
      const un = text.match(/^เลิกติดตาม\s*#?(\d+)/);
      if (un && src.userId) {
        await db.from("orders").update({ line_user_id: null }).eq("id", +un[1]).eq("line_user_id", src.userId);
        if (e.replyToken) await lineApi(c.channel_token, "reply", { replyToken: e.replyToken, messages: [{ type: "text", text: `🔕 หยุดแจ้งเตือนออเดอร์ #${un[1]} แล้ว` }] });
        continue;
      }
      // ต้องพิมพ์ "เชื่อมต่อ <รหัส 6 หลักจากหลังบ้าน>" เท่านั้น กันลูกค้าที่แอดเพื่อนร้านได้รับออเดอร์ของคนอื่น
      const m = text.match(/^(?:เชื่อมต่อ|เปิดแจ้งเตือน)\s*([A-Za-z0-9]*)/);
      const join = Boolean(m && m[1].toLowerCase() === String(c.hook_secret || "").slice(0, 6).toLowerCase());
      if (m && !join && e.replyToken) {
        await lineApi(c.channel_token, "reply", { replyToken: e.replyToken, messages: [{ type: "text", text: "🔐 พิมพ์ \"เชื่อมต่อ\" ตามด้วยรหัส 6 หลักจากหน้าหลังบ้าน" }] });
        continue;
      }
      const leave = e.type === "leave" || e.type === "unfollow" || /ยกเลิกแจ้งเตือน|ปิดแจ้งเตือน/.test(text);
      if (join && id && !targets.some((t) => t.id === id)) {
        targets = [...targets, { id, type, added: new Date().toISOString() }];
        if (e.replyToken) await lineApi(c.channel_token, "reply", { replyToken: e.replyToken, messages: [{ type: "text", text: "✅ เชื่อมต่อแจ้งเตือนบ้านผักแล้ว\nบิลหน้าร้านและออเดอร์ออนไลน์จะส่งมาที่นี่\n(พิมพ์ \"ยกเลิกแจ้งเตือน\" เพื่อหยุด)" }] });
      } else if (leave && id) {
        targets = targets.filter((t) => t.id !== id);
        if (e.replyToken && e.type === "message") await lineApi(c.channel_token, "reply", { replyToken: e.replyToken, messages: [{ type: "text", text: "🔕 หยุดแจ้งเตือนที่นี่แล้ว" }] });
      } else if (text && e.replyToken && /สถานะ|ทดสอบ/.test(text)) {
        await lineApi(c.channel_token, "reply", { replyToken: e.replyToken, messages: [{ type: "text", text: targets.some((t) => t.id === id) ? "🟢 ที่นี่เชื่อมต่อแจ้งเตือนอยู่" : "⚪ ยังไม่เชื่อมต่อ พิมพ์ \"เชื่อมต่อ\" ตามด้วยรหัสจากหลังบ้าน" }] });
      }
    }
    await db.from("line_config").update({ targets, updated_at: new Date().toISOString() }).eq("id", 1);
    return json({ ok: true });
  }

  // 3) แอดมินกดทดสอบจากหลังบ้าน
  const auth = req.headers.get("authorization");
  if (auth) {
    const u = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: isAdmin } = await u.rpc("is_admin");
    if (!isAdmin) return json({ error: "admin only" }, 403);
    if (!c?.channel_token) return json({ error: "ยังไม่ได้ใส่ Channel access token" }, 400);
    const body = JSON.parse(raw || "{}");
    if (body.action === "setup") {   // ตั้ง Webhook URL ให้อัตโนมัติ
      const ep = URL_ + "/functions/v1/line-notify";
      const r = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.channel_token }, body: JSON.stringify({ endpoint: ep }) });
      if (!r.ok) return json({ ok: false, error: "ตั้ง Webhook ไม่สำเร็จ (" + r.status + ") — ตรวจ Channel access token อีกครั้ง" });
      const info = await saveBasicId(c.channel_token);
      return json({ ok: true, bot: info.displayName || "", basicId: info.basicId || "" });
    }
    if (body.action === "basic") { const info = await saveBasicId(c.channel_token); return json({ ok: !!info.basicId, basicId: info.basicId || "" }); }
    if (!(c.targets || []).length) return json({ error: "ยังไม่มีผู้รับ — แอดเพื่อน LINE ร้านแล้วพิมพ์ \"เชื่อมต่อ\"" }, 400);
    const errs = await pushAll(c, "🔔 ทดสอบแจ้งเตือนจากบ้านผัก\nถ้าเห็นข้อความนี้ แปลว่าระบบส่งบิลเข้า LINE พร้อมใช้งานแล้ว ✅");
    return json({ ok: errs.length === 0, errs });
  }
  return json({ error: "bad request" }, 400);
});
