// services/requestContext.js — DayHop V2
// Per-request context via AsyncLocalStorage, so deep call sites (analytics
// recordEvent, mostly) can read request facts like the client IP without
// every route threading `req` down through the service layer. Cron/startup
// work runs outside any request → getIp() returns null there, by design.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// Express middleware: everything downstream of this (including awaited
// service calls) sees the request's context.
function middleware(req, res, next) {
  als.run({ ip: req.ip || null }, next);
}

function getIp() {
  const store = als.getStore();
  return (store && store.ip) || null;
}

module.exports = { middleware, getIp };
