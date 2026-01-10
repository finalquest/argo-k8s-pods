/**
 * @typedef {Object} TransitQueryInput
 * @property {Object} origin
 * @property {string} origin.label
 * @property {number|null} origin.lat
 * @property {number|null} origin.lng
 * @property {Object} destination
 * @property {string} destination.label
 * @property {number|null} destination.lat
 * @property {number|null} destination.lng
 * @property {Object} departure
 * @property {string} departure.iso - ISO 8601 string with timezone (e.g., "2026-03-28T07:30:00+09:00")
 * @property {string} departure.tz - Timezone (e.g., "Asia/Tokyo")
 * @property {Object} preferences
 * @property {boolean} preferences.alternatives
 * @property {number} preferences.max_transfers
 * @property {number} preferences.max_walk_minutes
 */

/**
 * @typedef {Object} TransitLeg
 * @property {string} type - "WALK" | "RAIL" | "BUS" | "SUBWAY"
 * @property {string} from
 * @property {string} to
 * @property {number} duration_minutes
 * @property {string} [operator] - For RAIL/BUS
 * @property {string} [line] - For RAIL/BUS
 * @property {string} [headsign] - For RAIL/BUS
 * @property {number} [num_stops] - For RAIL/BUS
 */

/**
 * @typedef {Object} ReservationInfo
 * @property {string} required - "heuristic_yes" | "heuristic_no" | "unknown"
 * @property {string} reason
 */

/**
 * @typedef {Object} TransitRoute
 * @property {string} summary
 * @property {string} departure - Time string (e.g., "07:30")
 * @property {string} arrival - Time string (e.g., "08:50")
 * @property {number} duration_minutes
 * @property {number} transfers
 * @property {number} walk_minutes_total
 * @property {TransitLeg[]} legs
 * @property {ReservationInfo} reservation
 * @property {number} [score] - For sorting
 */

/**
 * @typedef {Object} TransitPlan
 * @property {Object} query
 * @property {string} query.origin
 * @property {string} query.destination
 * @property {string} query.departure_iso
 * @property {TransitRoute} best
 * @property {TransitRoute[]} alternatives
 * @property {string[]} warnings
 */

export {};
