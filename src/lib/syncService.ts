/**
 * PATRI360 - Sistema de Auditoria e Gestão Patrimonial
 * Copyright (c) 2026 [Alexandre Barreto Menna Prefeitura de Manoel Viana]. Todos os direitos reservados.
 */
import { db as dexie } from './db';
import { db as firestore, auth, handleFirestoreError } from './firebase';
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import { uploadAssetPhoto } from './storageService';

function sanitizeForFirestore(obj: any) {
  const newObj = { ...obj };
  Object.keys(newObj).forEach(key => {
    if (newObj[key] === undefined) {
      delete newObj[key];
    }
  });
  return newObj;
}

let unsubscribers: (() => void)[] = [];

// MANTEVE A SUA FUNÇÃO ORIGINAL INTACTA
export function setupSync() {
  if (!auth.currentUser) return;

  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];

  // 🚀 VIGILANTE DE RESET 
  try {
    const sysRef = doc(firestore, 'locations', 'GLOBAL_RESET_COMMAND');
    const unsubSys = onSnapshot(sysRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const localReset = localStorage.getItem('global_reset_time');
        const remoteReset = data.reset_timestamp?.toString();
        
        if (remoteReset && localReset !== remoteReset) {
          console.warn("🚨 COMANDO DE RESET GLOBAL RECEBIDO DA NUVEM!");
          localStorage.clear();
          localStorage.setItem('global_reset_time', remoteReset);
          await dexie.locations.clear();
          await dexie.inspections.clear();
          await dexie.assets.clear();
          window.location.reload();
        }
      }
    });
    unsubscribers.push(unsubSys);
  } catch (err) {
    console.warn("Escuta de sistema offline", err);
  }

  const collections = [
    { name: 'locations', dexie: dexie.locations, pk: 'id' },
    { name: 'inspections', dexie: dexie.inspections, pk: 'id' },
    { name: 'assets', dexie: dexie.assets, pk: 'id' },
    { name: 'users', dexie: dexie.users, pk: 'userId' }
  ];

  collections.forEach(({ name, dexie: table, pk }) => {
    const storageKey = `lastSyncTime_${name}`;
    const lastTimeStr = localStorage.getItem(storageKey);
    const lastSyncTime = parseInt(lastTimeStr || '0');
    
    const safeSyncTime = lastSyncTime > 3600000 ? lastSyncTime - 3600000 : 0;

    const q = safeSyncTime > 0 
      ? query(collection(firestore, name), where('updatedAt', '>', safeSyncTime))
      : query(collection(firestore, name));

    const unsub = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty && safeSyncTime > 0) return;
      
      let maxUpdatedAt = lastSyncTime;

      await dexie.transaction('rw', table as any, async () => {
        for (const change of snapshot.docChanges()) {
          const data = change.doc.data() as any;
          const updatedAt = data.updatedAt || 0;
          if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

          if (change.type === 'removed' || data.deleted === true) {
            await table.delete(change.doc.id);
          } else {
            await table.put({ [pk]: change.doc.id, ...data, needsSync: 0 });
          }
        }
      });

      if (maxUpdatedAt > lastSyncTime) {
        localStorage.setItem(storageKey, maxUpdatedAt.toString());
      }
    }, (error) => {
      console.error(`[Sync] Erro no stream de ${name}:`, error);
    });

    unsubscribers.push(unsub);
  });
}

let isPushing = false;

// MANTEVE O SEU PUSH ANTIGO (Para não quebrar botões existentes)
export async function pushLocalChanges() {
  if (isPushing) return;
  
  isPushing = true;
  window.dispatchEvent(new CustomEvent('app-sync-start'));

  try {
    const unsyncedLocations = await dexie.locations.filter(loc => loc.needsSync === 1 || loc.needsSync === true as any).toArray();
    for (const loc of unsyncedLocations) {
      try {
        const locRef = doc(firestore, 'locations', loc.id);
        if (loc.deleted) {
          await deleteDoc(locRef);
          await dexie.locations.delete(loc.id);
        } else {
          const { needsSync, ...data } = loc;
          data.updatedAt = Date.now();
          await setDoc(locRef, sanitizeForFirestore(data));
          await dexie.locations.update(loc.id, { needsSync: 0, updatedAt: data.updatedAt });
        }
      } catch (e) {
        console.error(`[Sync] Falha ao sincronizar local:`, e);
      }
    }

    const unsyncedInspections = await dexie.inspections.filter(insp => insp.needsSync === 1 || insp.needsSync === true as any).toArray();
    for (const insp of unsyncedInspections) {
      try {
        const inspRef = doc(firestore, 'inspections', insp.id);
        if (insp.deleted) {
          await deleteDoc(inspRef);
          await dexie.inspections.delete(insp.id);
        } else {
          const { needsSync, ...data } = insp;
          data.updatedAt = Date.now();
          await setDoc(inspRef, sanitizeForFirestore(data));
          await dexie.inspections.update(insp.id, { needsSync: 0, updatedAt: data.updatedAt });
        }
      } catch (e) {
        console.error(`[Sync] Falha ao sincronizar vistoria:`, e);
      }
    }

    const unsyncedAssets = await dexie.assets.filter(asset => asset.needsSync === 1 || asset.needsSync === true as any).toArray();
    for (const asset of unsyncedAssets) {
      try {
        const assetRef = doc(firestore, 'assets', asset.id);

        if (asset.deleted) {
          await deleteDoc(assetRef);
          await dexie.assets.delete(asset.id);
          continue;
        }

        const { needsSync, ...data } = asset;
        data.updatedAt = Date.now();
        
        if (asset.photos) {
           data.photos = asset.photos;
        }

        if (data.isPublic === undefined) data.isPublic = true;
        
        await setDoc(assetRef, sanitizeForFirestore(data));
        await dexie.assets.update(asset.id, { 
           needsSync: 0, 
           updatedAt: data.updatedAt, 
           photos: data.photos 
        });
      } catch (assetErr) {
        console.error(`[Sync] Erro no item:`, assetErr);
      }
    }
    
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    console.error("[Sync] Erro crítico na sincronização:", error);
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
  } finally {
    isPushing = false;
  }
}

export async function syncInspection(inspectionId: string) {
  const inspection = await dexie.inspections.get(inspectionId);
  if (!inspection) return;
  window.dispatchEvent(new CustomEvent('app-sync-start'));
  try {
    const inspectionRef = doc(firestore, 'inspections', inspection.id);
    if (inspection.deleted) {
      await deleteDoc(inspectionRef);
      await dexie.inspections.delete(inspection.id);
    } else {
      const { ...data } = inspection;
      data.updatedAt = Date.now();
      await setDoc(inspectionRef, sanitizeForFirestore(data));
      await dexie.inspections.update(inspection.id, { updatedAt: data.updatedAt, needsSync: 0 });
    }
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
    handleFirestoreError(error, 'write', `inspections/${inspectionId}`);
  }
}

export async function syncLocation(locationId: string) {
  const location = await dexie.locations.get(locationId);
  if (!location) return;
  window.dispatchEvent(new CustomEvent('app-sync-start'));
  try {
    const locationRef = doc(firestore, 'locations', location.id);
    if (location.deleted) {
      await deleteDoc(locationRef);
      await dexie.locations.delete(location.id);
    } else {
      const { ...data } = location;
      data.updatedAt = Date.now();
      await setDoc(locationRef, sanitizeForFirestore(data));
      await dexie.locations.update(location.id, { updatedAt: data.updatedAt, needsSync: 0 });
    }
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
    handleFirestoreError(error, 'write', `locations/${locationId}`);
  }
}

export async function forceFullSyncRecovery() {
  const stillPending = await dexie.assets.filter(a => a.needsSync === 1).count();
  if (stillPending > 0) {
    alert("⚠️ ALERTA: Há itens pendentes que não subiram por falha de conexão. O processo foi cancelado para não perder dados.");
    return;
  }
  const keys = ['lastSyncTime_locations', 'lastSyncTime_inspections', 'lastSyncTime_assets', 'lastSyncTime_users', 'lastSyncTime_sector_inspections'];
  keys.forEach(key => localStorage.removeItem(key));
  await dexie.locations.filter(l => !l.needsSync).delete();
  await dexie.inspections.filter(i => !i.needsSync).delete();
  await dexie.assets.filter(a => a.needsSync !== 1).delete();
  window.location.reload();
}

export async function hardResetAndRescue() {
  const stillPending = await dexie.assets.filter(a => a.needsSync === 1).count();
  if (stillPending > 0) {
    alert("⚠️ CRÍTICO: Não foi possível enviar todos os seus dados para a nuvem. O Reset foi bloqueado para você não perder itens.");
    return;
  }
  localStorage.clear();
  await dexie.delete();
  window.location.reload();
}

// ============================================================================
// NOVO MOTOR DE FILA DE SINCRONIZAÇÃO (ADICIONADO AQUI NO FINAL)
// ============================================================================

export async function addToQueue(collectionName: string, operation: 'create' | 'update' | 'delete', data: any) {
  const docId = data.id;
  if (!docId) {
    console.error("Tentativa de adicionar à fila sem ID:", data);
    return;
  }

  // "Deduping" inteligente
  const existing = await dexie.syncQueue.where('docId').equals(docId).first();

  if (existing) {
    await dexie.syncQueue.update(existing.id!, { 
      data, 
      operation: operation === 'delete' ? 'delete' : existing.operation,
      timestamp: Date.now() 
    });
  } else {
    await dexie.syncQueue.add({ 
      docId, 
      collection: collectionName, 
      operation, 
      data, 
      timestamp: Date.now() 
    });
  }

  processSyncQueue();
}

export async function processSyncQueue() {
  const queue = await dexie.syncQueue.orderBy('timestamp').toArray();

  for (const item of queue) {
    try {
      const docRef = doc(firestore, item.collection, item.docId);
      
      if (item.operation === 'create' || item.operation === 'update') {
        // Envia para o Firebase
        await setDoc(docRef, sanitizeForFirestore(item.data), { merge: true });
      } else if (item.operation === 'delete') {
        await deleteDoc(docRef);
      }
      
      // Remove da fila apenas se teve sucesso
      await dexie.syncQueue.delete(item.id!);
      console.log(`Fila Processada com Sucesso: ${item.operation} em ${item.collection} (${item.docId})`);
      
    } catch (error: any) {
      console.error("Erro na sincronização da Fila. Pausando tentativa:", error.message);
      break; // Para tudo e aguarda melhor internet
    }
    
  }
}