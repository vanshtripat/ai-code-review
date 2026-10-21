'use strict';

/**
 * Safe Logger Utility for AI Operations
 * 
 * SECURITY RULES:
 * - NEVER log GEMINI_API_KEY or other credentials.
 * - NEVER log Authorization headers or JWTs.
 * - NEVER log full source code or sensitive user payloads.
 * - NEVER dump raw error stack traces to public logs.
 */

const sanitizeLogMessage = (msg) => {
  if (typeof msg !== 'string') return '';
  return msg
    .replace(/AQ\.[a-zA-Z0-9_-]{30,}/g, '[REDACTED_API_KEY]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/password\s*:\s*["'][^"']+["']/gi, 'password:"[REDACTED]"');
};

const safeLog = {
  info: (prefix, meta = {}) => {
    const sanitizedMeta = Object.entries(meta).map(([k, v]) => {
      if (typeof v === 'string') return `${k}=${sanitizeLogMessage(v)}`;
      return `${k}=${v}`;
    }).join(' ');
    console.log(`[INFO] ${prefix} ${sanitizedMeta}`.trim());
  },

  warn: (prefix, meta = {}) => {
    const sanitizedMeta = Object.entries(meta).map(([k, v]) => {
      if (typeof v === 'string') return `${k}=${sanitizeLogMessage(v)}`;
      return `${k}=${v}`;
    }).join(' ');
    console.warn(`[WARN] ${prefix} ${sanitizedMeta}`.trim());
  },

  error: (prefix, meta = {}) => {
    const sanitizedMeta = Object.entries(meta).map(([k, v]) => {
      if (typeof v === 'string') return `${k}=${sanitizeLogMessage(v)}`;
      return `${k}=${v}`;
    }).join(' ');
    console.error(`[ERROR] ${prefix} ${sanitizedMeta}`.trim());
  }
};

module.exports = {
  safeLog,
  sanitizeLogMessage
};
