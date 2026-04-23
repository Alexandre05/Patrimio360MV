import { db, generateId } from './db';

export async function seedDatabase() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    // We can leave seed empty for users to allow the "first user is admin" flow
    // But we still seed locations for a better initial experience
    await db.locations.bulkAdd([
      { id: generateId(), name: 'Gabinete do Prefeito', description: 'Bloco A, Piso 2' },
      { id: generateId(), name: 'Secretaria de Saúde', description: 'Bloco C, Térreo' },
      { id: generateId(), name: 'Almoxarifado Central', description: 'Pátio Industrial' }
    ]);
  }
}
