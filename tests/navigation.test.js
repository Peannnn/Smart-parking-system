import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homePage, parkingPages, operatorRole, localDateTime } from '../src/navigation.js'

test('new and normal accounts have exactly three user pages and park-now home', () => {
  for (const role of [undefined, '', null, 'driver', 'administrator', 'ADMIN']) {
    assert.deepEqual(parkingPages(role), ['Park now', 'Reservations', 'History'])
    assert.equal(homePage(role), 'Park now')
    assert.equal(operatorRole(role), false)
  }
})
test('trusted lot roles retain appropriate operator pages', () => {
  assert.equal(homePage('admin'), 'Dashboard')
  assert.equal(parkingPages('admin').includes('Settings'), true)
  assert.equal(parkingPages('admin').includes('Check permit'), true)
  assert.equal(parkingPages('admin').includes('Park now'), false)
  assert.equal(parkingPages('staff').includes('Park now'), true)
  assert.equal(parkingPages('staff').includes('Settings'), false)
  assert.equal(parkingPages('staff').includes('Vehicles & permits'), true)
})
test('datetime fields display in the device local timezone', () => {
  const date = new Date('2026-11-05T18:30:00Z')
  const expected = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  assert.equal(localDateTime(date), expected)
})
