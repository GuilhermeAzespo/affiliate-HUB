import crypto from 'crypto';

const SESSIONS = new Map(); // token -> { createdAt }
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, { createdAt: Date.now() });
  return token;
}

export function destroySession(token) {
  SESSIONS.delete(token);
}

export function isValidSession(token) {
  const session = SESSIONS.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    SESSIONS.delete(token);
    return false;
  }
  return true;
}

// Middleware de autenticação
export function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token || !isValidSession(token)) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
}
