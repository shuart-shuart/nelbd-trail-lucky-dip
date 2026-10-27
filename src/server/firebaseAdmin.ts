import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

// Supply a service account as a Render secret (JSON string), or use workload identity.
// Never commit credentials. The service fails closed when credentials are unavailable.
const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const app = getApps()[0] || initializeApp({
  credential: credentials ? cert(JSON.parse(credentials)) : applicationDefault(),
  projectId: firebaseConfig.projectId,
});
export const adminAuth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export async function requireStaff(idToken: string): Promise<string> {
  if (!idToken) throw new Error('AUTH_REQUIRED');
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  if (decoded.firebase?.sign_in_provider !== 'google.com' || !decoded.email_verified) {
    throw new Error('STAFF_REQUIRED');
  }
  // Bootstrap account or explicitly registered admin. Never trust client-supplied role.
  if (decoded.email?.toLowerCase() === 'work@anotherunit.xyz') return decoded.uid;
  const admin = await db.doc(`admins/${decoded.uid}`).get();
  if (!admin.exists || admin.data()?.email?.toLowerCase() !== decoded.email?.toLowerCase()) {
    throw new Error('STAFF_REQUIRED');
  }
  return decoded.uid;
}
