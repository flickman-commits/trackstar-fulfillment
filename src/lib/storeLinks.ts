/**
 * A store link in a macro, tagged so Shopify's reports show the sale came
 * from support, and from which channel: an Instagram DM or an email. Only
 * the shop's own pages (trackstar.art, not this tool on fast.) and only
 * links that carry no UTM yet.
 */
export function tagStoreLinks(text: string, channel: string | undefined): string {
  const source = channel === 'instagram' ? 'instagram' : 'email'
  const medium = channel === 'instagram' ? 'dm' : 'support_email'
  return text.replace(/https?:\/\/(?:www\.)?trackstar\.art(?:\/[^\s)\]]*)?/gi, url => {
    if (/[?&]utm_/i.test(url)) return url
    const trail = url.match(/[.,!?:;]+$/)?.[0] || ''
    const bare = trail ? url.slice(0, -trail.length) : url
    const [path, hash = ''] = bare.split('#')
    const tagged = `${path}${path.includes('?') ? '&' : '?'}utm_source=${source}&utm_medium=${medium}&utm_campaign=customer_support`
    return `${tagged}${hash ? `#${hash}` : ''}${trail}`
  })
}

