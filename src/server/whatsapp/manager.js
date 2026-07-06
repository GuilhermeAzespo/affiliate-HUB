import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  jidDecode,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import pino from 'pino';

const AUTH_BASE = path.resolve('./auth_state');
const logger = pino({ level: 'silent' });

// Garante que o diretório base de auth existe
fs.mkdirSync(AUTH_BASE, { recursive: true });

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // workspaceId -> { socket, store, status, qr }
  }

  _authPath(workspaceId) {
    return path.join(AUTH_BASE, workspaceId);
  }

  getStatus(workspaceId) {
    const session = this.sessions.get(workspaceId);
    return session?.status ?? 'disconnected';
  }

  getQr(workspaceId) {
    const session = this.sessions.get(workspaceId);
    return session?.qr ?? null;
  }

  async connect(workspaceId) {
    if (this.sessions.has(workspaceId)) {
      const existing = this.sessions.get(workspaceId);
      if (existing.status === 'connected') {
        return { status: 'already_connected' };
      }
      // Fecha sessão antiga se existir
      try { existing.socket?.end(); } catch {}
    }

    const authPath = this._authPath(workspaceId);
    fs.mkdirSync(authPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['AfiliadoBot', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: true,
    });

    const sessionData = { socket, status: 'connecting', qr: null };
    this.sessions.set(workspaceId, sessionData);

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sessionData.qr = qr;
        sessionData.status = 'qr';
        this.emit('qr', { workspaceId, qr });
        this.emit('status', { workspaceId, status: 'qr' });
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        sessionData.status = 'disconnected';
        sessionData.qr = null;
        this.emit('status', { workspaceId, status: 'disconnected' });

        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          setTimeout(() => this.connect(workspaceId), 5000);
        } else {
          // Usuário deslogou — remove auth
          fs.rmSync(authPath, { recursive: true, force: true });
          this.sessions.delete(workspaceId);
        }
      }

      if (connection === 'open') {
        sessionData.status = 'connected';
        sessionData.qr = null;
        this.emit('status', { workspaceId, status: 'connected' });
      }
    });

    return { status: 'connecting' };
  }

  async disconnect(workspaceId) {
    const session = this.sessions.get(workspaceId);
    if (!session) return;

    try {
      await session.socket.logout();
    } catch {}

    const authPath = this._authPath(workspaceId);
    fs.rmSync(authPath, { recursive: true, force: true });
    this.sessions.delete(workspaceId);
    this.emit('status', { workspaceId, status: 'disconnected' });
  }

  async getGroups(workspaceId) {
    const session = this.sessions.get(workspaceId);
    if (!session || session.status !== 'connected') {
      throw new Error('WhatsApp não conectado para este workspace');
    }

    const groups = await session.socket.groupFetchAllParticipating();
    return Object.entries(groups).map(([jid, meta]) => ({
      jid,
      name: meta.subject,
      participantCount: meta.participants?.length ?? 0,
    }));
  }

  async sendMessage(workspaceId, groupJid, text, imageUrl = null) {
    const session = this.sessions.get(workspaceId);
    if (!session || session.status !== 'connected') {
      throw new Error('WhatsApp não conectado para este workspace');
    }

    if (imageUrl) {
      // Envia imagem + legenda
      await session.socket.sendMessage(groupJid, {
        image: { url: imageUrl },
        caption: text,
      });
    } else {
      await session.socket.sendMessage(groupJid, { text });
    }
  }

  // Reconecta todos os workspaces que já tinham sessão salva no disco
  async reconnectAll(workspaceIds) {
    for (const id of workspaceIds) {
      const authPath = this._authPath(id);
      if (fs.existsSync(authPath) && fs.readdirSync(authPath).length > 0) {
        console.log(`[WA] Reconectando workspace: ${id}`);
        await this.connect(id).catch(console.error);
      }
    }
  }
}

export default new WhatsAppManager();
