# Asset-based seeding (client-side)

Realm Forge can seed Firestore content from JSON files bundled in `src/assets/seed/`. The seeding runs client-side only **after** an Admin user logs in.

## Adding seed files

1. Place JSON files in `src/assets/seed/`.
2. Update `src/assets/seed/seed-manifest.json`:
   ```json
   {
     "enabled": true,
     "files": [
       { "path": "seed/bestiary.json", "type": "bestiary" },
       { "path": "seed/tutorial-dungeon.json", "type": "adventure" }
     ]
   }
   ```
3. The app will load each entry from `/assets/<path>` at runtime.

## Admin claim requirement

Seeding only occurs for authenticated users with the custom claim `admin === true`. Non-admin users never attempt writes and will not see notifications.

## Collections written

When seeding is enabled and the user is an Admin, the app upserts:

- `monsters/{monsterId}` from bestiary files.
- `adventures/{adventureId}` from adventure files.
- `adventures/{adventureId}/nodes/{nodeId}` for each node in an adventure.
- `system/seedState` for idempotency tracking.

## Idempotency and `system/seedState`

The client computes a SHA-256 hash for each JSON file and stores it in `system/seedState`:

```json
{
  "lastSeedAt": "<server timestamp>",
  "fileStates": {
    "seed/bestiary.json": {
      "hash": "<sha256>",
      "seededAt": "<server timestamp>"
    }
  }
}
```

If the stored hash matches the file’s current hash, the file is skipped on the next launch.

## Notes

- Use `manifest.enabled` to turn seeding on/off without removing files.
- Adventure files may include a `monsters` array, but it is ignored during seeding (monsters are canonical in the `monsters` collection).
- Batch writes are capped at 400 operations per batch.
