import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

// --- TIPOS ---
export type UserRole = 'administrador' | 'responsavel' | 'vistoriador' | 'prefeito';
export type UserStatus = 'ativo' | 'inativo';
export type AssetCondition = 'novo' | 'bom' | 'regular' | 'ruim' | 'inservivel';
export type InspectionStatus = 'em_andamento' | 'concluida' | 'finalizada';
export type NotificationType = 'lembrete' | 'alerta' | 'sistema';

// --- INTERFACES ---
export interface User {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  cargo: string;
  updatedAt?: number;
  deleted?: boolean;
  needsSync?: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  date: number;
  read: boolean;
  targetUserId?: string;
  relatedId?: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  internalCode?: string;
  latitude?: number;
  longitude?: number;
  parentId?: string;
  updatedAt?: number;
  deleted?: boolean;
  needsSync?: number;
}

export interface Inspection {
  id: string;
  locationId: string;
  date: number;
  participants: string[];
  status: InspectionStatus;
  qrCodeData?: string;
  concludedBy?: string;
  concludedAt?: number;
  finalizedBy?: string;
  finalizedAt?: number;
  lastSync?: number;
  updatedAt?: number;
  deleted?: boolean;
  needsSync?: number;
}

export interface Asset {
  id: string;
  inspectionId: string;
  name: string;
  patrimonyNumber?: string;
  condition: AssetCondition;
  photos: string[];
  observations: string;
  createdBy: string;
  createdAt: number;
  hash: string;
  needsSync: number;
  isPublic?: boolean;
  quantity?: number;
  updatedAt?: number;
  deleted?: boolean;
}

export interface AppSettings {
  id: 'current';
  publicBaseUrl?: string;
  municipalityName?: string;
}

// INTERFACE DA FILA DE SINCRONIZAÇÃO
export interface SyncItem {
  id?: number; // Auto-incrementado
  docId: string;
  collection: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
}

// 🚀 NOVA INTERFACE: EVENTOS DA LINHA DO TEMPO
export interface AssetEvent {
  id: string;
  assetId: string;
  type: 'criacao' | 'edicao' | 'transferencia' | 'atualizacao_status' | 'baixa' | 'foto_adicionada';
  description: string;
  userId: string;
  userName: string;
  date: number;
}

// --- CLASSE DO BANCO ---
export class PatrimonyDatabase extends Dexie {
  users!: Table<User>;
  locations!: Table<Location>;
  inspections!: Table<Inspection>;
  assets!: Table<Asset>;
  notifications!: Table<Notification>;
  settings!: Table<AppSettings>;
  syncQueue!: Table<SyncItem>; 
  assetEvents!: Table<AssetEvent>; // 🚀 NOVA TABELA DECLARADA AQUI

  constructor() {
    super('PatrimonyDB');
    
  
   // 🚀 MUDOU PARA VERSÃO 11: Adicionado 'name' na tabela assets para permitir a busca do histórico
    this.version(11).stores({
      users: 'userId, email, role, updatedAt, deleted, needsSync',
      locations: 'id, name, internalCode, updatedAt, deleted, needsSync',
      inspections: 'id, locationId, status, date, updatedAt, deleted, needsSync',
      assets: 'id, inspectionId, name, hash, needsSync, createdAt, patrimonyNumber, updatedAt, deleted', // <-- 'name' ADICIONADO AQUI
      notifications: 'id, type, date, read, targetUserId',
      settings: 'id',
      syncQueue: '++id, docId, timestamp', 
      assetEvents: 'id, assetId, type, date' 
    });
  }
}

export const db = new PatrimonyDatabase();

// --- HELPERS ---
export function sanitizeString(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function generateAssetHash(name: string, patrimony: string | undefined, locationId: string): string {
  const normName = sanitizeString(name);
  const normLoc = sanitizeString(locationId);
  const normPatrimony = patrimony ? sanitizeString(patrimony) : '';

  if (normPatrimony) {
    return `${normPatrimony}-${normLoc}`;
  }
  return `${normName}-${normLoc}`;
}

export function generateId(): string {
  return uuidv4();
}