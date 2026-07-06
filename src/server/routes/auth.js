import { Router } from 'express';
import { createSession, destroySession } from '../auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  const token = createSession();
  res.cookie('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  });

  return res.json({ ok: true });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) destroySession(token);
  res.clearCookie('session');
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  return res.json({ authenticated: true });
});

export default router;
