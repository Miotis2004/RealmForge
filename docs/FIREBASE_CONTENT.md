# Firebase Content Model for Realm Forge

## Data model

Firestore uses the following canonical collections:

- `monsters/{monsterId}`
  - `monsterId` comes from each monster's `id`.
- `adventures/{adventureId}`
  - `adventureId` comes from `adventure.adventureId` when available, otherwise `tutorial-dungeon`.
- `adventures/{adventureId}/nodes/{nodeId}`
  - `nodeId` comes from each node's `nodeId` field.

Users remain in `users/{uid}` and are not modified by the seed process.

## Set admin claim

Grant the admin claim to the uploader account:

```bash
npm run set-admin -- <ADMIN_EMAIL>
```

This sets the custom claim `{ admin: true }` for the user and prints the uid on success.

## Seed Firestore

Seed the canonical content using the provided JSON sources:

```bash
npm run seed:firestore
```

The seeder reads:

- `/mnt/data/bestiary.json`
- `/mnt/data/tutorial-dungeon.json`

## Expected results

After seeding, Firestore will contain:

- `monsters` collection populated with bestiary monsters.
- `adventures` collection containing the tutorial dungeon document.
- `adventures/{adventureId}/nodes` subcollection populated with adventure nodes.

## Deploy Firestore rules

```bash
firebase deploy --only firestore:rules
```
