import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHistory, saveHistory } from '../src/features/scanner/services/localHistory.js'

test('handles corrupt and unavailable local storage', () => {
  globalThis.localStorage = { getItem: () => '{bad', setItem: () => { throw new Error('quota') } }
  assert.deepEqual(loadHistory(), [])
  assert.equal(saveHistory([]), false)
  globalThis.localStorage = { getItem: () => 'null' }
  assert.deepEqual(loadHistory(), [])
})
test('preserves old records, persists ALPR records, and excludes malformed history', () => {
  let saved
  globalThis.localStorage = { setItem: (_, data) => { saved = data }, getItem: () => saved }
  const row = { id: 'test', plate: 'ABC 1234', source: 'OCR reviewed', time: '2026-09-28T00:00:00Z' }
  const alpr = { ...row, id: 'alpr', source: 'ALPR reviewed' }
  assert.equal(saveHistory([alpr, row, null, { time: 'invalid' }]), true)
  assert.deepEqual(loadHistory(), [alpr, row])
  saveHistory(Array.from({ length: 110 }, () => row))
  assert.equal(loadHistory().length, 100)
})

test('keeps account histories separate and preserves anonymous history', () => {
  const storage = new Map()
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  const row = { id: 'one', plate: 'ABC 1234', source: 'Manual entry', time: '2026-11-04T00:00:00Z' }
  saveHistory([row])
  assert.deepEqual(loadHistory('alice'), [])
  saveHistory([{ ...row, id: 'alice-record' }], 'alice')
  assert.deepEqual(loadHistory('bob'), [])
  saveHistory([{ ...row, id: 'bob-record' }], 'bob')
  assert.equal(loadHistory('alice')[0].id, 'alice-record')
  assert.equal(loadHistory('bob')[0].id, 'bob-record')
  assert.deepEqual(loadHistory(), [row])
})
