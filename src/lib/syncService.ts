import { db as dexie } from './db';
import { auth } from './firebase'; 
import { cloudDB } from './cloudDB'; // A NOSSA NOVA TOMADA UNIVERSAL

// 🛡️ Filtros Cirúrgicos Estritos
const buildLocationPayload = (loc: any) => ({
  id: loc.id,
  name: loc.name,
  description: loc.description || null,
  internalCode: loc.internalCode || null,
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

const buildUserPayload = (u: any) => ({
  userId: u.userId,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  cargo: u.cargo || '',
  locationId: u.locationId || null,
  isTrashed: u.isTrashed || false,
  updatedAt: Date.now(),
  deleted: u.deleted || false
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
    // 0. USERS (Garante que a equipa também sobe para o banco novo)
    const unsyncedUsers = await dexie.users.filter(u => u.needsSync === 1 || String(u.needsSync) === 'true').toArray();
    for (const u of unsyncedUsers) {
      try {
        const payload = buildUserPayload(u);
        const { error } = await cloudDB.upsertRecord('users', payload);
        if (!error) await dexie.users.update(u.userId, { needsSync: 0, updatedAt: payload.updatedAt });
      } catch (e) {}
    }

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

// 🚀 FUNÇÃO DE RESGATE: Marca tudo no computador como pendente e envia para o Supabase Novo!
export async function migrateAllLocalToNewCloud() {
  console.log("🚀 Iniciando migração total do computador para o novo Supabase...");
  
  await dexie.users.toCollection().modify({ needsSync: 1 });
  await dexie.locations.toCollection().modify({ needsSync: 1 });
  await dexie.inspections.toCollection().modify({ needsSync: 1 });
  await dexie.assets.toCollection().modify({ needsSync: 1 });

  const totalUsers = await dexie.users.count();
  const totalLocations = await dexie.locations.count();
  const totalInspections = await dexie.inspections.count();
  const totalAssets = await dexie.assets.count();

  console.log(`📦 Encontrados no PC: ${totalUsers} usuários, ${totalLocations} locais, ${totalInspections} vistorias e ${totalAssets} bens.`);

  await pushLocalChanges();
  console.log("✅ Migração concluída com sucesso! Todos os dados estão no novo Supabase.");
  alert(`Migração concluída! Enviados: ${totalUsers} usuários, ${totalLocations} locais, ${totalInspections} vistorias e ${totalAssets} bens.`);
}

// Deixamos a função de recuperação apontando para a migração segura para não apagar nada por engano
export async function forceFullSyncRecovery() {
  await migrateAllLocalToNewCloud();
}

export async function hardResetAndRescue() {
  const confirm = window.confirm("Deseja reenviar TODOS os dados salvos neste computador para o novo banco do Supabase?");
  if (!confirm) return;
  await migrateAllLocalToNewCloud();
}

// Disponibiliza o comando no Console (F12) para rodar a qualquer momento
if (typeof window !== 'undefined') {
  (window as any).resgatarDados = migrateAllLocalToNewCloud;
}