import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { createId } from '../utils/ids';
import { nowIso } from '../utils/dateUtils';
import { validateImageInput } from '../utils/validation';
import { assertActiveCustomer, getCustomer } from './customerService';
import { getFileStore } from './fileStore';

export async function listCustomerImages(customerId) {
  await getCustomer(customerId);
  const db = activeDb();
  return db.all(
    `SELECT * FROM customer_images
     WHERE customer_id = ?
     ORDER BY image_date DESC, created_at DESC`,
    [customerId],
  );
}

export async function addCustomerImage(input) {
  const data = validateImageInput(input);
  await assertActiveCustomer(input.customerId);
  const imageId = createId();
  const stored = await getFileStore().saveFromUri({
    customerId: input.customerId,
    imageId,
    sourceUri: input.sourceUri,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
  const db = activeDb();
  try {
    await db.run(
      `INSERT INTO customer_images (
        id, customer_id, image_name, image_date, local_uri, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [imageId, input.customerId, data.imageName, data.imageDate, stored.uri, stored.mimeType || null, nowIso()],
    );
  } catch (error) {
    await getFileStore().delete(stored.uri);
    throw error;
  }
  return db.get('SELECT * FROM customer_images WHERE id = ? AND customer_id = ?', [imageId, input.customerId]);
}

export async function deleteCustomerImage(customerId, imageId) {
  const db = activeDb();
  const row = await db.get('SELECT * FROM customer_images WHERE id = ? AND customer_id = ?', [imageId, customerId]);
  if (!row) throw new AppError('NOT_FOUND', 'Image not found for this customer.');
  await getFileStore().delete(row.local_uri);
  await db.run('DELETE FROM customer_images WHERE id = ? AND customer_id = ?', [imageId, customerId]);
}

export async function getCustomerImage(customerId, imageId) {
  const db = activeDb();
  const row = await db.get('SELECT * FROM customer_images WHERE id = ? AND customer_id = ?', [imageId, customerId]);
  if (!row) throw new AppError('NOT_FOUND', 'Image not found for this customer.');
  return row;
}

export async function getStorageInfo() {
  const db = activeDb();
  const images = await db.all('SELECT local_uri FROM customer_images');
  let bytes = 0;
  let missing = 0;
  const store = getFileStore();
  for (const image of images) {
    const size = await store.size(image.local_uri);
    if (!size) missing += 1;
    bytes += size;
  }
  return { imageCount: images.length, bytes, missing };
}
