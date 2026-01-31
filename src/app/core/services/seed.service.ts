import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth, getIdTokenResult, onAuthStateChanged, User } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  DocumentReference,
  SetOptions,
  Firestore
} from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { AUTH, FIRESTORE } from '../../firebase.tokens';

const MAX_BATCH_OPS = 400;

type SeedManifest = {
  enabled: boolean;
  files: SeedFileEntry[];
};

type SeedFileEntry = {
  path: string;
  type: 'bestiary' | 'adventure';
};

type SeedState = {
  fileStates?: Record<string, { hash?: string }>;
};

type SeedWrite = {
  ref: DocumentReference;
  data: Record<string, unknown>;
  options?: SetOptions;
};

@Injectable({
  providedIn: 'root'
})
export class SeedService {
  private http = inject(HttpClient);
  private auth = inject(AUTH);
  private firestore = inject(FIRESTORE);
  private snackBar = inject(MatSnackBar, { optional: true });

  async maybeSeedFromAssets(): Promise<void> {
    try {
      const manifest = await this.fetchManifest();
      if (!manifest.enabled) {
        return;
      }

      const user = await this.waitForAuthReady(this.auth);
      if (!user) {
        return;
      }

      const token = await getIdTokenResult(user);
      if (token.claims?.['admin'] !== true) {
        return;
      }

      this.showSnack('Seeding content from assets...');

      const seedStateRef = doc(this.firestore, 'system', 'seedState');
      const seedStateSnapshot = await getDoc(seedStateRef);
      const seedState = (seedStateSnapshot.data() as SeedState | undefined) ?? {};
      const fileStates = seedState.fileStates ?? {};

      let seededFiles = 0;
      let skippedFiles = 0;
      let totalWrites = 0;

      for (const file of manifest.files) {
        try {
          const json = await this.fetchSeedFile(file.path);
          const hash = await this.hashJson(json);
          const previousHash = fileStates[file.path]?.hash;
          if (previousHash && previousHash === hash) {
            skippedFiles += 1;
            continue;
          }

          const writes = await this.seedFile(file, json);
          totalWrites += writes;
          seededFiles += 1;

          await setDoc(
            seedStateRef,
            {
              lastSeedAt: serverTimestamp(),
              fileStates: {
                [file.path]: {
                  hash,
                  seededAt: serverTimestamp()
                }
              }
            },
            { merge: true }
          );
        } catch (error) {
          console.error(`[SeedService] Failed to seed ${file.path}`, error);
          this.showSnack('Seeding failed');
        }
      }

      console.log(
        `[SeedService] Seeded files: ${seededFiles}, skipped files: ${skippedFiles}, total docs written: ${totalWrites}`
      );

      this.showSnack('Seeding complete');
    } catch (error) {
      console.error('[SeedService] Seeding error', error);
      this.showSnack('Seeding failed');
    }
  }

  private async fetchManifest(): Promise<SeedManifest> {
    try {
      return await firstValueFrom(this.http.get<SeedManifest>('assets/seed/seed-manifest.json'));
    } catch (error) {
      console.error('[SeedService] Failed to load seed manifest', error);
      return { enabled: false, files: [] };
    }
  }

  private async waitForAuthReady(auth: Auth): Promise<User | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  private async fetchSeedFile(path: string): Promise<unknown> {
    return firstValueFrom(this.http.get<unknown>(`assets/${path}`));
  }

  private async seedFile(file: SeedFileEntry, json: unknown): Promise<number> {
    if (file.type === 'bestiary') {
      return this.seedBestiary(json);
    }

    if (file.type === 'adventure') {
      return this.seedAdventure(json);
    }

    throw new Error(`Unsupported seed file type: ${file.type}`);
  }

  private async seedBestiary(json: unknown): Promise<number> {
    if (!Array.isArray(json)) {
      throw new Error('Bestiary JSON should be an array of monsters');
    }

    const operations: SeedWrite[] = [];

    for (const monster of json) {
      if (!this.isRecord(monster)) {
        console.warn('[SeedService] Skipping monster with missing id', monster);
        continue;
      }

      const monsterId = this.getString(monster, 'id');
      if (!monsterId) {
        console.warn('[SeedService] Skipping monster with missing id', monster);
        continue;
      }

      const docRef = doc(this.firestore, 'monsters', monsterId);
      operations.push({ ref: docRef, data: monster, options: { merge: true } });
    }

    return this.commitBatches(operations, this.firestore);
  }

  private async seedAdventure(json: unknown): Promise<number> {
    if (!this.isRecord(json)) {
      throw new Error('Adventure JSON should be an object');
    }

    const adventureData = json;
    const adventureId = this.computeAdventureId(adventureData, 'tutorial-dungeon');
    const operations: SeedWrite[] = [];

    const title = this.getString(adventureData, 'title') ?? this.getString(adventureData, 'name') ?? adventureId;
    const name = this.getString(adventureData, 'name') ?? this.getString(adventureData, 'title') ?? adventureId;
    const version = this.getNumber(adventureData, 'version') ?? 1;
    const published = this.getBoolean(adventureData, 'published') ?? true;

    const adventureDoc: Record<string, unknown> = {
      title,
      name,
      version,
      published
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

    const nodesRaw = this.getArray(adventureData, 'nodes') ?? [];
    const nodes = nodesRaw.filter((node) => this.isRecord(node));
    for (const node of nodes) {
      const nodeId = this.getString(node, 'nodeId');
      if (!nodeId) {
        console.warn('[SeedService] Skipping node with missing nodeId', node);
        continue;
      }

      const nodeRef = doc(this.firestore, 'adventures', adventureId, 'nodes', nodeId);
      operations.push({ ref: nodeRef, data: node, options: { merge: true } });
    }

    return this.commitBatches(operations, this.firestore);
  }

  private async commitBatches(
    operations: SeedWrite[],
    firestore: Firestore
  ): Promise<number> {
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

  private computeAdventureId(adventureData: Record<string, unknown>, fallback: string): string {
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

  private async hashJson(json: unknown): Promise<string> {
    const data = new TextEncoder().encode(JSON.stringify(json));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getString(obj: Record<string, unknown>, key: string): string | undefined {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    return undefined;
  }

  private getBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
    const value = obj[key];
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private getNumber(obj: Record<string, unknown>, key: string): number | undefined {
    const value = obj[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
    return undefined;
  }

  private getArray(obj: Record<string, unknown>, key: string): unknown[] | undefined {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value;
    }
    return undefined;
  }

  private showSnack(message: string): void {
    if (this.snackBar) {
      this.snackBar.open(message, 'Close', { duration: 3000 });
    }
  }
}
