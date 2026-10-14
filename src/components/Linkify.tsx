import { Fragment } from 'react'

/**
 * Plain text with any web address in it made clickable (opens a new tab).
 * Used for comments, where someone pastes a results page or a Drive link.
 * Only http(s) and www. addresses, so nothing else in the text changes.
 */
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
// A sentence's closing punctuation belongs to the sentence, not the link.
const TRAILING = /[).,;:!?'"\]]+$/

export default function Linkify({ text, className = 'underline underline-offset-2 break-all hover:opacity-80' }: { text: string; className?: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
        const tail = part.match(TRAILING)?.[0] || ''
        const url = tail ? part.slice(0, -tail.length) : part
        const href = url.startsWith('http') ? url : `https://${url}`
        return (
          <Fragment key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={e => e.stopPropagation()}>{url}</a>
            {tail}
          </Fragment>
        )
      })}
    </>
  )
}
