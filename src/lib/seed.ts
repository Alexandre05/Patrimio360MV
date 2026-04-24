import { db, generateId } from './db';

export async function seedDatabase() {
  const userCount = await db.users.count();
  const locationCount = await db.locations.count();
  
  if (userCount === 0 && locationCount === 0) {
    // Only seed if both users and locations are empty - indicating a fresh local DB
    await db.locations.bulkAdd([
      { id: 'loc-gabinete', name: 'Gabinete do Prefeito', description: 'Bloco A, Piso 2' },
      { id: 'loc-saude', name: 'Secretaria de Saúde', description: 'Bloco C, Térreo' },
      { id: 'loc-almoxarifado', name: 'Almoxarifado Central', description: 'Pátio Industrial' }
    ]);
  }
}
