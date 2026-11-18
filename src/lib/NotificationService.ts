import { db, Notification } from './db';
import { supabase } from './supabase';

// Solicita permissão para notificações nativas do navegador/celular
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (window.Notification.permission === 'granted') return true;
  if (window.Notification.permission !== 'denied') {
    const permission = await window.Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

// Dispara notificação nativa no dispositivo para alertas críticos
function triggerNativePush(notif: Notification) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission === 'granted') {
    try {
      new window.Notification(notif.title, {
        body: notif.message,
        icon: '/favicon.ico',
        tag: notif.id,
      });
    } catch (e) {
      console.warn('Falha ao disparar push nativo:', e);
    }
  }
}

// Salva no Dexie local e replica na nuvem (Supabase) sem travar offline
async function saveAndSyncNotification(notif: Notification, notifyNative = false) {
  await db.notifications.put(notif);
  if (notifyNative && notif.type === 'alerta') {
    triggerNativePush(notif);
  }
  try {
    await supabase.from('notifications').upsert(notif, { onConflict: 'id' });
  } catch (e) {
    console.warn('Notificação salva localmente (aguardando conexão):', e);
  }
}

// Puxa notificações do Supabase para o Dexie local
export async function syncNotifications(userId: string) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('targetUserId', userId)
      .order('date', { ascending: false })
      .limit(100);

    if (!error && data) {
      for (const remote of data) {
        const local = await db.notifications.get(remote.id);
        // Preserva status de lido se já foi marcado localmente
        const isRead = Boolean(local?.read || remote.read);
        await db.notifications.put({
          ...remote,
          read: isRead,
        });
      }
    }
  } catch (e) {
    console.warn('Sync de notificações offline:', e);
  }
}

// Escuta novos alertas em tempo real via Supabase Realtime
export function subscribeToNotifications(userId: string) {
  const channel = supabase
    .channel(`notifications-live-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `targetUserId=eq.${userId}`,
      },
      async (payload) => {
        const incoming = payload.new as Notification;
        if (incoming && incoming.id) {
          const exists = await db.notifications.get(incoming.id);
          if (!exists) {
            await db.notifications.put(incoming);
            if (!incoming.read) {
              triggerNativePush(incoming);
            }
          }
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function checkAndGenerateNotifications(userId: string) {
  const now = Date.now();
  const user = await db.users.get(userId);
  if (!user) return;

  // Sincroniza notificações da nuvem primeiro
  await syncNotifications(userId);

  const oneDayMs = 24 * 60 * 60 * 1000;
  const threeDaysMs = 3 * oneDayMs;
  const sevenDaysMs = 7 * oneDayMs;

  // 1. Vistorias Programadas (próximas 24h)
  const upcomingInspections = await db.inspections
    .where('status')
    .equals('em_andamento')
    .filter((i) => !i.deleted && i.date > now && i.date < now + oneDayMs)
    .toArray();

  for (const insp of upcomingInspections) {
    const notificationId = `reminder-${insp.id}-${userId}`;
    const exists = await db.notifications.get(notificationId);
    if (!exists) {
      const location = await db.locations.get(insp.locationId);
      await saveAndSyncNotification({
        id: notificationId,
        type: 'lembrete',
        title: 'Vistoria Programada',
        message: `Lembrete: Vistoria em "${location?.name || 'Local'}" está programada para ocorrer em breve.`,
        date: now,
        read: false,
        targetUserId: userId,
        relatedId: insp.id,
      });
    }
  }

  // 2. Vistorias em Atraso (data já passou há mais de 24h e continua em_andamento)
  const overdueInspections = await db.inspections
    .where('status')
    .equals('em_andamento')
    .filter((i) => !i.deleted && i.date < now - oneDayMs)
    .toArray();

  for (const insp of overdueInspections) {
    const notificationId = `overdue-${insp.id}-${userId}`;
    const exists = await db.notifications.get(notificationId);
    if (!exists) {
      const location = await db.locations.get(insp.locationId);
      await saveAndSyncNotification(
        {
          id: notificationId,
          type: 'alerta',
          title: '⏰ Vistoria em Atraso',
          message: `A vistoria do setor "${location?.name || 'Local'}" ultrapassou o prazo previsto e segue pendente de conclusão.`,
          date: now,
          read: false,
          targetUserId: userId,
          relatedId: insp.id,
        },
        true
      );
    }
  }

  // Regras exclusivas para Administrador e Responsável Patrimonial
  if (user.role === 'administrador' || user.role === 'responsavel') {
    // 3. Itens em Estado Crítico ('ruim' ou 'inservivel' nos últimos 3 dias)
    const criticalAssets = await db.assets
      .where('createdAt')
      .above(now - threeDaysMs)
      .filter((a) => !a.deleted && (a.condition === 'ruim' || a.condition === 'inservivel'))
      .toArray();

    for (const asset of criticalAssets) {
      const notificationId = `alert-${asset.id}-${userId}`;
      const exists = await db.notifications.get(notificationId);
      if (!exists) {
        await saveAndSyncNotification(
          {
            id: notificationId,
            type: 'alerta',
            title: '🚨 Alerta de Estado Crítico',
            message: `O item "${asset.name}" foi registrado como "${asset.condition.toUpperCase()}". Recomenda-se revisão técnica imediata ou abertura de processo de baixa/ação corretiva.`,
            date: now,
            read: false,
            targetUserId: userId,
            relatedId: asset.id,
          },
          true
        );
      }
    }

    // 4. Bens Sem Número de Patrimônio / Plaqueta (últimos 7 dias)
    const untaggedAssets = await db.assets
      .where('createdAt')
      .above(now - sevenDaysMs)
      .filter(
        (a) =>
          !a.deleted &&
          (!a.patrimonyNumber ||
            a.patrimonyNumber.trim() === '' ||
            a.patrimonyNumber.toLowerCase() === 's/n')
      )
      .toArray();

    for (const asset of untaggedAssets) {
      const notificationId = `untagged-${asset.id}-${userId}`;
      const exists = await db.notifications.get(notificationId);
      if (!exists) {
        await saveAndSyncNotification({
          id: notificationId,
          type: 'sistema',
          title: '🏷️ Tombamento Pendente',
          message: `O bem "${asset.name}" foi cadastrado sem número de plaqueta patrimonial. Providencie a identificação física e atualização do registro.`,
          date: now,
          read: false,
          targetUserId: userId,
          relatedId: asset.id,
        });
      }
    }
  }
}

export async function markAsRead(notificationId: string) {
  await db.notifications.update(notificationId, { read: true });
  try {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
  } catch (e) {
    console.warn('Leitura salva localmente:', e);
  }
}

export async function markAllAsRead(userId: string) {
  await db.notifications.where('targetUserId').equals(userId).modify({ read: true });
  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('targetUserId', userId)
      .eq('read', false);
  } catch (e) {
    console.warn('Leitura em lote salva localmente:', e);
  }
}

export async function deleteNotification(notificationId: string) {
  await db.notifications.delete(notificationId);
  try {
    await supabase.from('notifications').delete().eq('id', notificationId);
  } catch (e) {
    console.warn('Exclusão salva localmente:', e);
  }
}
