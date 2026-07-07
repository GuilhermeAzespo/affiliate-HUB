import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import platformRoutes from './routes/platforms.js';
import oauthRoutes from './routes/oauth.js';
import waManager from './whatsapp/manager.js';
import { startWorker } from './worker.js';
import { startSender } from './sender.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;

const app = express();
const httpServer = createServer(app);

// ─── Middlewares ──────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false, // Desativado para não quebrar scripts inline do Vite/React
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 300, // Limite de 300 requests por IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste IP, tente novamente mais tarde.' }
});

app.use('/api', globalLimiter); // Aplica rate limit apenas nas rotas da API

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.APP_URL
    : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/healthz', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Rotas OAuth (sem auth — redirect externo) ────────────────────────────────

app.use('/', oauthRoutes); // /ml/authorize, /ml/callback


// ─── API (com auth) ───────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', requireAuth, workspaceRoutes);
app.use('/api', requireAuth, platformRoutes);

// ─── Tratamento Global de Erros ───────────────────────────────────────────────
app.use('/api', (err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(500).json({ error: 'Erro interno do servidor. Tente novamente mais tarde.' });
});

// ─── Frontend estático (produção) ─────────────────────────────────────────────

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
import { existsSync } from 'fs';

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (_, res) => {
    res.json({
      message: 'AfiliadoBot (modo dev)',
      hint: 'Frontend não buildado. Rode: npm run frontend:dev',
    });
  });
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// Propaga eventos do WhatsApp via WebSocket
waManager.on('status', ({ workspaceId, status }) => {
  broadcast('wa:status', { workspaceId, status });
});

waManager.on('qr', ({ workspaceId, qr }) => {
  broadcast('wa:qr', { workspaceId, qr });
});

// ─── Inicialização ────────────────────────────────────────────────────────────

async function bootstrap() {
  // Fail-Fast: Validação das variáveis críticas
  if (!process.env.DASHBOARD_PASSWORD) {
    console.error('❌ ERRO FATAL: DASHBOARD_PASSWORD não está configurado no .env!');
    process.exit(1);
  }

  // Reconecta workspaces que já tinham sessão salva
  const workspaces = await db.workspace.findMany({ select: { id: true } });
  await waManager.reconnectAll(workspaces.map((w) => w.id));

  // Inicia worker de busca automática e de envio
  startWorker();
  startSender();

  httpServer.listen(PORT, () => {
    console.log(`✅ AfiliadoBot rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Erro fatal na inicialização:', err);
  process.exit(1);
});
