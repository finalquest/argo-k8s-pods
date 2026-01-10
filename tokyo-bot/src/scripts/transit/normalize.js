/**
 * Normaliza la respuesta de Google Directions API a nuestro formato TransitPlan
 */

/**
 * Extrae información de reserva de un leg de tránsito
 * @param {Object} leg - Leg de la respuesta de Google Directions API
 * @returns {Object} ReservationInfo
 */
function extractReservationInfo(leg) {
  const transitDetails = leg.transit_details;
  if (!transitDetails) {
    return { required: 'unknown', reason: 'No transit details available' };
  }

  const lineName = transitDetails.line?.name || '';
  const shortName = transitDetails.line?.short_name || '';
  const vehicleType = transitDetails.line?.vehicle?.type || '';
  const combined = `${lineName} ${shortName}`.toLowerCase();

  // Lista de servicios que requieren reserva (heurístico)
  const reservedKeywords = [
    'limited express',
    'ltd. exp',
    '特急',
    'reserved',
    'laview',
    'romancecar',
    'azusa',
    'shinkansen',
    '新幹線',
    'express',
    '急行'
  ];

  const hasReservedKeyword = reservedKeywords.some(keyword => 
    combined.includes(keyword.toLowerCase())
  );

  if (hasReservedKeyword) {
    return {
      required: 'heuristic_yes',
      reason: `Contains reserved service indicator: ${lineName || shortName}`
    };
  }

  // Si es RAIL pero no tiene keywords de reserva, probablemente no requiere
  if (vehicleType === 'RAIL' || transitDetails.line?.vehicle?.name) {
    return {
      required: 'heuristic_no',
      reason: 'Local or rapid service (no reserved seats typically required)'
    };
  }

  return { required: 'unknown', reason: 'Unable to determine reservation requirement' };
}

/**
 * Convierte un leg de Google Directions a nuestro formato TransitLeg
 * @param {Object} step - Step de la respuesta de Google Directions API
 * @returns {Object|null} TransitLeg o null si no es relevante
 */
function normalizeLeg(step) {
  const travelMode = step.travel_mode;
  const duration = step.duration?.value || 0; // segundos
  const durationMinutes = Math.round(duration / 60);

  if (travelMode === 'WALKING') {
    return {
      type: 'WALK',
      from: step.start_location?.address || step.start_location?.lat + ',' + step.start_location?.lng,
      to: step.end_location?.address || step.end_location?.lat + ',' + step.end_location?.lng,
      duration_minutes: durationMinutes
    };
  }

  if (travelMode === 'TRANSIT') {
    const transitDetails = step.transit_details;
    if (!transitDetails) return null;

    const line = transitDetails.line;
    const vehicle = line?.vehicle || {};
    
    return {
      type: vehicle.type === 'HEAVY_RAIL' ? 'RAIL' : 
            vehicle.type === 'SUBWAY' ? 'SUBWAY' :
            vehicle.type === 'BUS' ? 'BUS' : 'RAIL',
      from: transitDetails.departure_stop?.name || '',
      to: transitDetails.arrival_stop?.name || '',
      duration_minutes: durationMinutes,
      operator: line?.agencies?.[0]?.name || '',
      line: line?.name || line?.short_name || '',
      headsign: transitDetails.headsign || '',
      num_stops: transitDetails.num_stops || 0
    };
  }

  return null;
}

/**
 * Calcula el score de una ruta para ordenamiento
 * @param {Object} route - Ruta normalizada
 * @returns {number} Score (menor es mejor)
 */
function calculateScore(route) {
  return route.duration_minutes + 
         (route.transfers * 20) + 
         (route.walk_minutes_total * 2);
}

/**
 * Normaliza una ruta completa de Google Directions
 * @param {Object} route - Route de la respuesta de Google Directions API
 * @returns {Object} TransitRoute
 */
function normalizeRoute(route) {
  const legs = [];
  let walkMinutesTotal = 0;
  let transfers = 0;
  let firstDeparture = null;
  let lastArrival = null;

  route.legs?.forEach(leg => {
    leg.steps?.forEach(step => {
      const normalizedLeg = normalizeLeg(step);
      if (normalizedLeg) {
        legs.push(normalizedLeg);
        if (normalizedLeg.type === 'WALK') {
          walkMinutesTotal += normalizedLeg.duration_minutes;
        }
        if (normalizedLeg.type === 'RAIL' || normalizedLeg.type === 'SUBWAY' || normalizedLeg.type === 'BUS') {
          if (firstDeparture === null) {
            firstDeparture = step.transit_details?.departure_time?.text || 
                           step.departure_time?.text || '';
          }
        }
      }
    });
  });

  // Contar transfers (cada vez que hay WALK seguido de TRANSIT)
  for (let i = 0; i < legs.length - 1; i++) {
    if (legs[i].type === 'WALK' && 
        (legs[i + 1].type === 'RAIL' || legs[i + 1].type === 'SUBWAY' || legs[i + 1].type === 'BUS')) {
      transfers++;
    }
  }

  // Obtener última llegada
  const lastLeg = route.legs?.[route.legs.length - 1];
  if (lastLeg) {
    const lastStep = lastLeg.steps?.[lastLeg.steps.length - 1];
    lastArrival = lastStep?.transit_details?.arrival_time?.text || 
                  lastStep?.arrival_time?.text || 
                  lastStep?.end_location?.address || '';
  }

  // Extraer información de reserva del primer leg de tránsito
  let reservationInfo = { required: 'unknown', reason: 'No transit legs found' };
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      if (step.travel_mode === 'TRANSIT') {
        reservationInfo = extractReservationInfo(step);
        break;
      }
    }
    if (reservationInfo.required !== 'unknown') break;
  }

  // Formatear tiempos (extraer solo hora:minuto)
  const departureTime = firstDeparture ? 
    firstDeparture.match(/\d{1,2}:\d{2}/)?.[0] || firstDeparture : '';
  const arrivalTime = lastArrival ? 
    lastArrival.match(/\d{1,2}:\d{2}/)?.[0] || lastArrival : '';

  const totalDuration = route.duration?.value ? Math.round(route.duration.value / 60) : 0;

  const normalized = {
    summary: route.summary || `${route.legs?.[0]?.start_address || ''} → ${route.legs?.[route.legs.length - 1]?.end_address || ''}`,
    departure: departureTime,
    arrival: arrivalTime,
    duration_minutes: totalDuration,
    transfers: Math.max(0, transfers - 1), // Ajustar: el primer boarding no cuenta como transfer
    walk_minutes_total: walkMinutesTotal,
    legs,
    reservation: reservationInfo
  };

  normalized.score = calculateScore(normalized);
  return normalized;
}

/**
 * Normaliza la respuesta completa de Google Directions API
 * @param {Object} googleResponse - Respuesta completa de Google Directions API
 * @param {Object} queryInput - Input original de la query
 * @returns {Object} TransitPlan
 */
export function normalizeGoogleResponse(googleResponse, queryInput) {
  const warnings = [];
  
  if (googleResponse.status !== 'OK') {
    warnings.push(`Google API returned status: ${googleResponse.status}`);
  }

  if (!googleResponse.routes || googleResponse.routes.length === 0) {
    return {
      query: {
        origin: queryInput.origin.label,
        destination: queryInput.destination.label,
        departure_iso: queryInput.departure.iso
      },
      best: null,
      alternatives: [],
      warnings: [...warnings, 'No routes found']
    };
  }

  // Normalizar todas las rutas
  const normalizedRoutes = googleResponse.routes
    .map(route => normalizeRoute(route))
    .filter(route => route !== null);

  // Ordenar por score (menor es mejor)
  normalizedRoutes.sort((a, b) => a.score - b.score);

  const best = normalizedRoutes[0] || null;
  const alternatives = normalizedRoutes.slice(1, 4); // Máximo 3 alternativas

  return {
    query: {
      origin: googleResponse.routes[0]?.legs?.[0]?.start_address || queryInput.origin.label,
      destination: googleResponse.routes[0]?.legs?.[googleResponse.routes[0].legs.length - 1]?.end_address || queryInput.destination.label,
      departure_iso: queryInput.departure.iso
    },
    best,
    alternatives,
    warnings
  };
}
