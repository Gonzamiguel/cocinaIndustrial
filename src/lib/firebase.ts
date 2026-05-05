/**
 * Firebase Web SDK — config de la app web (Firestore para menú y pedidos).
 *
 * Colecciones esperadas:
 * - menu: { nombre, categoria: 'principal' | 'guarnicion', stock: number }
 * - pedidos: { nombreCliente, lugarEntrega, platoPrincipal, guarnicion, fecha, timestamp?, estado }
 *
 * Nota: la apiKey en cliente es pública por diseño; restringe dominios en la consola Firebase.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAnalytics, type Analytics } from 'firebase/analytics'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyC9jbTpOufQ43STX4wCq-AraTpgEQKTZBc',
  authDomain: 'comedor-industrial-70169.firebaseapp.com',
  projectId: 'comedor-industrial-70169',
  storageBucket: 'comedor-industrial-70169.firebasestorage.app',
  messagingSenderId: '200740887115',
  appId: '1:200740887115:web:99df06c8f26456ee674bce',
  measurementId: 'G-5KQDD37BD0',
}

const app: FirebaseApp = initializeApp(firebaseConfig)

/** Solo en navegador (evita problemas si el módulo se evalúa fuera del cliente). */
export const analytics: Analytics | undefined =
  typeof window !== 'undefined' ? getAnalytics(app) : undefined

let db: Firestore | undefined

export function getFirebaseApp(): FirebaseApp {
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(app)
  }
  return db
}
