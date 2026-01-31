import admin from 'firebase-admin';

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

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run set-admin -- <ADMIN_EMAIL>');
    process.exit(1);
  }

  initializeAdmin();
  const auth = admin.auth();

  try {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, { admin: true });
    console.log(`Set admin claim for ${email} (uid: ${user.uid}).`);
  } catch (error: unknown) {
    if (error instanceof Error && (error as { code?: string }).code === 'auth/user-not-found') {
      console.error(`User not found for email: ${email}`);
      process.exit(1);
    }

    console.error('Failed to set admin claim:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Failed to set admin claim:', error);
  process.exit(1);
});
