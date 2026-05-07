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
    const lastSyncTime = parseInt(localStorage.getItem(storageKey) || '0');
    
    // Delta query or full query if first time
    const q = lastSyncTime > 0 
      ? query(collection(firestore, name), where('updatedAt', '>', lastSyncTime))
      : query(collection(firestore, name));

    onSnapshot(q, async (snapshot) => {
      let maxUpdatedAt = lastSyncTime;

      for (const change of snapshot.docChanges()) {
        const data = change.doc.data() as any;
        const updatedAt = data.updatedAt || 0;
        if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

        if (change.type === 'removed' || data.deleted === true) {
          await table.delete(change.doc.id);
        } else {
          await table.put({ [pk]: change.doc.id, ...data });
        }
      }

      if (maxUpdatedAt > lastSyncTime) {
        localStorage.setItem(storageKey, maxUpdatedAt.toString());
      }
    }, (error) => console.error(`Sync ${name} Error:`, error));
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
    const unsyncedLocations = await dexie.locations.where('needsSync').equals(1 as any).toArray();
    for (const loc of unsyncedLocations) {
      const locRef = doc(firestore, 'locations', loc.id);
      if (loc.deleted) {
        await deleteDoc(locRef);
        await dexie.locations.delete(loc.id);
      } else {
        const { needsSync, ...data } = loc;
        data.updatedAt = Date.now();
        await setDoc(locRef, data);
        await dexie.locations.update(loc.id, { needsSync: false, updatedAt: data.updatedAt });
      }
    }

    // 2. Sync Inspections
    const unsyncedInspections = await dexie.inspections.where('needsSync').equals(1 as any).toArray();
    for (const insp of unsyncedInspections) {
      const inspRef = doc(firestore, 'inspections', insp.id);
      if (insp.deleted) {
        await deleteDoc(inspRef);
        await dexie.inspections.delete(insp.id);
      } else {
        const { needsSync, ...data } = insp;
        data.updatedAt = Date.now();
        await setDoc(inspRef, data);
        await dexie.inspections.update(insp.id, { needsSync: false, updatedAt: data.updatedAt });
      }
    }

    // 3. Sync Assets
    const unsyncedAssets = await dexie.assets.where('needsSync').equals(1 as any).toArray();
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
      await dexie.assets.update(asset.id, { needsSync: false, updatedAt: data.updatedAt });
    }
  
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    console.error("Sync Error:", error);
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
      await dexie.inspections.update(inspection.id, { updatedAt: data.updatedAt, needsSync: false });
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
      await dexie.locations.update(location.id, { updatedAt: data.updatedAt, needsSync: false });
    }
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
    handleFirestoreError(error, 'write', `locations/${locationId}`);
  }
}
