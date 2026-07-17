import { db, Notification } from './db';

export async function checkAndGenerateNotifications(userId: string) {
  const now = Date.now();
  const user = await db.users.get(userId);
  if (!user) return;

  // 1. Lembretes de vistorias programadas
  const upcomingInspections = await db.inspections
    .where('status')
    .equals('em_andamento')
    .filter(i => i.date > now && i.date < now + (24 * 60 * 60 * 1000))
    .toArray();

  for (const insp of upcomingInspections) {
    const notificationId = `reminder-${insp.id}-${userId}`;
    const exists = await db.notifications.get(notificationId);
    
    if (!exists) {
      const location = await db.locations.get(insp.locationId);
      await db.notifications.add({
        id: notificationId,
        type: 'lembrete',
        title: 'Vistoria Programada',
        message: `Lembrete: Vistoria em "${location?.name || 'Local'}" está programada para ocorrer em breve.`,
        date: now,
        read: false,
        targetUserId: userId,
        relatedId: insp.id
      });
    }
  }

  // 2. Alertas Críticos (Bens 'ruim' ou 'inservivel')
  // Agora analisa tanto os recém-criados quanto os atualizados/editados nas últimas 72h
  if (user.role === 'administrador' || user.role === 'responsavel') {
    const seventyTwoHoursAgo = now - (3 * 24 * 60 * 60 * 1000);
    
    const criticalAssets = await db.assets
      .filter(a => {
        const timestamp = a.updatedAt || a.createdAt;
        return timestamp > seventyTwoHoursAgo && (a.condition === 'ruim' || a.condition === 'inservivel');
      })
      .toArray();

    for (const asset of criticalAssets) {
      // O ID da notificação inclui a data de atualização, assim, se o item for editado de novo para 'ruim', 
      // ele pode gerar um novo alerta, mas não cria spam da mesma edição.
      const timestampToUse = asset.updatedAt || asset.createdAt;
      const notificationId = `alert-${asset.id}-${timestampToUse}-${userId}`;
      const exists = await db.notifications.get(notificationId);
      
      if (!exists) {
        await db.notifications.add({
          id: notificationId,
          type: 'alerta',
          title: '🚨 Alerta de Estado Crítico',
          message: `O item "${asset.name}" foi registado/alterado para a condição "${asset.condition.toUpperCase()}". Recomenda-se revisão técnica imediata ou abertura de processo de baixa.`,
          date: now,
          read: false,
          targetUserId: userId,
          relatedId: asset.id
        });
      }
    }
  }
}

export async function markAsRead(notificationId: string) {
  await db.notifications.update(notificationId, { read: true });
}

export async function markAllAsRead(userId: string) {
  await db.notifications.where('targetUserId').equals(userId).modify({ read: true });
}