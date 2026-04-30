import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads a base64 image to Firebase Storage.
 * @param base64 String containing the image data
 * @param path The storage path (e.g., 'assets/asset-id/photo-1.jpg')
 * @returns The download URL
 */
export async function uploadAssetPhoto(base64: string, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  
  // uploadString handles data_url format automatically
  await uploadString(storageRef, base64, 'data_url');
  
  const downloadURL = await getDownloadURL(storageRef);
  return downloadURL;
}

/**
 * Deletes a file from Firebase Storage given its URL or path.
 */
export async function deleteAssetPhoto(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Storage delete failed (might be already deleted):", err);
  }
}
