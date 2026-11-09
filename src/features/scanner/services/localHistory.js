const STORAGE_KEY = 'parkcontrol.vehicle-history.v1'
export function loadHistory(userId) {
  try {
    const rows = JSON.parse(
      localStorage.getItem(userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY) || '[]',
    )
    if (!Array.isArray(rows)) return []
    return rows
      .filter(
        (row) =>
          row &&
          typeof row.id === 'string' &&
          typeof row.plate === 'string' &&
          typeof row.source === 'string' &&
          typeof row.time === 'string' &&
          Number.isFinite(Date.parse(row.time)),
      )
      .slice(0, 100)
  } catch {
    return []
  }
}
export function saveHistory(rows, userId) {
  try {
    localStorage.setItem(userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY, JSON.stringify(rows))
    return true
  } catch {
    return false
  }
}
