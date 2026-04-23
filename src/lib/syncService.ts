import { db as dexie } from './db';
import { db as firestore, auth, handleFirestoreError } from './firebase';
import { collection, doc, setDoc, getDocs, onSnapshot, query, where, writeBatch, Timestamp, deleteDoc } from 'firebase/firestore';

// Synchronize simple collections (one-way: Cloud -> Local)
export function setupSync() {
  if (!auth.currentUser) return;

  // 1. Sync Locations
  onSnapshot(collection(firestore, 'locations'), (snapshot) => {
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
  onSnapshot(collection(firestore, 'inspections'), (snapshot) => {
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
  onSnapshot(collection(firestore, 'assets'), (snapshot) => {
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
  onSnapshot(collection(firestore, 'users'), (snapshot) => {
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

// Push local changes to cloud
export async function pushLocalChanges() {
  const allAssets = await dexie.assets.toArray();
  const unsyncedAssets = allAssets.filter(a => a.needsSync === true);
  if (unsyncedAssets.length === 0) return;

  window.dispatchEvent(new CustomEvent('app-sync-start'));

  try {
    const batch = writeBatch(firestore);
    for (const asset of unsyncedAssets) {
      const { needsSync, ...data } = asset;
      const assetRef = doc(firestore, 'assets', asset.id);
      batch.set(assetRef, data);
    }
  
    await batch.commit();
    
    // Mark as synced locally
    await dexie.assets.where('id').anyOf(unsyncedAssets.map(a => a.id)).modify({ needsSync: false as any });
    
    // Add small delay for UI polish
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } }));
    }, 800);
  } catch (error) {
    handleFirestoreError(error, 'write', 'assets/batch');
    window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
  }
}

// Specific push helpers
export async function syncInspection(inspectionId: string) {
  const inspection = await dexie.inspections.get(inspectionId);
  if (inspection) {
    window.dispatchEvent(new CustomEvent('app-sync-start'));
    try {
      await setDoc(doc(firestore, 'inspections', inspection.id), inspection);
      setTimeout(() => window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } })), 800);
    } catch (error) {
      handleFirestoreError(error, 'write', `inspections/${inspectionId}`);
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
    }
  }
}

export async function syncLocation(locationId: string) {
  const location = await dexie.locations.get(locationId);
  if (location) {
    window.dispatchEvent(new CustomEvent('app-sync-start'));
    try {
      await setDoc(doc(firestore, 'locations', location.id), location);
      setTimeout(() => window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: true } })), 800);
    } catch (error) {
      handleFirestoreError(error, 'write', `locations/${locationId}`);
      window.dispatchEvent(new CustomEvent('app-sync-end', { detail: { success: false } }));
    }
  }
}
