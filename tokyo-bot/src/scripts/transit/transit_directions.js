import axios from 'axios';
import { normalizeGoogleResponse } from './normalize.js';

/**
 * Convierte una fecha ISO con timezone a Unix timestamp (segundos)
 * @param {string} isoString - ISO 8601 string (e.g., "2026-03-28T07:30:00+09:00")
 * @returns {number} Unix timestamp en segundos
 */
function isoToUnixTimestamp(isoString) {
  const date = new Date(isoString);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Construye la URL de origen/destino para Google Directions API
 * @param {Object} location - { label, lat, lng }
 * @returns {string}
 */
function buildLocationString(location) {
  if (location.lat && location.lng) {
    return `${location.lat},${location.lng}`;
  }
  return location.label;
}

/**
 * Llama a Google Directions API y normaliza la respuesta
 * @param {Object} queryInput - TransitQueryInput
 * @param {Object} options - Opciones adicionales
 * @param {string} options.apiKey - Google Maps API Key
 * @param {string} [options.language='en'] - Idioma para respuestas
 * @param {string} [options.region='jp'] - Región
 * @returns {Promise<Object>} TransitPlan
 */
export async function getTransitDirections(queryInput, options = {}) {
  const {
    apiKey = process.env.GOOGLE_MAPS_API_KEY,
    language = process.env.TRANSIT_LANGUAGE || 'en',
    region = process.env.TRANSIT_REGION || 'jp'
  } = options;

  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is required');
  }

  const origin = buildLocationString(queryInput.origin);
  const destination = buildLocationString(queryInput.destination);
  const departureTime = isoToUnixTimestamp(queryInput.departure.iso);

  const params = new URLSearchParams({
    origin,
    destination,
    mode: 'transit',
    departure_time: departureTime.toString(),
    alternatives: 'true',
    region,
    language,
    key: apiKey
  });

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  try {
    const response = await axios.get(url, {
      timeout: 10000 // 10 segundos timeout
    });

    if (response.data.status === 'OVER_QUERY_LIMIT') {
      throw new Error('OVER_QUERY_LIMIT: Google API quota exceeded');
    }

    if (response.data.status === 'REQUEST_DENIED') {
      throw new Error(`REQUEST_DENIED: ${response.data.error_message || 'Invalid API key or permissions'}`);
    }

    return normalizeGoogleResponse(response.data, queryInput);
  } catch (error) {
    if (error.response) {
      // Error de respuesta HTTP
      throw new Error(`Google Directions API error: ${error.response.status} - ${error.response.statusText}`);
    }
    if (error.request) {
      // Timeout o error de red
      throw new Error('Network error: Could not reach Google Directions API');
    }
    // Error lanzado por nosotros
    throw error;
  }
}
