import { Injectable, inject } from '@angular/core';
import { Auth } from 'firebase/auth';
import {
  doc,
  serverTimestamp,
  writeBatch,
  DocumentReference,
  SetOptions,
  Firestore,
  getDoc
} from 'firebase/firestore';
import { AUTH, FIRESTORE } from '../../firebase.tokens';

type JsonObject = Record<string, unknown>;

type ImportWrite = {
  ref: DocumentReference;
  data: JsonObject;
  options?: SetOptions;
};

type ImportResult = {
  kind: 'bestiary' | 'adventure';
  written: number;
  adventureId?: string;
};

const MAX_BATCH_OPS = 400;

@Injectable({
  providedIn: 'root'
})
export class ContentImportService {
  private auth = inject(AUTH);
  private firestore = inject(FIRESTORE);

  async importFromJsonText(jsonText: string): Promise<ImportResult> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Admin privileges required.');
    }

    const profileSnap = await getDoc(doc(this.firestore, 'users', user.uid));
    const profileData = profileSnap.exists() ? (profileSnap.data() as JsonObject) : null;
    if (!this.isAdminValue(profileData?.['isAdmin'])) {
      throw new Error('Admin privileges required.');
    }

    const parsed = JSON.parse(jsonText) as unknown;

    if (Array.isArray(parsed)) {
      const written = await this.importBestiary(parsed);
      return { kind: 'bestiary', written };
    }

    if (this.isRecord(parsed)) {
      const { adventureId, written } = await this.importAdventure(parsed);
      return { kind: 'adventure', written, adventureId };
    }

    throw new Error('Unsupported JSON payload.');
  }

  private async importBestiary(raw: unknown[]): Promise<number> {
    const operations: ImportWrite[] = [];

    for (const monster of raw) {
      if (!this.isRecord(monster)) {
        continue;
      }

      const monsterId = this.getString(monster, 'id');
      if (!monsterId) {
        continue;
      }

      const data: JsonObject = { ...monster, updatedAt: serverTimestamp() };
      const docRef = doc(this.firestore, 'monsters', monsterId);
      operations.push({ ref: docRef, data, options: { merge: true } });
    }

    return this.commitBatches(operations, this.firestore);
  }

  private async importAdventure(adventureData: JsonObject): Promise<{ adventureId: string; written: number }> {
    const adventureId = this.computeAdventureId(adventureData, 'tutorial-dungeon');
    const operations: ImportWrite[] = [];

    const title = this.getString(adventureData, 'title') ?? this.getString(adventureData, 'name') ?? adventureId;
    const name = this.getString(adventureData, 'name') ?? this.getString(adventureData, 'title') ?? adventureId;
    const version = this.getNumber(adventureData, 'version') ?? 1;
    const published = this.getBoolean(adventureData, 'published') ?? true;

    const adventureDoc: JsonObject = {
      adventureId,
      title,
      name,
      version,
      published,
      updatedAt: serverTimestamp()
    };

    const description = this.getString(adventureData, 'description');
    if (description) {
      adventureDoc['description'] = description;
    }

    const startNodeId = this.getString(adventureData, 'startNodeId');
    if (startNodeId) {
      adventureDoc['startNodeId'] = startNodeId;
    }

    const adventureRef = doc(this.firestore, 'adventures', adventureId);
    operations.push({ ref: adventureRef, data: adventureDoc, options: { merge: true } });

    const nodesRaw = adventureData['nodes'];
    const nodes = Array.isArray(nodesRaw) ? nodesRaw : [];
    for (const node of nodes) {
      if (!this.isRecord(node)) {
        continue;
      }

      const nodeId = this.getString(node, 'nodeId');
      if (!nodeId) {
        continue;
      }

      const nodeData: JsonObject = { ...node, updatedAt: serverTimestamp() };
      const nodeRef = doc(this.firestore, 'adventures', adventureId, 'nodes', nodeId);
      operations.push({ ref: nodeRef, data: nodeData, options: { merge: true } });
    }

    const written = await this.commitBatches(operations, this.firestore);
    return { adventureId, written };
  }

  private async commitBatches(operations: ImportWrite[], firestore: Firestore): Promise<number> {
    let batch = writeBatch(firestore);
    let opCount = 0;
    let totalWrites = 0;

    for (const operation of operations) {
      if (opCount >= MAX_BATCH_OPS) {
        await batch.commit();
        totalWrites += opCount;
        batch = writeBatch(firestore);
        opCount = 0;
      }

      batch.set(operation.ref, operation.data, operation.options ?? { merge: true });
      opCount += 1;
    }

    if (opCount > 0) {
      await batch.commit();
      totalWrites += opCount;
    }

    return totalWrites;
  }

  private computeAdventureId(adventureData: JsonObject, fallback: string): string {
    const adventureId = this.getString(adventureData, 'adventureId');
    if (adventureId) {
      return adventureId;
    }

    const id = this.getString(adventureData, 'id');
    if (id) {
      return id;
    }

    const rawTitle = this.getString(adventureData, 'title') ?? this.getString(adventureData, 'name') ?? '';
    const slug = this.slugify(rawTitle);
    return slug || fallback;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private isRecord(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getString(obj: JsonObject, key: string): string | undefined {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    return undefined;
  }

  private getBoolean(obj: JsonObject, key: string): boolean | undefined {
    const value = obj[key];
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private getNumber(obj: JsonObject, key: string): number | undefined {
    const value = obj[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
    return undefined;
  }

  private isAdminValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return false;
  }
}
