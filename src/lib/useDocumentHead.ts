/**
 * Per-route <title>, description, Open Graph and robots tags.
 *
 * The app has no head management — every route inherits "Trackstar Fulfillment"
 * and the fulfillment-dashboard OG description from index.html. That's fine for
 * an internal tool and wrong for a page Matt texts to a race director, where the
 * link preview is the first thing they see.
 *
 * Tags created here are removed on unmount so a route never leaks its head into
 * the next one. Tags that already exist in index.html are restored to their
 * original values rather than deleted.
 */
import { useEffect } from 'react'

interface Options {
  title: string
  description?: string
  ogImage?: string
  /** Adds robots noindex,nofollow — for unlisted pages that are shared by link. */
  noindex?: boolean
}

type Restore = () => void

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string): Restore {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (el) {
    const previous = el.getAttribute('content')
    el.setAttribute('content', value)
    return () => {
      if (previous == null) el!.removeAttribute('content')
      else el!.setAttribute('content', previous)
    }
  }

  el = document.createElement('meta')
  el.setAttribute(attr, key)
  el.setAttribute('content', value)
  document.head.appendChild(el)
  return () => el!.remove()
}

export function useDocumentHead({ title, description, ogImage, noindex }: Options) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const restores: Restore[] = [
      setMeta('meta[property="og:title"]', 'property', 'og:title', title),
      setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title),
      setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image'),
    ]

    if (description) {
      restores.push(
        setMeta('meta[name="description"]', 'name', 'description', description),
        setMeta('meta[property="og:description"]', 'property', 'og:description', description),
        setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description),
      )
    }

    if (ogImage) {
      restores.push(setMeta('meta[property="og:image"]', 'property', 'og:image', ogImage))
    }

    if (noindex) {
      restores.push(setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow'))
    }

    return () => {
      document.title = previousTitle
      restores.forEach((restore) => restore())
    }
  }, [title, description, ogImage, noindex])
}
