export function normalizePlate(value) { return value.trim().toUpperCase().replace(/\s+/g, ' ') }
export function validPlate(value) { return /^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$/.test(normalizePlate(value)) }
export function permitStatus(vehicle, date = new Date()) {
  if (!vehicle) return 'Unregistered'
  if (!vehicle.active) return 'Inactive'
  return vehicle.permit_expires >= date.toISOString().slice(0, 10) ? 'Valid permit' : 'Expired'
}
export function duration(entry, exit = new Date().toISOString()) {
  const minutes = Math.max(0, Math.floor((Date.parse(exit) - Date.parse(entry)) / 60000))
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
export function csvCell(value) {
  // Prevent spreadsheet formula execution in exported user-entered values.
  const text = String(value ?? '')
  return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`
}
