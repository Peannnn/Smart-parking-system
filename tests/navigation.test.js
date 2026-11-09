import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homePage, parkingPages, operatorRole, localDateTime } from '../src/features/parking/navigation.js'

test('new and normal accounts have only check-in/out and history', () => {
  for (const role of [undefined, '', null, 'driver', 'administrator', 'ADMIN']) {
    assert.deepEqual(parkingPages(role), ['Check in / out', 'History'])
    assert.equal(homePage(role), 'Check in / out')
    assert.equal(operatorRole(role), false)
  }
})
test('trusted lot roles retain appropriate operator pages', () => {
  assert.equal(homePage('admin'), 'Dashboard')
  for (const role of ['admin', 'staff', 'driver']) assert.equal(parkingPages(role).includes('Reservations'), false)
  assert.equal(parkingPages('admin').includes('Settings'), true)
  assert.equal(parkingPages('admin').includes('Check permit'), true)
  assert.equal(parkingPages('admin').includes('Park now'), false)
  assert.equal(parkingPages('staff').includes('Entry / Exit'), true)
  assert.equal(parkingPages('staff').includes('Settings'), false)
  assert.equal(parkingPages('staff').includes('Vehicles & permits'), true)
})
test('datetime fields display in the device local timezone', () => {
  const date = new Date('2026-11-05T18:30:00Z')
  const expected = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  assert.equal(localDateTime(date), expected)
})
