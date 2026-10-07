"use strict";

const { randomUUID } = require("node:crypto");
const { createManagerClient } = require("./_orkhan-shop-orders");
const { clientIp } = require("./_family-eligibility");

const MAX_BODY_BYTES = 16 * 1024;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WITHDRAWAL_WINDOW_MS = 10 * 60_000;
const WITHDRAWAL_MAX_REQUESTS = 5;
const withdrawalBuckets = new Map();

function consumeWithdrawalRequest(ip, now = Date.now()) {
  const current = withdrawalBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    withdrawalBuckets.set(ip, { count: 1, resetAt: now + WITHDRAWAL_WINDOW_MS });
    return true;
  }
  if (current.count >= WITHDRAWAL_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function text(value, field, max, required, multiline = false) {
  if (typeof value !== "string") value = "";
  const normalized = multiline ? value.replace(/\r\n?/g, "\n").trim() : value.replace(/[\r\n]+/g, " ").trim();
  if ((required && !normalized) || normalized.length > max) {
    const error = new Error(`invalid_${field}`); error.status = 400; throw error;
  }
  return normalized;
}

function normalizeReference(value) {
  return text(value, "order_reference", 40, true).replace(/\s+/g, "").toUpperCase();
}

function validateWithdrawalPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) { const error = new Error("invalid_payload"); error.status = 400; throw error; }
  const payload = {
    firstName: text(value.firstName, "first_name", 100, true),
    lastName: text(value.lastName, "last_name", 100, true),
    orderReference: text(value.orderReference, "order_reference", 40, true),
    email: text(value.email, "email", 200, true).toLowerCase(),
    products: text(value.products, "products", 1000, false, true),
    message: text(value.message, "message", 2000, false, true)
  };
  if (!EMAIL.test(payload.email)) { const error = new Error("invalid_email"); error.status = 400; throw error; }
  return payload;
}

async function handler(req, res, options = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const length = Number(req.headers?.["content-length"] || 0);
  if (length > MAX_BODY_BYTES) return res.status(413).json({ error: "payload_too_large" });
  if (!(options.consumeRequest || consumeWithdrawalRequest)(clientIp(req))) return res.status(429).json({ error: "rate_limited" });
  if (req.body?.website) return res.status(200).json({ ok: true, requestId: randomUUID(), recordedAt: new Date().toISOString() });
  const key = req.headers?.["idempotency-key"];
  if (typeof key !== "string" || !UUID_V4.test(key)) return res.status(400).json({ error: "invalid_idempotency_key" });
  try {
    if (Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > MAX_BODY_BYTES) return res.status(413).json({ error: "payload_too_large" });
    const result = await (options.managerClient || createManagerClient()).createWithdrawalRequest(validateWithdrawalPayload(req.body), key);
    return res.status(result.operation === "created" ? 201 : 200).json({ ok: true, requestId: result.requestId, recordedAt: result.recordedAt });
  } catch (error) {
    const status = Number(error?.status) || 503;
    return res.status(status >= 400 && status < 500 ? status : 503).json({ error: status >= 400 && status < 500 ? error.message : "withdrawal_unavailable" });
  }
}

module.exports = handler;
module.exports.validateWithdrawalPayload = validateWithdrawalPayload;
module.exports.normalizeReference = normalizeReference;
module.exports.consumeWithdrawalRequest = consumeWithdrawalRequest;
