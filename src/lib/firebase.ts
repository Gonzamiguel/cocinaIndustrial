/**
 * Firebase Web SDK — config de la app web (Firestore para menú y pedidos).
 *
 * Colecciones esperadas:
 * - menu: { nombre, categoria: 'principal' | 'guarnicion', stock: number }
 * - pedidos: { ... }
 * - recetario: biblioteca documental de fichas técnicas para admin cocina
 * - categorias: rubros y subrubros dinámicos para el catálogo de insumos
 * - solicitudes_mercaderia: cocina → depósito (fechaCreacion, items, estado, etc.)
 * - insumos: catálogo depósito (nombre genérico, marca, rubro, subrubro, presentación, costo por unidad base)
 * - movimientos_inventario: ingresos, egresos, ajustes y decomisos (trazabilidad HACCP; opcional precio en ingresos)
 * - saldo_lotes: cantidades por ubicación / insumo / lote para validación atómica en egresos
 * - usuarios: { rol: UserRole (7 roles SoD), ubicacionId?: string } (doc id = UID de Auth)
 * - padron_personas, camas, historial_pernoctes: módulo hotelería / campamento (camas, padrón y pernoctes)
 * - registros_comedor: acceso al comedor (`control_comedor` en terminal; incluye diaOperativo YYYY-MM-DD)
 *
 * Nota: la apiKey en cliente es pública por diseño; restringe dominios en la consola Firebase.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAnalytics, type Analytics } from 'firebase/analytics'
import { getAuth, type Auth } from 'firebase/auth'
import {
  enableIndexedDbPersistence,
  getFirestore,
  type Firestore,
  type FirestoreError,
} from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

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

let auth: Auth | undefined
let storage: FirebaseStorage | undefined

/** Instancia única; la persistencia debe activarse antes de cualquier otra operación. */
const db: Firestore = getFirestore(app)

if (typeof window !== 'undefined') {
  void enableIndexedDbPersistence(db).catch((err: unknown) => {
    const code = (err as FirestoreError)?.code
    if (code === 'failed-precondition') {
      console.warn(
        '[Firestore] Persistencia offline: otra pestaña ya usa la base local. ' +
          'Usá una sola pestaña o cerrá las demás para habilitar caché en esta.',
      )
    } else if (code === 'unimplemented') {
      console.warn(
        '[Firestore] Este navegador no soporta persistencia IndexedDB; la app funciona sin caché local.',
      )
    } else {
      console.warn('[Firestore] No se pudo activar persistencia IndexedDB:', err)
    }
  })
}

export function getFirebaseApp(): FirebaseApp {
  return app
}

export function getAuthApp(): Auth {
  if (!auth) {
    auth = getAuth(app)
  }
  return auth
}

export function getDb(): Firestore {
  return db
}

export function getStorageApp(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(app)
  }
  return storage
}
