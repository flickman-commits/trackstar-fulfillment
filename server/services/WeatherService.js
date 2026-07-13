import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
/**
 * WeatherService - Fetch historical weather data for races
 * Uses Open-Meteo API (free, no API key required)
 *
 * API Docs: https://open-meteo.com/en/docs/historical-weather-api
 */

export class WeatherService {
  constructor() {
    this.geocodingBaseUrl = 'https://geocoding-api.open-meteo.com/v1'
    this.weatherBaseUrl = 'https://archive-api.open-meteo.com/v1'
  }

  /**
   * Get historical weather for a race
   * @param {Date} date - Race date
   * @param {string} location - Location string (e.g., "New York, NY" or "Boston, MA")
   * @returns {Promise<Object>} { temp: "XX°F", condition: "sunny|cloudy|rainy" }
   */
  async getHistoricalWeather(date, location) {
    console.log(`[WeatherService] Fetching weather for ${location} on ${date.toDateString()}`)

    try {
      // Step 1: Geocode location to get lat/long
      const coords = await this.geocodeLocation(location)

      if (!coords) {
        console.log(`[WeatherService] Could not geocode location: ${location}`)
        return { temp: null, condition: null }
      }

      // Step 2: Fetch historical weather
      const weather = await this.fetchHistoricalWeather(date, coords.lat, coords.lon)

      console.log(`[WeatherService] Weather found: ${weather.temp}, ${weather.condition}`)
      return weather

    } catch (error) {
      console.error(`[WeatherService] Error fetching weather:`, error.message)
      return { temp: null, condition: null }
    }
  }

  /**
   * Geocode a location string to lat/long coordinates
   * @param {string} location - Location string
   * @returns {Promise<Object|null>} { lat, lon, name } or null
   */
  async geocodeLocation(location) {
    try {
      // Clean up location - Open-Meteo works better with city names
      // Examples: "New York, NY" -> works, "Kiawah Island, SC" -> works
      const cleanLocation = this.cleanLocationString(location)

      const url = `${this.geocodingBaseUrl}/search?name=${encodeURIComponent(cleanLocation)}&count=1&language=en&format=json`

      console.log(`[WeatherService] Geocoding: ${cleanLocation}`)

      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!data.results || data.results.length === 0) {
        console.log(`[WeatherService] No geocoding results for: ${cleanLocation}`)
        return null
      }

      const result = data.results[0]
      console.log(`[WeatherService] Geocoded to: ${result.name}, ${result.admin1 || ''} (${result.latitude}, ${result.longitude})`)

      return {
        lat: result.latitude,
        lon: result.longitude,
        name: result.name
      }

    } catch (error) {
      console.error(`[WeatherService] Geocoding error:`, error.message)
      return null
    }
  }

  /**
   * Clean location string for better geocoding results
   * @param {string} location - Raw location string
   * @returns {string} Cleaned location
   */
  cleanLocationString(location) {
    if (!location) return ''

    // Remove state codes and common suffixes
    // "New York, NY" -> "New York"
    // "Kiawah Island, SC" -> "Kiawah Island"
    let cleaned = location
      .replace(/,\s*[A-Z]{2}$/i, '') // Remove state codes like ", NY", ", SC"
      .replace(/\s+Park$/i, '') // "Central Park" -> "Central"
      .replace(/\s+Beach$/i, '') // "Miami Beach" -> "Miami"
      .trim()

    return cleaned
  }

  /**
   * Fetch historical weather data from Open-Meteo
   * @param {Date} date - Date to fetch weather for
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} { temp: "XX°F", condition: "sunny|cloudy|rainy" }
   */
  async fetchHistoricalWeather(date, lat, lon) {
    try {
      // Format date as YYYY-MM-DD
      const dateStr = date.toISOString().split('T')[0]

      // Fetch hourly data so we can get race-start conditions (~7am)
      // Marathons start early morning, so max daily temp is not representative
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        start_date: dateStr,
        end_date: dateStr,
        hourly: 'temperature_2m,weather_code,precipitation',
        temperature_unit: 'fahrenheit',
        timezone: 'auto' // Infer timezone from lat/lon coordinates
      })

      const url = `${this.weatherBaseUrl}/archive?${params.toString()}`

      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!data.hourly || !data.hourly.temperature_2m || data.hourly.temperature_2m.length === 0) {
        console.log(`[WeatherService] No weather data available for ${dateStr}`)
        return { temp: null, condition: null }
      }

      // Pick 7am (index 7) as representative race-start conditions
      // Hourly array runs 00:00 through 23:00, so index 7 = 7:00am local time
      const RACE_START_HOUR = 7
      const temp7am = data.hourly.temperature_2m[RACE_START_HOUR]
      const weatherCode7am = data.hourly.weather_code[RACE_START_HOUR]
      const precipitation7am = data.hourly.precipitation[RACE_START_HOUR]

      console.log(`[WeatherService] 7am conditions: ${temp7am}°F, code=${weatherCode7am}, precip=${precipitation7am}mm`)

      // Format temperature
      const temp = temp7am != null ? `${Math.round(temp7am)}°F` : null

      // Map weather code to simplified condition
      const condition = this.mapWeatherCodeToCondition(weatherCode7am, precipitation7am)

      return { temp, condition }

    } catch (error) {
      console.error(`[WeatherService] Weather API error:`, error.message)
      return { temp: null, condition: null }
    }
  }

  /**
   * Calculate race-window weather for a specific date + location.
   * Temp = average of the hourly temperatures 7am–1pm (local time).
   * Condition = the dominant of {sunny, rainy, cloudy, snowy} over that window
   * (most frequent, ties broken by severity snowy > rainy > cloudy > sunny).
   *
   * @param {string} dateStr - YYYY-MM-DD
   * @param {string} location - City / "City, ST"
   * @returns {Promise<{temp:string|null, condition:string|null, breakdown:object|null}>}
   */
  async calculateRaceWeather(dateStr, location) {
    const coords = await this.geocodeLocation(location)
    if (!coords) {
      return { temp: null, condition: null, breakdown: null, error: `Couldn't find "${location}"` }
    }

    const hourly = await this.fetchHourly(dateStr, coords.lat, coords.lon)
    if (!hourly) {
      return { temp: null, condition: null, breakdown: null, error: 'No weather data for that date' }
    }

    // Window: 7:00 through 13:00 inclusive (indices 7..13 of the 0–23 hourly arrays).
    const START_HOUR = 7
    const END_HOUR = 13
    const hours = []
    let tempSum = 0
    let tempCount = 0
    const counts = { sunny: 0, cloudy: 0, rainy: 0, snowy: 0 }

    for (let h = START_HOUR; h <= END_HOUR; h++) {
      const t = hourly.temperature_2m?.[h]
      const code = hourly.weather_code?.[h]
      const precip = hourly.precipitation?.[h]
      if (t == null || code == null) continue
      const condition = this.mapWeatherCodeTo4(code, precip)
      counts[condition]++
      tempSum += t
      tempCount++
      hours.push({ hour: h, tempF: Math.round(t), condition, code })
    }

    if (tempCount === 0) {
      return { temp: null, condition: null, breakdown: null, error: 'No hourly data in the 7am–1pm window' }
    }

    const avgTempF = Math.round(tempSum / tempCount)
    // Dominant condition: most frequent, ties broken by severity.
    const severity = ['snowy', 'rainy', 'cloudy', 'sunny'] // most → least severe
    const condition = Object.keys(counts)
      .filter(c => counts[c] > 0)
      .sort((a, b) => counts[b] - counts[a] || severity.indexOf(a) - severity.indexOf(b))[0]

    const breakdown = {
      method: 'Average of hourly temps 7am–1pm; dominant condition over the same window.',
      place: coords.name,
      date: dateStr,
      avgTempF,
      condition,
      counts,
      hours,
    }

    return { temp: `${avgTempF}°F`, condition, breakdown }
  }

  /**
   * Fetch the hourly temperature/weather-code/precipitation arrays for a date.
   * Tries the historical archive first; falls back to the forecast API (which
   * covers recent past + near future) if the archive has no data yet.
   * @returns {Promise<object|null>} the `hourly` object, or null
   */
  async fetchHourly(dateStr, lat, lon) {
    const build = (base) => `${base}?` + new URLSearchParams({
      latitude: lat,
      longitude: lon,
      start_date: dateStr,
      end_date: dateStr,
      hourly: 'temperature_2m,weather_code,precipitation',
      temperature_unit: 'fahrenheit',
      timezone: 'auto',
    }).toString()

    for (const base of [`${this.weatherBaseUrl}/archive`, 'https://api.open-meteo.com/v1/forecast']) {
      try {
        const resp = await fetchWithTimeout(build(base))
        const data = await resp.json()
        if (data?.hourly?.temperature_2m?.some(v => v != null)) return data.hourly
      } catch (err) {
        console.warn(`[WeatherService] fetchHourly ${base} failed: ${err.message}`)
      }
    }
    return null
  }

  /**
   * Map an Open-Meteo WMO code to one of four buckets: sunny | cloudy | rainy | snowy.
   * @param {number} code - WMO weather code
   * @param {number} [precipitation] - mm (tiebreaker toward rainy)
   * @returns {'sunny'|'cloudy'|'rainy'|'snowy'}
   */
  mapWeatherCodeTo4(code, precipitation) {
    // Snow: 71/73/75 snowfall, 77 grains, 85/86 snow showers
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowy'
    // Rain / drizzle / freezing / thunderstorm
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rainy'
    if (precipitation && precipitation > 0.5) return 'rainy'
    // Clear / mainly clear / partly cloudy
    if (code === 0 || code === 1 || code === 2) return 'sunny'
    // Overcast (3), fog (45/48), or anything else
    return 'cloudy'
  }

  /**
   * Map Open-Meteo weather code to simplified condition
   * Weather codes: https://open-meteo.com/en/docs
   *
   * Our categories:
   * - "sunny" = Clear, Partly Cloudy
   * - "cloudy" = Overcast, Fog
   * - "rainy" = Any precipitation (rain, drizzle, snow, thunderstorm)
   *
   * @param {number} code - WMO weather code
   * @param {number} precipitation - Precipitation amount in mm
   * @returns {string} "sunny", "cloudy", or "rainy"
   */
  mapWeatherCodeToCondition(code, precipitation) {
    // If significant precipitation, always return rainy
    if (precipitation && precipitation > 0.5) {
      return 'rainy'
    }

    // WMO Weather interpretation codes
    // 0: Clear sky
    if (code === 0) return 'sunny'

    // 1, 2, 3: Mainly clear, partly cloudy, and overcast
    if (code === 1 || code === 2) return 'sunny' // Mainly clear, partly cloudy
    if (code === 3) return 'cloudy' // Overcast

    // 45, 48: Fog
    if (code === 45 || code === 48) return 'cloudy'

    // 51, 53, 55: Drizzle
    if (code >= 51 && code <= 55) return 'rainy'

    // 56, 57: Freezing Drizzle
    if (code === 56 || code === 57) return 'rainy'

    // 61, 63, 65: Rain
    if (code >= 61 && code <= 65) return 'rainy'

    // 66, 67: Freezing Rain
    if (code === 66 || code === 67) return 'rainy'

    // 71, 73, 75: Snow fall
    if (code >= 71 && code <= 75) return 'rainy'

    // 77: Snow grains
    if (code === 77) return 'rainy'

    // 80, 81, 82: Rain showers
    if (code >= 80 && code <= 82) return 'rainy'

    // 85, 86: Snow showers
    if (code === 85 || code === 86) return 'rainy'

    // 95: Thunderstorm
    if (code === 95) return 'rainy'

    // 96, 99: Thunderstorm with hail
    if (code === 96 || code === 99) return 'rainy'

    // Default to cloudy for unknown codes
    console.log(`[WeatherService] Unknown weather code: ${code}, defaulting to cloudy`)
    return 'cloudy'
  }
}

export default WeatherService
