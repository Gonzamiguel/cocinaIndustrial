import { signInAnonymously, signOut } from 'firebase/auth'
import { getAuthApp } from './firebase'

/**
 * Sesión para el formulario público de pedidos (`/pedido/:token`).
 * Empleados entran sin cuenta: auth anónimo de Firebase.
 * Habilitá "Anonymous" en Firebase Console → Authentication → Sign-in method.
 */
export async function ensureSesionFormularioPedido(): Promise<void> {
  const auth = getAuthApp()
  if (auth.currentUser?.isAnonymous) return

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    // Staff logueado probando el link: puede leer plan PUBLICADA con su rol.
    return
  }

  try {
    await signInAnonymously(auth)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
      throw new Error(
        'El acceso anónimo no está habilitado en Firebase. Activá "Anónimo" en Authentication → Sign-in method.',
      )
    }
    throw err
  }
}

/** @deprecated Usar ensureSesionFormularioPedido */
export async function ensureSesionClienteAnonima(): Promise<void> {
  return ensureSesionFormularioPedido()
}

/** Cierra sesión staff y abre sesión anónima (vista previa real del empleado). */
export async function reiniciarSesionAnonimaFormularioPedido(): Promise<void> {
  const auth = getAuthApp()
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    await signOut(auth)
  }
  await signInAnonymously(auth)
}
