/**
 * admin-data.js — Netlify Serverless Function
 * بوابة العمليات الحساسة للوحة الأدمن.
 * نفس عقد /api/admin-data المستخدمة على Vercel.
 */
const crypto = require('crypto');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function verifyToken(token) {
  try {
    const raw = String(token || '');
    if (!raw) return false;
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const canonical = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
    if (raw.replace(/=+$/, '') !== canonical) return false;

    const parts = decoded.split(':');
    if (parts.length !== 3) return false;
    const [username, timestamp, signature] = parts;
    const secret = process.env.ADMIN_SESSION_SECRET || '';
    const adminUsername = process.env.ADMIN_USERNAME || '';
    if (!secret || !adminUsername || username !== adminUsername) return false;

    const expected = crypto.createHmac('sha256', secret)
      .update(`${username}:${timestamp}`)
      .digest('hex');

    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

    const ts = Number(timestamp);
    const age = Date.now() - ts;
    return Number.isFinite(ts) && age >= 0 && age <= SESSION_TTL_MS;
  } catch (_) {
    return false;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache'
  };

  if (event.httpMethod === 'OPTIONS') return respond(200, { status: 'success' }, headers);
  if (event.httpMethod !== 'POST') return respond(405, { status: 'error', message: 'Method not allowed' }, headers);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return respond(400, { status: 'error', message: 'Invalid request body' }, headers);
  }

  const sessionToken = body.sessionToken || '';
  if (!verifyToken(sessionToken)) {
    return respond(401, { status: 'error', message: 'جلسة الأدمن غير صالحة أو انتهت. سجل الدخول مرة أخرى.' }, headers);
  }

  const action = String(body.action || '').trim();
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  if (!action) return respond(400, { status: 'error', message: 'Missing action' }, headers);

  const GAS_URL = process.env.GAS_URL || '';
  const GAS_TOKEN = process.env.GAS_TOKEN || '';
  if (!GAS_URL || !GAS_TOKEN) {
    return respond(503, {
      status: 'error',
      message: 'GAS_URL و GAS_TOKEN يجب ضبطهما في Netlify Environment Variables.'
    }, headers);
  }

  try {
    // sessionToken never reaches Google Apps Script; only the server-side GAS_TOKEN does.
    const gasBody = { ...payload, action, token: GAS_TOKEN };
    const r = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gasBody),
      redirect: 'follow'
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return respond(502, {
        status: 'error',
        message: 'استجابة غير صالحة من Google Apps Script'
      }, headers);
    }

    return respond(r.ok && data?.status !== 'error' ? 200 : 502, data, headers);
  } catch (e) {
    return respond(502, { status: 'error', message: e?.message || 'تعذر الاتصال بـ Google Apps Script' }, headers);
  }
};

function respond(statusCode, data, headers) {
  return { statusCode, headers, body: JSON.stringify(data) };
}
