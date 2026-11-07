import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlate, validPlate, permitStatus, duration, csvCell } from '../src/parking.js'

test('normalizes and validates reviewed plates', () => {
  assert.equal(normalizePlate(' abC  123 '), 'ABC 123')
  assert.equal(validPlate(' abC  123 '), true)
  for (const input of ['', 'A', '<script>', 'A'.repeat(16)]) assert.equal(validPlate(input), false)
})
test('permits include their expiry day in UTC and respect deactivation', () => {
  const now = new Date('2026-11-04T23:59:59Z')
  assert.equal(permitStatus(null, now), 'Unregistered')
  assert.equal(permitStatus({ active: true, permit_expires: '2026-11-04' }, now), 'Valid permit')
  assert.equal(permitStatus({ active: true, permit_expires: '2026-11-03' }, now), 'Expired')
  assert.equal(permitStatus({ active: false, permit_expires: '2027-11-04' }, now), 'Inactive')
})
test('durations and CSV exports handle user-entered values safely', () => {
  assert.equal(duration('2026-11-04T09:00:00Z', '2026-11-04T11:30:00Z'), '2h 30m')
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"')
  assert.equal(csvCell('a,"b"'), '"a,""b"""')
})
