import { db, generateId } from './db';

export async function seedDatabase() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.bulkAdd([
      {
        userId: 'admin-1',
        name: 'Prefeito João',
        email: 'prefeito@exemplo.com',
        role: 'prefeito',
        status: 'ativo',
        cargo: 'Prefeito'
      },
      {
        userId: 'resp-1',
        name: 'Maria Silva',
        email: 'patrimonio@exemplo.com',
        role: 'responsavel',
        status: 'ativo',
        cargo: 'Chefe de Patrimônio'
      },
      {
        userId: 'membro-1',
        name: 'Carlos Oliveira',
        email: 'comissao@exemplo.com',
        role: 'membro',
        status: 'ativo',
        cargo: 'Membro da Comissão'
      }
    ]);

    await db.locations.bulkAdd([
      { id: generateId(), name: 'Gabinete do Prefeito', description: 'Bloco A, Piso 2' },
      { id: generateId(), name: 'Secretaria de Saúde', description: 'Bloco C, Térreo' },
      { id: generateId(), name: 'Almoxarifado Central', description: 'Pátio Industrial' }
    ]);
  }
}
