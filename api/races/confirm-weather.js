/**
 * POST /api/races/confirm-weather { raceId }
 *
 * A team member checked a race year's calculated weather (the hourly
 * breakdown behind it) and confirms it for printing. Prints only render with
 * confirmed weather; any change to the weather clears the confirmation.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { loadActiveUser } from '../_lib/users.js'
import { confirmWeather } from '../../server/domain/races/verification.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const user = await loadActiveUser(actor)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const race = await confirmWeather({ raceId: body.raceId, user })
    return res.status(200).json({ ok: true, weatherConfirmedAt: race.weatherConfirmedAt, weatherConfirmedBy: race.weatherConfirmedBy })
  } catch (error) {
    if (/not found|no weather|not happened/i.test(error.message)) return res.status(400).json({ error: error.message })
    console.error('[API /races/confirm-weather]', error)
    return res.status(500).json({ error: 'Could not confirm the weather' })
  }
}
