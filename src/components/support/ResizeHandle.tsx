import { useEffect, useRef, useState } from 'react'

/**
 * A column divider you can drag. Sits on the boundary between two columns,
 * shows a thin line on hover, and reports how far it moved. Double-click
 * puts the column back to its default width.
 */
export default function ResizeHandle({ onDrag, onReset, title = 'Drag to resize. Double-click to reset.' }: { onDrag: (dx: number) => void; onReset: () => void; title?: string }) {
  const [dragging, setDragging] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => { const dx = e.clientX - last.current; last.current = e.clientX; if (dx) onDrag(dx) }
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    // No text selection or I-beam cursor while dragging across the page.
    const prev = document.body.style.cursor
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = prev
      document.body.style.userSelect = ''
    }
  }, [dragging, onDrag])
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onPointerDown={e => { e.preventDefault(); last.current = e.clientX; setDragging(true) }}
      onDoubleClick={onReset}
      className="hidden lg:block relative w-0 shrink-0 z-10 cursor-col-resize group"
    >
      <span className={`absolute inset-y-0 -left-[3px] w-[7px] transition-colors ${dragging ? 'bg-[#4600D6]/30' : 'group-hover:bg-off-black/10'}`} />
    </div>
  )
}
