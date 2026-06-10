import { db, generateId } from './db';

export async function seedDatabase() {
  const userCount = await db.users.count();
  const locationCount = await db.locations.count();
  
  if (userCount === 0 && locationCount === 0) {
    // Only seed if both users and locations are empty - indicating a fresh local DB
    await db.locations.bulkAdd([
      { id: 'loc-gabinete', name: 'Gabinete do Prefeito', description: 'Bloco A, Piso 2' },
      { id: 'loc-saude', name: 'Secretaria de Saúde', description: 'Bloco C, Térreo' },
      { id: 'loc-almoxarifado', name: 'Almoxarifado Central', description: 'Pátio Industrial' },
      { id: 'loc-fisio', name: 'Sala de Fisioterapia (Fisio)', description: 'Secretaria de Saúde - Anexo Sul', parentId: 'loc-saude', latitude: -29.4715, longitude: -55.8078 }
    ]);
  }
}

export async function recreateFisioRoom() {
  console.log("[Recovery] Rebuilding Sala de Fisioterapia environment...");
  
  const existingFisio = await db.locations.get('loc-fisio');
  
  if (existingFisio) {
    if (existingFisio.deleted) {
      await db.locations.update('loc-fisio', { deleted: false, needsSync: 1, updatedAt: Date.now() });
    }
  } else {
    // Ensure parent "Secretaria de Saúde" exists and is active
    const healthParent = await db.locations.get('loc-saude');
    if (!healthParent) {
      await db.locations.put({ 
        id: 'loc-saude', 
        name: 'Secretaria de Saúde', 
        description: 'Bloco C, Térreo',
        latitude: -29.4710,
        longitude: -55.8070,
        updatedAt: Date.now(),
        needsSync: 1
      });
    } else if (healthParent.deleted) {
      await db.locations.update('loc-saude', { deleted: false, needsSync: 1, updatedAt: Date.now() });
    }

    // Create the physiotherapy room
    await db.locations.put({
      id: 'loc-fisio',
      name: 'Sala de Fisioterapia (Fisio)',
      description: 'Secretaria de Saúde - Anexo Sul',
      parentId: 'loc-saude',
      latitude: -29.4715,
      longitude: -55.8078,
      needsSync: 1,
      updatedAt: Date.now()
    });
  }

  // Create or restore an inspection for loc-fisio
  const fisioInspections = await db.inspections.where('locationId').equals('loc-fisio').toArray();
  let inspectionId: string;
  
  const activeInspection = fisioInspections.find(i => !i.deleted);
  
  if (activeInspection) {
    inspectionId = activeInspection.id;
  } else {
    inspectionId = 'insp-fisio-rec';
    await db.inspections.put({
      id: inspectionId,
      locationId: 'loc-fisio',
      date: Date.now(),
      status: 'concluida',
      concludedBy: 'Suporte Técnico',
      concludedAt: Date.now(),
      participants: ['Fisioterapeuta Chefe', 'Equipe de Inspeção'],
      needsSync: 1,
      updatedAt: Date.now()
    });
  }

  // Seeding assets for physiotherapy room if none are present or active
  const existingAssets = await db.assets.where('inspectionId').equals(inspectionId).toArray();
  const activeAssets = existingAssets.filter(a => !a.deleted);

  if (activeAssets.length === 0) {
    const assetsData = [
      {
        id: 'asset-fisio-01',
        inspectionId,
        name: 'Divã Clínico de Madeira para Fisioterapia',
        patrimonyNumber: 'MV-FISIO-001',
        condition: 'bom' as const,
        observations: 'Divã estofado azul marinho, estrutura de madeira maciça envernizada.',
        photos: [],
        createdBy: 'Suporte Técnico',
        createdAt: Date.now(),
        hash: 'mv-fisio-001-loc-fisio',
        needsSync: 1,
        updatedAt: Date.now()
      },
      {
        id: 'asset-fisio-02',
        inspectionId,
        name: 'Aparelho de Ultrassom Terapêutico Ultratronic 1Mhz',
        patrimonyNumber: 'MV-FISIO-002',
        condition: 'bom' as const,
        observations: 'Aparelho de ultrassom funcionando calibrado, acompanha cabeçote aplicador.',
        photos: [],
        createdBy: 'Suporte Técnico',
        createdAt: Date.now(),
        hash: 'mv-fisio-002-loc-fisio',
        needsSync: 1,
        updatedAt: Date.now()
      },
      {
        id: 'asset-fisio-03',
        inspectionId,
        name: 'Aparelho de Eletroestimulação TENS / FES (4 Canais)',
        patrimonyNumber: 'MV-FISIO-003',
        condition: 'regular' as const,
        observations: 'Aparelho de eletroterapia, faltam cabos dos canais 3 e 4. Funcionando.',
        photos: [],
        createdBy: 'Suporte Técnico',
        createdAt: Date.now(),
        hash: 'mv-fisio-003-loc-fisio',
        needsSync: 1,
        updatedAt: Date.now()
      },
      {
        id: 'asset-fisio-04',
        inspectionId,
        name: 'Espaldar de Parede em Madeira (Barra Sueca)',
        patrimonyNumber: 'MV-FISIO-004',
        condition: 'novo' as const,
        observations: 'Espaldar fixado com segurança na parede oeste da sala.',
        photos: [],
        createdBy: 'Suporte Técnico',
        createdAt: Date.now(),
        hash: 'mv-fisio-004-loc-fisio',
        needsSync: 1,
        updatedAt: Date.now()
      },
      {
        id: 'asset-fisio-05',
        inspectionId,
        name: 'Bola Suíça para Pilates e Cinesioterapia (65cm)',
        patrimonyNumber: 'MV-FISIO-005',
        condition: 'regular' as const,
        observations: 'Bola inflável cinza, com bomba de ar manual.',
        photos: [],
        createdBy: 'Suporte Técnico',
        createdAt: Date.now(),
        hash: 'mv-fisio-005-loc-fisio',
        needsSync: 1,
        updatedAt: Date.now()
      },
      {
        id: 'asset-fisio-06',
        inspectionId,
        name: 'Par de Halteres de Cimento Revestido (2kg)',
        patrimonyNumber: 'MV-FISIO-006',
        condition: 'bom' as const,
        observations: 'Halteres emborrachados vermelhos para reabilitação muscular.',
        photos: [],
        createdBy: 'Suporte Técnico',
        createdAt: Date.now(),
        hash: 'mv-fisio-006-loc-fisio',
        needsSync: 1,
        updatedAt: Date.now()
      }
    ];

    for (const asset of assetsData) {
      await db.assets.put(asset);
    }
  }
}

