import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Resuelve el destino (estación) de un itinerario desde un archivo .md
 * @param {Object} params
 * @param {string} params.itinerary_id - ID del itinerario (nombre del archivo sin .md)
 * @param {string} params.repo_path - Ruta al repositorio tokyo2026
 * @param {string} [params.date] - Fecha opcional (no usado en v1)
 * @returns {Promise<Object>} { destination: { label }, first_poi, notes }
 */
export async function resolveItineraryDestination({ itinerary_id, repo_path, date }) {
  const notes = [];
  
  // Buscar el archivo del itinerario
  // Asumimos que los itinerarios están en una carpeta específica o en la raíz
  const possiblePaths = [
    join(repo_path, 'itineraries', `${itinerary_id}.md`),
    join(repo_path, 'itineraries', `${itinerary_id}`, 'index.md'),
    join(repo_path, `${itinerary_id}.md`),
    join(repo_path, 'itinerary', `${itinerary_id}.md`)
  ];

  let filePath = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      filePath = path;
      break;
    }
  }

  if (!filePath) {
    // Fallback: usar el nombre del itinerario + "Station"
    return {
      destination: {
        label: `${itinerary_id} Station`
      },
      first_poi: null,
      notes: [`Itinerary file not found, using fallback: ${itinerary_id} Station`]
    };
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    
    // Estrategia 1: Buscar frontmatter con start_station o destination_station
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const startStationMatch = frontmatter.match(/start_station:\s*(.+)/i);
      const destStationMatch = frontmatter.match(/destination_station:\s*(.+)/i);
      const stationMatch = frontmatter.match(/station:\s*(.+)/i);
      
      const station = (destStationMatch?.[1] || startStationMatch?.[1] || stationMatch?.[1])?.trim();
      if (station) {
        // Asegurar que termine con "Station" si no lo tiene
        const stationLabel = station.endsWith('Station') || station.endsWith('駅') 
          ? station 
          : `${station} Station`;
        
        return {
          destination: {
            label: stationLabel
          },
          first_poi: extractFirstPOI(content),
          notes: ['Destination station found in frontmatter']
        };
      }
    }

    // Estrategia 2: Buscar "Station" o "駅" cerca del inicio del documento
    const lines = content.split('\n').slice(0, 50); // Primeras 50 líneas
    for (const line of lines) {
      // Buscar patrones como "Seibu-Chichibu Station" o "Chichibu 駅"
      const stationMatch = line.match(/([A-Za-z0-9\-]+(?:\s+[A-Za-z0-9\-]+)*)\s+(?:Station|駅)/);
      if (stationMatch) {
        return {
          destination: {
            label: stationMatch[0].trim()
          },
          first_poi: extractFirstPOI(content),
          notes: ['Destination station inferred from document text']
        };
      }
    }

    // Estrategia 3: Fallback - usar el título del itinerario + "Station"
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch?.[1]?.trim() || itinerary_id;
    
    return {
      destination: {
        label: `${title} Station`
      },
      first_poi: extractFirstPOI(content),
      notes: ['Destination station inferred from itinerary title']
    };
  } catch (error) {
    return {
      destination: {
        label: `${itinerary_id} Station`
      },
      first_poi: null,
      notes: [`Error reading itinerary file: ${error.message}`]
    };
  }
}

/**
 * Extrae el primer POI mencionado en el itinerario
 * @param {string} content - Contenido del archivo .md
 * @returns {string|null}
 */
function extractFirstPOI(content) {
  // Buscar en las primeras líneas después del título
  const lines = content.split('\n').slice(0, 30);
  
  // Buscar patrones comunes de POIs:
  // - "## Park Name" o "### Park Name"
  // - "- Park Name" o "* Park Name"
  // - "Park Name" seguido de descripción
  
  for (const line of lines) {
    // Headers
    const headerMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headerMatch) {
      const poi = headerMatch[1].trim();
      // Filtrar headers genéricos
      if (!poi.match(/^(itinerary|plan|schedule|notes|overview)$/i)) {
        return poi;
      }
    }
    
    // List items
    const listMatch = line.match(/^[-*]\s+(.+)/);
    if (listMatch) {
      const poi = listMatch[1].split(/[:\-–]/)[0].trim();
      if (poi.length > 2) {
        return poi;
      }
    }
  }
  
  return null;
}
