import { Router } from 'express';
import { buildAuthorizeUrl, exchangeCode } from '../platforms/mercadolivre.js';

const router = Router();

// GET /ml/authorize?workspaceId=xxx
router.get('/ml/authorize', (req, res) => {
  const url = buildAuthorizeUrl();
  // Salva workspaceId em cookie temporário para usar no callback
  if (req.query.workspaceId) {
    res.cookie('ml_workspace', req.query.workspaceId, { maxAge: 600000, httpOnly: true });
  }
  res.redirect(url);
});

// GET /ml/callback?code=xxx
router.get('/ml/callback', async (req, res) => {
  const { code } = req.query;
  const workspaceId = req.cookies?.ml_workspace;

  if (!code) return res.status(400).send('Código de autorização não encontrado');
  if (!workspaceId) return res.status(400).send('Workspace não identificado. Tente novamente.');

  try {
    await exchangeCode(workspaceId, code);
    res.clearCookie('ml_workspace');
    res.redirect('/?ml_success=1');
  } catch (err) {
    console.error('[ML OAuth]', err.message);
    res.status(500).send(`Erro na autorização: ${err.message}`);
  }
});

export default router;
