import cron from 'node-cron';
import db from './db.js';
import waManager from './whatsapp/manager.js';
import { formatOffer } from './formatter.js';

// Roda a cada 1 minuto para checar a fila
const SENDER_INTERVAL = '* * * * *';

let cronJob = null;

export function startSender() {
  if (cronJob) return;

  console.log('[Sender] Iniciando worker de fila de envios...');

  cronJob = cron.schedule(SENDER_INTERVAL, async () => {
    await processQueue();
  });

  processQueue().catch(console.error);
}

export function stopSender() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[Sender] Worker parado');
  }
}

async function processQueue() {
  try {
    const now = new Date();
    
    // Obter a hora atual no fuso horário de Brasília (UTC-3)
    const options = { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' };
    const currentHour = parseInt(new Intl.DateTimeFormat('pt-BR', options).format(now), 10);

    // Bloqueia envios fora do horário (23:00 às 07:59)
    if (currentHour >= 23 || currentHour < 8) {
      return;
    }

    const workspaces = await db.workspace.findMany({
      include: { groups: { where: { active: true } } },
    });

    for (const workspace of workspaces) {
      const settings = workspace.settings ?? {};
      const sendIntervalMinutes = parseFloat(settings.sendIntervalMinutes) || 0;

      if (!settings.autoApprove || sendIntervalMinutes <= 0 || workspace.groups.length === 0) {
        continue;
      }

      // Verifica quando foi a última oferta enviada neste workspace
      const lastSentOffer = await db.offer.findFirst({
        where: { workspaceId: workspace.id, status: 'sent' },
        orderBy: { sentAt: 'desc' },
      });

      if (lastSentOffer && lastSentOffer.sentAt) {
        const minutesSinceLastSend = (now - new Date(lastSentOffer.sentAt)) / (1000 * 60);
        if (minutesSinceLastSend < sendIntervalMinutes) {
          continue; // Ainda não deu o tempo de mandar a próxima
        }
      }

      // Procura a próxima oferta aprovada (ou pendente, caso autoApprove esteja ligado) para enviar
      // Prioridade 1: Shopee
      // Prioridade 2: Mercado Livre
      const nextOffer = await db.offer.findFirst({
        where: { 
          workspaceId: workspace.id, 
          status: settings.autoApprove ? { in: ['approved', 'pending'] } : 'approved' 
        },
        orderBy: [
          { platform: 'desc' }, // 'shopee' vem antes de 'mercadolivre' alfabeticamente
          { createdAt: 'asc' }, // mais antigas primeiro
        ],
      });

      if (!nextOffer) continue;

      // Realiza o envio
      const message = formatOffer(nextOffer);
      const sentGroups = [];
      let sendSuccess = false;

      for (const group of workspace.groups) {
        try {
          await waManager.sendMessage(workspace.id, group.groupJid, message, nextOffer.imageUrl);
          sentGroups.push(group.groupJid);
          sendSuccess = true;
          console.log(`[Sender] Oferta '${nextOffer.title}' enviada no grupo ${group.name}`);
        } catch (err) {
          console.error(`[Sender] Erro ao enviar para ${group.name}:`, err.message);
        }
      }

      if (sendSuccess) {
        await db.offer.update({
          where: { id: nextOffer.id },
          data: { status: 'sent', sentAt: new Date(), sentGroups },
        });
      }
    }
  } catch (err) {
    console.error('[Sender] Erro ao processar fila:', err);
  }
}
