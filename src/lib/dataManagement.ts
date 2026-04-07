import { collection, doc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const MANAGED_COLLECTIONS = [
  'warehouses',
  'categories',
  'items',
  'transactions',
  'drivers',
  'cars',
  'guards',
] as const;

export const BACKUP_COLLECTIONS = [
  ...MANAGED_COLLECTIONS,
  'users',
  'settings',
] as const;

export type ManagedCollectionName = (typeof MANAGED_COLLECTIONS)[number];
export type BackupCollectionName = (typeof BACKUP_COLLECTIONS)[number];
type CollectionName = ManagedCollectionName | BackupCollectionName;
type CollectionSnapshot = Partial<Record<CollectionName, any[]>>;

const APP_NAME = 'إدارة مخازن إنارة';
const BACKUP_VERSION = 1;
const BATCH_LIMIT = 400;

export interface BackupPayload {
  version: number;
  source: string;
  exportedAt: string;
  exportedBy: string;
  includedCollections: BackupCollectionName[];
  app: {
    name: string;
    projectId: string;
  };
  collections: Partial<Record<BackupCollectionName, any[]>>;
}

interface PendingOperation {
  kind: 'set' | 'delete';
  collectionName: string;
  id: string;
  data?: Record<string, any>;
}

function getSafeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeDocument(entry: unknown, fallbackId: string) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('الملف يحتوي على عنصر غير صالح داخل البيانات.');
  }

  const candidate = entry as Record<string, any>;
  const id = String(candidate.id ?? fallbackId);

  return {
    id,
    data: {
      ...candidate,
      id,
    },
  };
}

async function readCollectionData(database: Firestore, collectionName: string) {
  const snapshot = await getDocs(collection(database, collectionName));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

async function commitOperations(database: Firestore, operations: PendingOperation[]) {
  for (let index = 0; index < operations.length; index += BATCH_LIMIT) {
    const batch = writeBatch(database);
    const slice = operations.slice(index, index + BATCH_LIMIT);

    slice.forEach((operation) => {
      const ref = doc(database, operation.collectionName, operation.id);
      if (operation.kind === 'delete') {
        batch.delete(ref);
        return;
      }
      batch.set(ref, operation.data ?? {});
    });

    await batch.commit();
  }
}

export function buildBackupPayload(
  collectionsData: Partial<Record<BackupCollectionName, any[]>>,
  exportedBy = 'النظام',
): BackupPayload {
  const collections: Partial<Record<BackupCollectionName, any[]>> = {};

  BACKUP_COLLECTIONS.forEach((collectionName) => {
    collections[collectionName] = getSafeArray(collectionsData[collectionName]).map((entry) => ({ ...entry }));
  });

  return {
    version: BACKUP_VERSION,
    source: 'enara-lighting-inventory',
    exportedAt: new Date().toISOString(),
    exportedBy,
    includedCollections: [...BACKUP_COLLECTIONS],
    app: {
      name: APP_NAME,
      projectId: firebaseConfig.projectId,
    },
    collections,
  };
}

export async function createFullBackupPayload(database: Firestore, exportedBy = 'النظام') {
  const entries = await Promise.all(
    BACKUP_COLLECTIONS.map(async (collectionName) => {
      const docs = await readCollectionData(database, collectionName);
      return [collectionName, docs] as const;
    }),
  );

  const collectionsData = Object.fromEntries(entries) as Partial<Record<BackupCollectionName, any[]>>;
  return buildBackupPayload(collectionsData, exportedBy);
}

export function downloadBackupJson(payload: BackupPayload) {
  const dateToken = payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  const fileName = `enara-backup-${dateToken}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseBackupJson(rawText: string): BackupPayload {
  let parsed: any;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('تعذر قراءة ملف JSON. تأكد من أن الملف صالح.');
  }

  const rawCollections =
    parsed && typeof parsed === 'object' && parsed.collections && typeof parsed.collections === 'object'
      ? parsed.collections
      : parsed;

  const detectedCollections = BACKUP_COLLECTIONS.filter((collectionName) =>
    Object.prototype.hasOwnProperty.call(rawCollections, collectionName),
  );

  if (detectedCollections.length === 0) {
    throw new Error('ملف النسخة الاحتياطية لا يحتوي على أي مجموعات بيانات معروفة.');
  }

  const collections: Partial<Record<BackupCollectionName, any[]>> = {};
  detectedCollections.forEach((collectionName) => {
    collections[collectionName] = getSafeArray(rawCollections[collectionName]);
  });

  return {
    version: Number(parsed?.version || BACKUP_VERSION),
    source: typeof parsed?.source === 'string' ? parsed.source : 'external-json',
    exportedAt: typeof parsed?.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    exportedBy: typeof parsed?.exportedBy === 'string' ? parsed.exportedBy : 'نسخة مستوردة',
    includedCollections: detectedCollections,
    app: {
      name: typeof parsed?.app?.name === 'string' ? parsed.app.name : APP_NAME,
      projectId: typeof parsed?.app?.projectId === 'string' ? parsed.app.projectId : firebaseConfig.projectId,
    },
    collections,
  };
}

async function applyCollectionsSnapshot(
  database: Firestore,
  collectionsData: CollectionSnapshot,
  collectionNames: readonly string[],
) {
  const operations: PendingOperation[] = [];
  let setCount = 0;
  let deleteCount = 0;

  for (const collectionName of collectionNames) {
    const incomingDocs = getSafeArray(collectionsData[collectionName as CollectionName]);
    const normalizedDocs = incomingDocs.map((entry, index) =>
      normalizeDocument(entry, `${collectionName}-${Date.now()}-${index}`),
    );
    const nextIds = new Set(normalizedDocs.map((entry) => entry.id));
    const existingSnapshot = await getDocs(collection(database, collectionName));

    existingSnapshot.docs.forEach((existingDoc) => {
      if (!nextIds.has(existingDoc.id)) {
        operations.push({
          kind: 'delete',
          collectionName,
          id: existingDoc.id,
        });
        deleteCount += 1;
      }
    });

    normalizedDocs.forEach((entry) => {
      operations.push({
        kind: 'set',
        collectionName,
        id: entry.id,
        data: entry.data,
      });
      setCount += 1;
    });
  }

  await commitOperations(database, operations);

  return {
    collectionCount: collectionNames.length,
    setCount,
    deleteCount,
  };
}

export async function importBackupToFirestore(database: Firestore, payload: BackupPayload) {
  return applyCollectionsSnapshot(database, payload.collections, payload.includedCollections);
}

export async function syncManagedCollections(
  database: Firestore,
  collectionsData: Partial<Record<ManagedCollectionName, any[]>>,
) {
  return applyCollectionsSnapshot(database, collectionsData, MANAGED_COLLECTIONS);
}
