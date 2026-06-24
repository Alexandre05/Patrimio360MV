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

export function setupSync() {
  if (!auth.currentUser) return;

  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
  // 🚀 NOVIDADE 100% SYNC: O Vigilante do Comando Global do Administrador
  try {
    const sysRef = doc(firestore, 'system', 'sync_control');
    const unsubSys = onSnapshot(sysRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const localReset = localStorage.getItem('global_reset_time');
        const remoteReset = data.reset_timestamp?.toString();
        
        // Se a nuvem tem uma data de reset mais nova que a do tablet, o tablet obedece e zera!
        if (remoteReset && localReset !== remoteReset) {
          console.warn("🚨 COMANDO DE RESET GLOBAL RECEBIDO DA NUVEM!");
          localStorage.clear(); // Limpa a memória
          localStorage.setItem('global_reset_time', remoteReset); // Grava a nova data de segurança
          await dexie.delete(); // Destrói o banco local fantasma
          window.location.reload(); // Recarrega para baixar o banco limpo
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

export async function pushLocalChanges() {
  if (isPushing) return;
  
  isPushing = true;
  window.dispatchEvent(new CustomEvent('app-sync-start'));

  try {
    // 1. Sync Locations
    const unsyncedLocations = await dexie.locations
      .filter(loc => loc.needsSync === 1 || loc.needsSync === true as any || String(loc.needsSync) === 'true')
      .toArray();
    
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
        console.error(`[Sync] Falha isolada ao sincronizar local ${loc.id}:`, e);
      }
    }

    // 2. Sync Inspections
    const unsyncedInspections = await dexie.inspections
      .filter(insp => insp.needsSync === 1 || insp.needsSync === true as any || String(insp.needsSync) === 'true')
      .toArray();
    
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
        console.error(`[Sync] Falha isolada ao sincronizar vistoria ${insp.id}:`, e);
      }
    }

    // 3. Sync Assets (O PONTO CRÍTICO DA CORREÇÃO)
    const unsyncedAssets = await dexie.assets
      .filter(asset => asset.needsSync === 1 || asset.needsSync === true as any || String(asset.needsSync) === 'true')
      .toArray();
    
    for (const asset of unsyncedAssets) {
      // 🚀 NOVIDADE: Try/Catch isolado para CADA item. Se um falhar, a fila não quebra!
      try {
        const assetRef = doc(firestore, 'assets', asset.id);

        if (asset.deleted) {
          await deleteDoc(assetRef);
          await dexie.assets.delete(asset.id);
          continue;
        }

        const { needsSync, ...data } = asset;
        data.updatedAt = Date.now();
        
        const processedPhotos: string[] = [];
        let photoUploadFailed = false;

        if (asset.photos) {
          for (let index = 0; index < asset.photos.length; index++) {
            const photo = asset.photos[index];
            if (typeof photo === 'string' && photo.startsWith('data:image')) {
              try {
                const url = await uploadAssetPhoto(photo, `assets/${asset.id}/photo_${Date.now()}_${index}.jpg`);
                processedPhotos.push(url);
              } catch (err) {
                console.error(`[Sync] Falha no upload da foto ${index} do item ${asset.id}:`, err);
                photoUploadFailed = true;
                processedPhotos.push(photo); // Mantém base64 localmente para tentar de novo
              }
            } else {
              processedPhotos.push(photo);
            }
          }
        }

        // Se a foto falhou, abortamos O ENVIO DESTE ITEM ESPECÍFICO para não dar erro de limite da Google
        if (photoUploadFailed) {
          throw new Error("Falha de internet ao subir fotos. Pulando este item temporariamente.");
        }

        data.photos = processedPhotos;
        if (data.isPublic === undefined) data.isPublic = true;
        
        await setDoc(assetRef, sanitizeForFirestore(data));

        await dexie.assets.update(asset.id, { 
          needsSync: 0, 
          updatedAt: data.updatedAt, 
          photos: processedPhotos 
        });
      } catch (assetErr) {
        console.error(`[Sync] Erro isolado ao sincronizar o item ${asset.id}:`, assetErr);
        // Continua rodando o FOR loop para o próximo item
      }
    }
  
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
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
  console.log("[Recovery] Iniciando recuperação total...");
  
  try {
    const pendingCount = await dexie.assets.filter(a => a.needsSync === 1).count();
    if (pendingCount > 0) {
      await pushLocalChanges();
    }
  } catch (e) {
    console.error("[Recovery] Falha ao sincronizar antes do reset:", e);
  }

  // 🚀 NOVIDADE: Trava de Segurança
  const stillPending = await dexie.assets.filter(a => a.needsSync === 1).count();
  if (stillPending > 0) {
    alert("⚠️ ALERTA: Há itens pendentes que não subiram por falha de conexão. O processo foi cancelado para não perder dados.");
    return;
  }

  const keys = [
    'lastSyncTime_locations',
    'lastSyncTime_inspections',
    'lastSyncTime_assets',
    'lastSyncTime_users',
    'lastSyncTime_sector_inspections'
  ];
  
  keys.forEach(key => localStorage.removeItem(key));
  
  try {
    await dexie.locations.filter(l => !l.needsSync).delete();
    await dexie.inspections.filter(i => !i.needsSync).delete();
    await dexie.assets.filter(a => a.needsSync !== 1).delete();
  } catch (e) {
    console.error("[Recovery] Erro ao limpar tabelas locais:", e);
  }

  window.location.reload();
}

export async function hardResetAndRescue() {
  const confirm = window.confirm("Isso fará o download de TUDO do Firebase novamente. Deseja continuar?");
  if (!confirm) return;

  try {
    await pushLocalChanges(); 
  } catch (e) {
    console.error("[Rescue] Erro ao sincronizar antes do reset:", e);
  }

  // 🚀 NOVIDADE: Trava de Segurança Nuclear
  const stillPending = await dexie.assets.filter(a => a.needsSync === 1).count();
  if (stillPending > 0) {
    alert("⚠️ CRÍTICO: Não foi possível enviar todos os seus dados para a nuvem. O Reset foi bloqueado para você não perder itens.");
    return;
  }

  localStorage.clear();
  await dexie.delete();
  window.location.reload();
}