import { signInAnonymously } from 'firebase/auth'
import { getAuthApp } from './firebase'

/**
 * La vista pública del menú necesita un usuario autenticado (anónimo) para cumplir reglas de Firestore.
 * Habilitá "Anonymous" en Firebase Console → Authentication → Sign-in method.
 */
export async function ensureSesionClienteAnonima(): Promise<void> {
  const auth = getAuthApp()
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
}
