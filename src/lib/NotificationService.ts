import { db, generateId, Notification } from './db';

export async function checkAndGenerateNotifications(userId: string) {
  const now = Date.now();
  const user = await db.users.get(userId);
  if (!user) return;

  // 1. Check for upcoming inspections (Reminders)
  // Scheduled for the next 24 hours
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

  // 2. Check for critical items (Alerts)
  // Assets marked as 'ruim' or 'inservivel' in the last 72 hours (3 days)
  // Only sent to 'administrador' and 'responsavel' (Asset Manager)
  if (user.role === 'administrador' || user.role === 'responsavel') {
    const seventyTwoHoursAgo = now - (3 * 24 * 60 * 60 * 1000);
    const criticalAssets = await db.assets
      .where('createdAt')
      .above(seventyTwoHoursAgo)
      .filter(a => a.condition === 'ruim' || a.condition === 'inservivel')
      .toArray();

    for (const asset of criticalAssets) {
      const notificationId = `alert-${asset.id}-${userId}`;
      const exists = await db.notifications.get(notificationId);
      
      if (!exists) {
        await db.notifications.add({
          id: notificationId,
          type: 'alerta',
          title: '🚨 Alerta de Estado Crítico',
          message: `O item "${asset.name}" foi registrado como "${asset.condition.toUpperCase()}". Recomenda-se revisão técnica imediata ou abertura de processo de baixa/ação corretiva.`,
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
