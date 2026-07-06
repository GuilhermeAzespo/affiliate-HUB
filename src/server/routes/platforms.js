import { Router } from 'express';
import db from '../db.js';
import { listPlatforms } from '../platforms/index.js';
import { buildAuthorizeUrl, exchangeCode } from '../platforms/mercadolivre.js';

const router = Router();

// GET /api/platforms — lista plataformas disponíveis no sistema
router.get('/platforms', (req, res) => {
  const platforms = listPlatforms().map(({ id, name, icon, color, requiresOAuth }) => ({
    id, name, icon, color, requiresOAuth,
  }));
  res.json(platforms);
});

// GET /api/workspaces/:id/platforms — plataformas de um workspace
router.get('/workspaces/:id/platforms', async (req, res) => {
  const platforms = await db.workspacePlatform.findMany({
    where: { workspaceId: req.params.id },
  });
  // Não expõe tokens — apenas config pública
  const safe = platforms.map((p) => ({
    id: p.id,
    platform: p.platform,
    enabled: p.enabled,
    lastSyncAt: p.lastSyncAt,
    filters: p.config?.filters ?? {},
    appId: p.config?.appId,
    affiliateTag: p.config?.affiliateTag,
    connected: !!p.config?.accessToken || !!p.config?.appId,
  }));
  res.json(safe);
});

// POST /api/workspaces/:id/platforms — conecta uma plataforma
router.post('/workspaces/:id/platforms', async (req, res) => {
  const { platform, config } = req.body;

  if (!platform) return res.status(400).json({ error: 'Platform obrigatório' });

  const existing = await db.workspacePlatform.findUnique({
    where: { workspaceId_platform: { workspaceId: req.params.id, platform } },
  });

  const mergedConfig = existing ? {
    ...existing.config,
    ...config,
    filters: config?.filters || existing.config?.filters ? {
      ...(existing.config?.filters ?? {}),
      ...(config?.filters ?? {})
    } : undefined
  } : (config ?? {});

  const record = await db.workspacePlatform.upsert({
    where: { workspaceId_platform: { workspaceId: req.params.id, platform } },
    create: { workspaceId: req.params.id, platform, config: mergedConfig, enabled: true },
    update: { config: mergedConfig, enabled: true, updatedAt: new Date() },
  });

  res.status(201).json({ id: record.id, platform: record.platform, enabled: record.enabled });
});

// PATCH /api/workspaces/:id/platforms/:pid — atualiza filtros / habilita-desabilita
router.patch('/workspaces/:id/platforms/:pid', async (req, res) => {
  const { enabled, filters } = req.body;

  const existing = await db.workspacePlatform.findUnique({ where: { id: req.params.pid } });
  if (!existing) return res.status(404).json({ error: 'Plataforma não encontrada' });

  const updatedConfig = {
    ...existing.config,
    ...(filters ? { filters } : {}),
  };

  const updated = await db.workspacePlatform.update({
    where: { id: req.params.pid },
    data: { enabled: enabled ?? existing.enabled, config: updatedConfig },
  });

  res.json({ id: updated.id, platform: updated.platform, enabled: updated.enabled });
});

// DELETE /api/workspaces/:id/platforms/:pid
router.delete('/workspaces/:id/platforms/:pid', async (req, res) => {
  await db.workspacePlatform.delete({ where: { id: req.params.pid } });
  res.json({ ok: true });
});

export default router;
