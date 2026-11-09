export const USER_PAGES = ['Check in / out', 'History']
export function operatorRole(role) {
  return role === 'admin' || role === 'staff'
}
export function homePage(role) {
  return operatorRole(role) ? 'Dashboard' : 'Check in / out'
}
export function parkingPages(role) {
  return operatorRole(role)
    ? [
        'Dashboard',
        'Entry / Exit',
        'Vehicles & permits',
        ...(role === 'admin' ? ['Check permit'] : []),
        'Parking spots',
        'History',
        ...(role === 'admin' ? ['Settings'] : []),
      ]
    : USER_PAGES
}
export function localDateTime(value) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
