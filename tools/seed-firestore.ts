import { readFile } from 'fs/promises';
import admin from 'firebase-admin';

type MonsterRecord = {
  id: string;
  [key: string]: unknown;
};

type AdventureRecord = {
  adventureId?: string;
  title?: string;
  name?: string;
  description?: string;
  startNodeId?: string;
  nodes?: Array<{ nodeId: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

const BESTIARY_PATH = '/mnt/data/bestiary.json';
const ADVENTURE_PATH = '/mnt/data/tutorial-dungeon.json';
const BATCH_LIMIT = 400;

function initializeAdmin(): void {
  if (admin.apps.length > 0) {
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (error) {
    console.error(
      'Failed to initialize Firebase Admin SDK with application default credentials. ' +
        'Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON or run in an environment with default credentials.',
      error,
    );
    process.exit(1);
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  initializeAdmin();
  const db = admin.firestore();

  const [bestiaryData, adventureData] = await Promise.all([
    readJsonFile<MonsterRecord[] | { monsters?: MonsterRecord[] }>(BESTIARY_PATH),
    readJsonFile<AdventureRecord>(ADVENTURE_PATH),
  ]);

  const monsters = Array.isArray(bestiaryData)
    ? bestiaryData
    : bestiaryData.monsters ?? [];

  if (monsters.length === 0) {
    console.warn('No monsters found to seed.');
  }

  let batch = db.batch();
  let batchCount = 0;
  let monsterCount = 0;

  for (const monster of monsters) {
    if (!monster?.id) {
      console.warn('Skipping monster without id:', monster);
      continue;
    }
    const monsterRef = db.collection('monsters').doc(monster.id);
    batch.set(monsterRef, monster, { merge: true });
    batchCount += 1;
    monsterCount += 1;

    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  const adventureId = adventureData.adventureId ?? 'tutorial-dungeon';
  const adventureTitle = adventureData.title ?? adventureData.name ?? 'Tutorial Dungeon';
  const adventureDoc = {
    title: adventureTitle,
    description: adventureData.description ?? '',
    startNodeId: adventureData.startNodeId ?? '',
    version: 1,
    published: true,
  };

  const adventureRef = db.collection('adventures').doc(adventureId);
  batch.set(adventureRef, adventureDoc, { merge: true });
  batchCount += 1;

  const nodes = adventureData.nodes ?? [];
  let nodeCount = 0;
  for (const node of nodes) {
    if (!node?.nodeId) {
      console.warn('Skipping node without nodeId:', node);
      continue;
    }
    const nodeRef = adventureRef.collection('nodes').doc(node.nodeId);
    batch.set(nodeRef, node, { merge: true });
    batchCount += 1;
    nodeCount += 1;

    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Seeded ${monsterCount} monsters.`);
  console.log(`Seeded adventure ${adventureId} with ${nodeCount} nodes.`);
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
