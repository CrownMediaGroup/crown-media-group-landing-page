// Shared helpers for the Kingdom Edge Bot (Alpaca integration + AES key encryption).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { supabase } from './_edge-helpers.mjs';

const ALPACA_PAPER_BASE = 'https://paper-api.alpaca.markets/v2';
const ALPACA_LIVE_BASE  = 'https://api.alpaca.markets/v2';
const ALPACA_DATA_BASE  = 'https://data.alpaca.markets/v2';

/**
 * AES-256-GCM encrypt the user's Alpaca key + secret using EDGE_BOT_KEY_SECRET.
 * Returns base64(iv|tag|ciphertext) — single string safe to store as TEXT.
 */
export function encryptSecret(plain) {
  const masterKey = process.env.EDGE_BOT_KEY_SECRET;
  if (!masterKey) throw new Error('EDGE_BOT_KEY_SECRET not set');
  const key = scryptSync(masterKey, 'kingdom-edge-bot', 32);
  const iv  = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(b64) {
  const masterKey = process.env.EDGE_BOT_KEY_SECRET;
  if (!masterKey) throw new Error('EDGE_BOT_KEY_SECRET not set');
  const key = scryptSync(masterKey, 'kingdom-edge-bot', 32);
  const buf = Buffer.from(b64, 'base64');
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/**
 * Load a user's brokerage connection by email. Returns decrypted keys.
 */
export async function loadBrokerage(email) {
  const { data } = await supabase
    .from('edge_brokerage_connections')
    .select('*')
    .eq('user_email', email)
    .maybeSingle();
  if (!data) return null;
  try {
    return {
      ...data,
      api_key_id: decryptSecret(data.api_key_id_enc),
      api_secret: decryptSecret(data.api_secret_enc),
    };
  } catch (e) {
    console.error('[edge-bot] decrypt error for', email, e.message);
    return null;
  }
}

/**
 * Hit Alpaca REST API with the user's keys.
 */
export async function alpacaFetch(brokerage, path, init = {}) {
  const base = brokerage.mode === 'live' ? ALPACA_LIVE_BASE : ALPACA_PAPER_BASE;
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'APCA-API-KEY-ID':     brokerage.api_key_id,
      'APCA-API-SECRET-KEY': brokerage.api_secret,
      'Content-Type':        'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: true, data: await res.json() };
}

export async function alpacaAccount(brokerage)   { return alpacaFetch(brokerage, '/account'); }
export async function alpacaPositions(brokerage) { return alpacaFetch(brokerage, '/positions'); }
export async function alpacaOrders(brokerage)    { return alpacaFetch(brokerage, '/orders?status=all&limit=50&direction=desc'); }

export async function alpacaPlaceOrder(brokerage, { symbol, qty, side, type='market', time_in_force='day', notional }) {
  const body = notional
    ? { symbol, notional, side, type, time_in_force }
    : { symbol, qty, side, type, time_in_force };
  return alpacaFetch(brokerage, '/orders', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Place a bracket order — market entry + stop-loss + take-profit legs in one atomic submission.
 * Alpaca requires integer qty for bracket orders on most accounts (no notional, no fractional).
 */
export async function alpacaPlaceBracketOrder(brokerage, { symbol, qty, side='buy', stop_price, limit_price, time_in_force='day' }) {
  const body = {
    symbol,
    qty:           String(qty),
    side,
    type:          'market',
    time_in_force,
    order_class:   'bracket',
    take_profit:   { limit_price: String(limit_price) },
    stop_loss:     { stop_price:  String(stop_price)  },
  };
  return alpacaFetch(brokerage, '/orders', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Latest trade price for a symbol (used for bracket-order sizing).
 */
export async function alpacaLatestPrice(brokerage, symbol) {
  const isCrypto = /\/(USD|USDT|USDC)$/.test(symbol);
  const path = isCrypto
    ? `/crypto/us/latest/trades?symbols=${encodeURIComponent(symbol)}`
    : `/stocks/${encodeURIComponent(symbol)}/trades/latest`;
  const url = `${ALPACA_DATA_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID':     brokerage.api_key_id,
      'APCA-API-SECRET-KEY': brokerage.api_secret,
    },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const j = await res.json();
  const price = isCrypto
    ? j.trades?.[symbol]?.p
    : j.trade?.p;
  return { ok: true, price: price || null };
}

/**
 * Pull recent bars for a symbol from Alpaca market data API.
 * Supports both stocks and crypto. Note: data endpoint accepts the same API key.
 */
export async function alpacaBars(brokerage, symbol, { timeframe='1Day', limit=50 } = {}) {
  const isCrypto = /\/(USD|USDT|USDC)$/.test(symbol);
  const url = isCrypto
    ? `${ALPACA_DATA_BASE}/crypto/us/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`
    : `${ALPACA_DATA_BASE}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID':     brokerage.api_key_id,
      'APCA-API-SECRET-KEY': brokerage.api_secret,
    },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const j = await res.json();
  const bars = isCrypto ? (j.bars?.[symbol] || []) : (j.bars || []);
  return { ok: true, bars };
}
