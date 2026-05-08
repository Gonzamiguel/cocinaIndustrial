import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastVariant = 'success' | 'error' | 'info'

type ToastState = {
  id: number
  message: string
  variant: ToastVariant
} | null

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS = 4200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    idRef.current += 1
    const id = idRef.current
    setToast({ id, message, variant })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t))
    }, DURATION_MS)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  const bg =
    toast?.variant === 'error'
      ? 'bg-red-900 text-white'
      : toast?.variant === 'info'
        ? 'bg-[#003366] text-white'
        : 'bg-[#F39200] text-white'

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[200] max-w-[min(90vw,28rem)] -translate-x-1/2 rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg ${bg}`}
        >
          {toast.message}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de ToastProvider')
  }
  return ctx
}
