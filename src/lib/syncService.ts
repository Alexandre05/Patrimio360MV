import { db as dexie } from './db';
import { auth } from './firebase'; 
import { cloudDB } from './cloudDB'; // A NOSSA NOVA TOMADA UNIVERSAL

// 🛡️ Filtros Cirúrgicos Estritos
const buildLocationPayload = (loc: any) => ({
  id: loc.id,
  name: loc.name,
  description: loc.description || null,
  latitude: loc.latitude ? Number(loc.latitude) : null,
  longitude: loc.longitude ? Number(loc.longitude) : null,
  parentId: loc.parentId || null,
  updatedAt: Date.now(),
  deleted: loc.deleted || false
});

const buildInspectionPayload = (insp: any) => ({
  id: insp.id,
  locationId: insp.locationId,
  date: insp.date,
  participants: Array.isArray(insp.participants) ? insp.participants : [],
  status: insp.status,
  qrCodeData: insp.qrCodeData || null,
  concludedBy: insp.concludedBy || null,
  concludedAt: insp.concludedAt ? Number(insp.concludedAt) : null,
  finalizedBy: insp.finalizedBy || null,
  finalizedAt: insp.finalizedAt ? Number(insp.finalizedAt) : null,
  updatedAt: Date.now(),
  deleted: insp.deleted || false
});

export async function setupSync() {
  if (!auth.currentUser) return;
  const collections = [
    { name: 'locations', dexie: dexie.locations, pk: 'id', updatedCol: 'updatedAt' },
    { name: 'inspections', dexie: dexie.inspections, pk: 'id', updatedCol: 'updatedAt' },
    { name: 'assets', dexie: dexie.assets, pk: 'id', updatedCol: 'updatedAt' },
    { name: 'users', dexie: dexie.users, pk: 'userId', updatedCol: 'updatedAt' } 
  ];

  for (const { name, dexie: table, pk, updatedCol } of collections) {
    const storageKey = `lastSyncTime_${name}`;
    const lastSyncTime = parseInt(localStorage.getItem(storageKey) || '0');
    
    try {
      // Usando o Adaptador Cloud genérico em vez do Supabase direto
      const { data, error } = await cloudDB.getRecordsSince(name, updatedCol, lastSyncTime);
      if (error) throw error;

      if (data && data.length > 0) {
        let maxUpdatedAt = lastSyncTime;
        await dexie.transaction('rw', table as any, async () => {
          for (const record of data) {
            const updatedAt = record.updatedAt || 0;
            if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
            if (record.deleted === true) {
              await table.delete(record[pk]);
            } else {
              await table.put({ ...record, needsSync: 0 });
            }
          }
        });
        if (maxUpdatedAt > lastSyncTime) localStorage.setItem(storageKey, maxUpdatedAt.toString());
      }
    } catch (error) {
      console.error(`[Sync] Erro ao baixar ${name}:`, error);
    }
  }
}

let isPushing = false;

export async function pushLocalChanges() {
  if (isPushing) return;
  isPushing = true;
  window.dispatchEvent(new CustomEvent('app-sync-start'));

  try {
    // 1. LOCATIONS
    const unsyncedLocations = await dexie.locations.filter(loc => loc.needsSync === 1 || String(loc.needsSync) === 'true').toArray();
    for (const loc of unsyncedLocations) {
      try {
        if (loc.deleted) {
          await cloudDB.deleteRecord('locations', loc.id);
          await dexie.locations.delete(loc.id);
        } else {
          const payload = buildLocationPayload(loc);
          const { error } = await cloudDB.upsertRecord('locations', payload);
          if (!error) await dexie.locations.update(loc.id, { needsSync: 0, updatedAt: payload.updatedAt });
        }
      } catch (e) {}
    }

    // 2. INSPECTIONS
    const unsyncedInspections = await dexie.inspections.filter(insp => insp.needsSync === 1 || String(insp.needsSync) === 'true').toArray();
    for (const insp of unsyncedInspections) {
      try {
        if (insp.deleted) {
          await cloudDB.deleteRecord('inspections', insp.id);
          await dexie.inspections.delete(insp.id);
        } else {
          const payload = buildInspectionPayload(insp);
          const { error } = await cloudDB.upsertRecord('inspections', payload);
          if (!error) await dexie.inspections.update(insp.id, { needsSync: 0, updatedAt: payload.updatedAt });
        }
      } catch (e) {}
    }

    // 3. ASSETS
    const unsyncedAssets = await dexie.assets.filter(asset => asset.needsSync === 1 || String(asset.needsSync) === 'true').toArray();
    for (const asset of unsyncedAssets) {
      if (asset.deleted) {
        await cloudDB.deleteRecord('assets', asset.id);
        await dexie.assets.delete(asset.id);
        continue;
      }
      
      const processedPhotos: string[] = [];
      if (asset.photos) {
        for (let index = 0; index < asset.photos.length; index++) {
          const photo = asset.photos[index];
          if (typeof photo === 'string' && photo.startsWith('data:image')) {
            try {
              const url = await cloudDB.uploadPhoto(photo, `${asset.id}/photo_${Date.now()}_${index}.jpg`);
              processedPhotos.push(url);
            } catch (err) { processedPhotos.push(photo); }
          } else { processedPhotos.push(photo); }
        }
      }

      const uniquePhotos = Array.from(new Set(processedPhotos));
      const now = Date.now();

      const payload = {
        id: asset.id,
        inspectionId: asset.inspectionId,
        name: asset.name,
        patrimonyNumber: asset.patrimonyNumber || null,
        condition: asset.condition,
        photos: uniquePhotos,
        observations: asset.observations || null,
        createdBy: asset.createdBy || auth.currentUser?.uid || 'sistema',
        createdAt: asset.createdAt || now,
        hash: asset.hash,
        isPublic: asset.isPublic ?? true,
        quantity: asset.quantity || 1,
        updatedAt: now,
        deleted: asset.deleted || false
      };
      
      const { error } = await cloudDB.upsertRecord('assets', payload);
      if (!error) {
        await dexie.assets.update(asset.id, { needsSync: 0, updatedAt: now, photos: uniquePhotos });
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
    if (inspection.deleted) {
      await cloudDB.deleteRecord('inspections', inspection.id);
      await dexie.inspections.delete(inspection.id);
    } else {
      const payload = buildInspectionPayload(inspection);
      const { error } = await cloudDB.upsertRecord('inspections', payload);
      if (!error) await dexie.inspections.update(inspection.id, { updatedAt: payload.updatedAt, needsSync: 0 });
    }
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
  }
}

export async function syncLocation(locationId: string) {
  const location = await dexie.locations.get(locationId);
  if (!location) return;
  window.dispatchEvent(new CustomEvent('app-sync-start'));
  try {
    if (location.deleted) {
      await cloudDB.deleteRecord('locations', location.id);
      await dexie.locations.delete(location.id);
    } else {
      const payload = buildLocationPayload(location);
      const { error } = await cloudDB.upsertRecord('locations', payload);
      if (!error) await dexie.locations.update(location.id, { updatedAt: payload.updatedAt, needsSync: 0 });
    }
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
  }
}

export async function forceFullSyncRecovery() {
  try {
    const pendingCount = await dexie.assets.filter(a => a.needsSync === 1).count();
    if (pendingCount > 0) { await pushLocalChanges(); }
  } catch (e) {}

  const keys = ['lastSyncTime_locations','lastSyncTime_inspections','lastSyncTime_assets','lastSyncTime_users','lastSyncTime_sector_inspections'];
  keys.forEach(key => localStorage.removeItem(key));
  
  try {
    await dexie.locations.filter(l => !l.needsSync).delete();
    await dexie.inspections.filter(i => !i.needsSync).delete();
    await dexie.assets.filter(a => a.needsSync !== 1).delete();
  } catch (e) {}
  window.location.reload();
}

export async function hardResetAndRescue() {
  const confirm = window.confirm("Isso fará o download de TUDO do Supabase novamente. Deseja continuar?");
  if (!confirm) return;
  try { await pushLocalChanges(); } catch (e) {}
  localStorage.clear();
  await dexie.delete();
  window.location.reload();
}