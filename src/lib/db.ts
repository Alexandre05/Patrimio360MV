import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export type UserRole = 'prefeito' | 'responsavel' | 'membro';
export type UserStatus = 'ativo' | 'inativo';
export type AssetCondition = 'novo' | 'bom' | 'regular' | 'ruim' | 'inservivel';
export type InspectionStatus = 'em_andamento' | 'concluida' | 'finalizada';
export type NotificationType = 'lembrete' | 'alerta' | 'sistema';

export interface User {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  cargo: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  date: number;
  read: boolean;
  targetUserId?: string;
  relatedId?: string; // e.g. inspectionId or assetId
}

export interface Location {
  id: string;
  name: string;
  description: string;
  internalCode?: string;
}

export interface Inspection {
  id: string;
  locationId: string;
  date: number; // timestamp
  participants: string[];
  status: InspectionStatus;
  qrCodeData?: string;
  concludedBy?: string;
  concludedAt?: number;
  finalizedBy?: string;
  finalizedAt?: number;
  lastSync?: number;
}

export interface Asset {
  id: string;
  inspectionId: string;
  name: string;
  patrimonyNumber?: string;
  condition: AssetCondition;
  photos: string[]; // base64 for offline
  observations: string;
  createdBy: string;
  createdAt: number;
  hash: string; // name + patrimony + locationId
  needsSync: boolean;
}

export class PatrimonyDatabase extends Dexie {
  users!: Table<User>;
  locations!: Table<Location>;
  inspections!: Table<Inspection>;
  assets!: Table<Asset>;
  notifications!: Table<Notification>;

  constructor() {
    super('PatrimonyDB');
    this.version(5).stores({
      users: 'userId, email, role',
      locations: 'id, name, internalCode',
      inspections: 'id, locationId, status, date',
      assets: 'id, inspectionId, hash, needsSync, createdAt, patrimonyNumber',
      notifications: 'id, type, date, read, targetUserId'
    });
  }
}

export const db = new PatrimonyDatabase();

// Helper to generate hash for deduplication
export function generateAssetHash(name: string, patrimony: string | undefined, locationId: string): string {
  return `${name.toLowerCase().trim()}|${(patrimony || '').toLowerCase().trim()}|${locationId}`;
}

export function generateId(): string {
  return uuidv4();
}
