import { useEffect } from 'react'
import { ToastDot } from '@/components/BrandToaster'
import { toastCard, toastStyle } from '@/lib/ui'

export type ToastMessage = { message: string; type: 'success' | 'error' | 'info' }

/**
 * The orders page's own toast, also used by Settings. Same card as sonner's
 * (see BrandToaster), held in local state so a handler can just set it.
 */
export default function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${toastCard}`} style={toastStyle} role="status">
      <ToastDot type={type} />
      {message}
    </div>
  )
}
