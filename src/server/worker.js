import cron from 'node-cron';
import db from './db.js';
import { searchOffers } from './platforms/index.js';

// Intervalo de busca (avalia a cada 5 minutos)
const SEARCH_INTERVAL = '*/5 * * * *';

let cronJob = null;

export function startWorker() {
  if (cronJob) return;

  console.log('[Worker] Iniciando worker de busca de ofertas...');

  cronJob = cron.schedule(SEARCH_INTERVAL, async () => {
    await runSearch();
  });

  // Roda imediatamente ao iniciar
  runSearch().catch(console.error);
}

export async function runSearch(force = false) {
  try {
    const workspaces = await db.workspace.findMany({
      include: { platforms: { where: { enabled: true } } },
    });

    for (const workspace of workspaces) {
      const settings = (workspace.settings ?? {});
      
      for (const platform of workspace.platforms) {
        // Verifica intervalo de busca configurado (ignora se for busca manual/forçada)
        const lastSyncAt = platform.lastSyncAt;
        if (!force && lastSyncAt) {
          const now = new Date();
          const hoursSinceLastSync = (now - new Date(lastSyncAt)) / (1000 * 60 * 60);
          
          let requiredIntervalHours = 0;
          if (platform.platform === 'shopee') {
            requiredIntervalHours = parseFloat(settings.shopeeSearchIntervalHours) || 0;
          } else if (platform.platform === 'mercadolivre') {
            requiredIntervalHours = parseFloat(settings.mlSearchIntervalHours) || 0;
          }
          
          if (requiredIntervalHours > 0 && hoursSinceLastSync < requiredIntervalHours) {
            // Ainda não deu o tempo de buscar novamente
            continue;
          }
        }

        await searchAndSave(workspace, platform).catch((err) => {
          console.error(`[Worker] Erro no workspace ${workspace.slug} / ${platform.platform}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error('[Worker] Erro no ciclo de busca:', err);
  }
}

async function searchAndSave(workspace, platform) {
  const workspaceId = workspace.id;
  const config = platform.config ?? {};
  const filters = config.filters ?? {};
  const settings = workspace.settings ?? {};
  
  console.log(`[Worker] Buscando ${platform.platform} para workspace ${workspaceId}...`);

  const offers = await searchOffers(workspaceId, platform.platform, filters);

  let created = 0;
  for (const offer of offers) {
    try {
      // Se autoApprove estiver ligado, já salva como approved. Senão, pending.
      offer.status = settings.autoApprove ? 'approved' : 'pending';

      await db.offer.upsert({
        where: {
          platform_externalId_workspaceId: {
            platform: offer.platform,
            externalId: offer.externalId,
            workspaceId: offer.workspaceId,
          },
        },
        create: offer,
        update: {
          price: offer.price,
          originalPrice: offer.originalPrice,
          discount: offer.discount,
          affiliateUrl: offer.affiliateUrl,
          updatedAt: new Date(),
          // Não atualizamos o status no update para não sobrescrever a aprovação manual do usuário
        },
      });
      created++;
    } catch (err) {
      // ignora duplicatas silenciosamente
      if (!err.message.includes('Unique')) {
        console.error('[Worker] Erro ao salvar oferta:', err.message);
      }
    }
  }

  await db.workspacePlatform.update({
    where: { workspaceId_platform: { workspaceId, platform: platform.platform } },
    data: { lastSyncAt: new Date() },
  });

  console.log(`[Worker] ${platform.platform}: ${created} ofertas processadas`);
}

export function stopWorker() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[Worker] Worker parado');
  }
}
