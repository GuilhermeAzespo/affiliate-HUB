import { Router } from 'express';
import db from '../db.js';
import waManager from '../whatsapp/manager.js';
import { formatOffer } from '../formatter.js';

const router = Router();

// GET /api/workspaces
router.get('/', async (req, res) => {
  const workspaces = await db.workspace.findMany({
    include: {
      platforms: true,
      _count: { select: { offers: { where: { status: 'pending' } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const withStatus = workspaces.map((ws) => ({
    ...ws,
    waStatus: waManager.getStatus(ws.id),
    pendingCount: ws._count.offers,
  }));

  res.json(withStatus);
});

// POST /api/workspaces
router.post('/', async (req, res) => {
  const { name, description, color } = req.body;

  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const workspace = await db.workspace.create({
    data: { name, slug, description, color: color ?? '#7c3aed' },
  });

  res.status(201).json(workspace);
});

// GET /api/workspaces/:id
router.get('/:id', async (req, res) => {
  const workspace = await db.workspace.findUnique({
    where: { id: req.params.id },
    include: { platforms: true, groups: true },
  });

  if (!workspace) return res.status(404).json({ error: 'Workspace não encontrado' });

  res.json({
    ...workspace,
    waStatus: waManager.getStatus(workspace.id),
    waQr: waManager.getQr(workspace.id),
  });
});

// PATCH /api/workspaces/:id
router.patch('/:id', async (req, res) => {
  const { name, description, color, settings } = req.body;
  
  const dataToUpdate = { name, description, color };
  if (settings !== undefined) {
    dataToUpdate.settings = settings;
  }
  
  const workspace = await db.workspace.update({
    where: { id: req.params.id },
    data: dataToUpdate,
  });
  res.json(workspace);
});

// DELETE /api/workspaces/:id
router.delete('/:id', async (req, res) => {
  await waManager.disconnect(req.params.id).catch(() => {});
  await db.workspace.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

// POST /api/workspaces/:id/whatsapp/connect
router.post('/:id/whatsapp/connect', async (req, res) => {
  const result = await waManager.connect(req.params.id);
  res.json(result);
});

// POST /api/workspaces/:id/whatsapp/disconnect
router.post('/:id/whatsapp/disconnect', async (req, res) => {
  await waManager.disconnect(req.params.id);
  res.json({ ok: true });
});

// GET /api/workspaces/:id/whatsapp/groups
router.get('/:id/whatsapp/groups', async (req, res) => {
  const groups = await waManager.getGroups(req.params.id);
  res.json(groups);
});

// ─── Grupos cadastrados ───────────────────────────────────────────────────────

// POST /api/workspaces/:id/groups
router.post('/:id/groups', async (req, res) => {
  const { groupJid, name } = req.body;
  const group = await db.waGroup.upsert({
    where: { workspaceId_groupJid: { workspaceId: req.params.id, groupJid } },
    create: { workspaceId: req.params.id, groupJid, name },
    update: { name },
  });
  res.status(201).json(group);
});

// PATCH /api/workspaces/:id/groups/:gid
router.patch('/:id/groups/:gid', async (req, res) => {
  const { active } = req.body;
  const group = await db.waGroup.update({
    where: { id: req.params.gid },
    data: { active },
  });
  res.json(group);
});

// DELETE /api/workspaces/:id/groups/:gid
router.delete('/:id/groups/:gid', async (req, res) => {
  await db.waGroup.delete({ where: { id: req.params.gid } });
  res.json({ ok: true });
});

// ─── Ofertas ──────────────────────────────────────────────────────────────────

// GET /api/workspaces/:id/offers
router.get('/:id/offers', async (req, res) => {
  const { status = 'pending', platform, limit = '20', offset = '0' } = req.query;

  const offers = await db.offer.findMany({
    where: {
      workspaceId: req.params.id,
      status,
      ...(platform ? { platform } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset),
  });

  res.json(offers);
});

// POST /api/workspaces/:id/offers/:oid/approve
router.post('/:id/offers/:oid/approve', async (req, res) => {
  const offer = await db.offer.update({
    where: { id: req.params.oid },
    data: { status: 'approved' },
  });
  res.json(offer);
});

// POST /api/workspaces/:id/offers/:oid/reject
router.post('/:id/offers/:oid/reject', async (req, res) => {
  const offer = await db.offer.update({
    where: { id: req.params.oid },
    data: { status: 'rejected' },
  });
  res.json(offer);
});

// POST /api/workspaces/:id/offers/:oid/send
router.post('/:id/offers/:oid/send', async (req, res) => {
  const offer = await db.offer.findUnique({ where: { id: req.params.oid } });
  if (!offer) return res.status(404).json({ error: 'Oferta não encontrada' });

  const groups = await db.waGroup.findMany({
    where: { workspaceId: req.params.id, active: true },
  });

  if (groups.length === 0) {
    return res.status(400).json({ error: 'Nenhum grupo ativo neste workspace' });
  }

  const message = formatOffer(offer);
  const sentGroups = [];

  for (const group of groups) {
    try {
      await waManager.sendMessage(req.params.id, group.groupJid, message, offer.imageUrl);
      sentGroups.push(group.groupJid);
    } catch (err) {
      console.error(`[Send] Erro ao enviar para ${group.name}:`, err.message);
    }
  }

  const updated = await db.offer.update({
    where: { id: req.params.oid },
    data: { status: 'sent', sentAt: new Date(), sentGroups },
  });

  res.json({ ...updated, sentGroups });
});

// POST /api/workspaces/:id/search (busca manual)
router.post('/:id/search', async (req, res) => {
  const { platform, filters } = req.body;
  const { runSearch } = await import('../worker.js');
  await runSearch(true); // Força a busca ignorando o timer de intervalo
  res.json({ ok: true, message: 'Busca iniciada' });
});

export default router;
