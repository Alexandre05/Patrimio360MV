import { db as dexie } from './db';
import { db as firestore, auth, handleFirestoreError } from './firebase';
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import { uploadAssetPhoto } from './storageService';

// Synchronize simple collections (Delta Sync: Cloud -> Local)
export function setupSync() {
  if (!auth.currentUser) return;

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
    
    console.log(`[Sync] Configurando escuta para ${name}. Último sync: ${new Date(lastSyncTime).toLocaleString()}`);

    const q = lastSyncTime > 0 
      ? query(collection(firestore, name), where('updatedAt', '>', lastSyncTime))
      : query(collection(firestore, name));

    onSnapshot(q, async (snapshot) => {
      if (snapshot.empty && lastSyncTime > 0) return;
      
      console.log(`[Sync] Recebidas ${snapshot.size} atualizações de ${name}`);
      let maxUpdatedAt = lastSyncTime;

      // Usar uma transação para performance se houver muitos registros
      await dexie.transaction('rw', table as any, async () => {
        for (const change of snapshot.docChanges()) {
          const data = change.doc.data() as any;
          const updatedAt = data.updatedAt || 0;
          if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

          if (change.type === 'removed' || data.deleted === true) {
            await table.delete(change.doc.id);
          } else {
            // Preserva o status needsSync local se o item ainda não subiu
            // mas aqui estamos recebendo do servidor, então o do servidor é mais novo
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
  });
}

let isPushing = false;

// Push local changes to cloud
export async function pushLocalChanges() {
  if (isPushing) return;
  
  isPushing = true;
  window.dispatchEvent(new CustomEvent('app-sync-start'));

  try {
    // 1. Sync Locations
    const unsyncedLocations = await dexie.locations
      .filter(loc => loc.needsSync === 1 || loc.needsSync === true as any || String(loc.needsSync) === 'true')
      .toArray();
    
    if (unsyncedLocations.length > 0) console.log(`[Sync] Encontrados ${unsyncedLocations.length} locais pendentes.`);
    
    for (const loc of unsyncedLocations) {
      const locRef = doc(firestore, 'locations', loc.id);
      try {
        if (loc.deleted) {
          await deleteDoc(locRef);
          await dexie.locations.delete(loc.id);
        } else {
          const { needsSync, ...data } = loc;
          data.updatedAt = Date.now();
          await setDoc(locRef, data);
          await dexie.locations.update(loc.id, { needsSync: 0, updatedAt: data.updatedAt });
        }
      } catch (e) {
        console.error(`[Sync] Falha ao sincronizar local ${loc.id}:`, e);
      }
    }

    // 2. Sync Inspections
    const unsyncedInspections = await dexie.inspections
      .filter(insp => insp.needsSync === 1 || insp.needsSync === true as any || String(insp.needsSync) === 'true')
      .toArray();
    
    if (unsyncedInspections.length > 0) console.log(`[Sync] Encontradas ${unsyncedInspections.length} vistorias pendentes.`);
    
    for (const insp of unsyncedInspections) {
      const inspRef = doc(firestore, 'inspections', insp.id);
      try {
        if (insp.deleted) {
          await deleteDoc(inspRef);
          await dexie.inspections.delete(insp.id);
        } else {
          const { needsSync, ...data } = insp;
          data.updatedAt = Date.now();
          await setDoc(inspRef, data);
          await dexie.inspections.update(insp.id, { needsSync: 0, updatedAt: data.updatedAt });
        }
      } catch (e) {
        console.error(`[Sync] Falha ao sincronizar vistoria ${insp.id}:`, e);
      }
    }

    // 3. Sync Assets
    const unsyncedAssets = await dexie.assets
      .filter(asset => asset.needsSync === 1 || asset.needsSync === true as any || String(asset.needsSync) === 'true')
      .toArray();
    
    if (unsyncedAssets.length > 0) console.log(`[Sync] Encontrados ${unsyncedAssets.length} itens pendentes.`);
    
    for (const asset of unsyncedAssets) {
      const assetRef = doc(firestore, 'assets', asset.id);

      if (asset.deleted) {
        await deleteDoc(assetRef);
        await dexie.assets.delete(asset.id);
        continue;
      }

      const { needsSync, ...data } = asset;
      data.updatedAt = Date.now();
      
      if (data.photos && data.photos.length > 0) {
        let photoUpdateNeeded = false;
        const processedPhotos = await Promise.all(
          data.photos.map(async (photo, index) => {
            if (typeof photo === 'string' && photo.startsWith('data:image')) {
              try {
                const storagePath = `assets/${asset.id}/photo_${index}_${Date.now()}.jpg`;
                const downloadURL = await uploadAssetPhoto(photo, storagePath);
                photoUpdateNeeded = true;
                return downloadURL;
              } catch (err) {
                console.error(`Upload error:`, err);
                return photo;
              }
            }
            return photo;
          })
        );
        
        if (photoUpdateNeeded) {
          data.photos = processedPhotos;
          await dexie.assets.update(asset.id, { photos: processedPhotos });
        }
      }

      if (data.isPublic === undefined) data.isPublic = true;
      await setDoc(assetRef, data);
      await dexie.assets.update(asset.id, { needsSync: 0, updatedAt: data.updatedAt });
    }
  
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
  } finally {
    isPushing = false;
  }
}

// Specific push helpers
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
      await setDoc(inspectionRef, data);
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
      await setDoc(locationRef, data);
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
  
  // 1. Tenta enviar mudanças pendentes antes de qualquer coisa
  try {
    const pendingCount = await dexie.assets.filter(a => a.needsSync === 1).count();
    if (pendingCount > 0) {
      console.log(`[Recovery] Tentando sincronizar ${pendingCount} itens pendentes antes do reset...`);
      await pushLocalChanges();
    }
  } catch (e) {
    console.error("[Recovery] Falha ao sincronizar antes do reset:", e);
  }

  // 2. Limpa os marcadores de tempo
  const keys = [
    'lastSyncTime_locations',
    'lastSyncTime_inspections',
    'lastSyncTime_assets',
    'lastSyncTime_users',
    'lastSyncTime_sector_inspections'
  ];
  
  keys.forEach(key => localStorage.removeItem(key));
  
  // 3. Limpa os dados locais que JÁ ESTÃO sincronizados
  // Isso garante que dados excluídos no Firestore sumam do Dexie local
  try {
    await dexie.locations.filter(l => !l.needsSync).delete();
    await dexie.inspections.filter(i => !i.needsSync).delete();
    await dexie.assets.filter(a => a.needsSync !== 1).delete();
    console.log("[Recovery] Dados locais sincronizados foram limpos.");
  } catch (e) {
    console.error("[Recovery] Erro ao limpar tabelas locais:", e);
    // Se falhar em limpar seletivamente, podemos tentar limpar tudo se o usuário confirmar
    // mas por hora apenas logamos.
  }

  console.log("[Recovery] Cache de sincronização limpo. Recarregando página...");
  window.location.reload();
}
