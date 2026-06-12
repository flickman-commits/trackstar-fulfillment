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
