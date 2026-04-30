import { db as dexie } from './db';
import { db as firestore, auth, handleFirestoreError } from './firebase';
import { collection, doc, setDoc, getDocs, onSnapshot, query, where, writeBatch, Timestamp, deleteDoc } from 'firebase/firestore';
import { uploadAssetPhoto } from './storageService';

// Synchronize simple collections (one-way: Cloud -> Local)
export function setupSync() {
  if (!auth.currentUser) return;

  // 1. Sync Locations
  let isFirstLoadLocations = true;
  onSnapshot(collection(firestore, 'locations'), async (snapshot) => {
    if (isFirstLoadLocations) {
      isFirstLoadLocations = false;
      const remoteIds = new Set(snapshot.docs.map(doc => doc.id));
      const localDocs = await dexie.locations.toArray();
      for (const localDoc of localDocs) {
        if (!remoteIds.has(localDoc.id)) {
          await dexie.locations.delete(localDoc.id);
        }
      }
    }
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      if (change.type === 'removed') {
        await dexie.locations.delete(change.doc.id);
      } else {
        await dexie.locations.put({ id: change.doc.id, ...data } as any);
      }
    });
  }, (error) => console.error("Sync Locations Error:", error));

  // 2. Sync Inspections
  let isFirstLoadInspections = true;
  onSnapshot(collection(firestore, 'inspections'), async (snapshot) => {
    if (isFirstLoadInspections) {
      isFirstLoadInspections = false;
      const remoteIds = new Set(snapshot.docs.map(doc => doc.id));
      const localDocs = await dexie.inspections.toArray();
      for (const localDoc of localDocs) {
        if (!remoteIds.has(localDoc.id)) {
          await dexie.inspections.delete(localDoc.id);
        }
      }
    }
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      if (change.type === 'removed') {
        await dexie.inspections.delete(change.doc.id);
      } else {
        await dexie.inspections.put({ id: change.doc.id, ...data } as any);
      }
    });
  }, (error) => console.error("Sync Inspections Error:", error));

  // 3. Sync Assets
  let isFirstLoadAssets = true;
  onSnapshot(collection(firestore, 'assets'), async (snapshot) => {
    if (isFirstLoadAssets) {
      isFirstLoadAssets = false;
      const remoteIds = new Set(snapshot.docs.map(doc => doc.id));
      const localDocs = await dexie.assets.toArray();
      for (const localDoc of localDocs) {
        if (!remoteIds.has(localDoc.id) && !localDoc.needsSync) {
          await dexie.assets.delete(localDoc.id);
        }
      }
    }
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      if (change.type === 'removed') {
        await dexie.assets.delete(change.doc.id);
      } else {
        await dexie.assets.put({ id: change.doc.id, ...data } as any);
      }
    });
  }, (error) => console.error("Sync Assets Error:", error));

  // 4. Sync Users
  let isFirstLoadUsers = true;
  onSnapshot(collection(firestore, 'users'), async (snapshot) => {
    if (isFirstLoadUsers) {
      isFirstLoadUsers = false;
      const remoteIds = new Set(snapshot.docs.map(doc => doc.id));
      const localDocs = await dexie.users.toArray();
      for (const localDoc of localDocs) {
        if (!remoteIds.has(localDoc.userId)) {
          await dexie.users.delete(localDoc.userId);
        }
      }
    }
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      if (change.type === 'removed') {
        await dexie.users.delete(change.doc.id);
      } else {
        await dexie.users.put({ userId: change.doc.id, ...data } as any);
      }
    });
  }, (error) => console.error("Sync Users Error:", error));
}

let isPushing = false;

// Push local changes to cloud
export async function pushLocalChanges() {
  if (isPushing) return;
  
  const allAssets = await dexie.assets.toArray();
  // We want to push unsynced assets OR assets that still have Base64 photos (migration)
  const unsyncedAssets = allAssets.filter(a => 
    a.needsSync === true || 
    (a.photos && a.photos.some(p => typeof p === 'string' && p.startsWith('data:image')))
  );
  
  if (unsyncedAssets.length === 0) {
    // Dispatch end event anyway to ensure UI states are cleared
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
    return;
  }

  isPushing = true;
  window.dispatchEvent(new CustomEvent('app-sync-start'));

  try {
    // Process each asset and its photos
    for (const asset of unsyncedAssets) {
      const { needsSync, ...data } = asset;
      let photoUpdateNeeded = false;
      
      // Handle photos: Upload Base64 to Storage if needed
      if (data.photos && data.photos.length > 0) {
        const processedPhotos = await Promise.all(
          data.photos.map(async (photo, index) => {
            if (typeof photo === 'string' && photo.startsWith('data:image')) {
              try {
                const storagePath = `assets/${asset.id}/photo_${index}_${Date.now()}.jpg`;
                const downloadURL = await uploadAssetPhoto(photo, storagePath);
                photoUpdateNeeded = true;
                return downloadURL;
              } catch (err) {
                console.error(`Falha no upload da foto ${index} do item ${asset.id}:`, err);
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

      if (data.isPublic === undefined) {
        (data as any).isPublic = true;
      }

      const assetRef = doc(firestore, 'assets', asset.id);
      await setDoc(assetRef, data);
      await dexie.assets.update(asset.id, { needsSync: false });
    }
  
    await new Promise(resolve => setTimeout(resolve, 500));
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
  if (inspection) {
    window.dispatchEvent(new CustomEvent('app-sync-start'));
    try {
      await setDoc(doc(firestore, 'inspections', inspection.id), inspection);
      await new Promise(resolve => setTimeout(resolve, 800));
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
      handleFirestoreError(error, 'write', `inspections/${inspectionId}`);
    }
  }
}

export async function syncLocation(locationId: string) {
  const location = await dexie.locations.get(locationId);
  if (location) {
    window.dispatchEvent(new CustomEvent('app-sync-start'));
    try {
      await setDoc(doc(firestore, 'locations', location.id), location);
      await new Promise(resolve => setTimeout(resolve, 800));
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
      handleFirestoreError(error, 'write', `locations/${locationId}`);
    }
  }
}
