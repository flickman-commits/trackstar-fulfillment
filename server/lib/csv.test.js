import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from './csv.js'

test('splits plain rows', () => {
  const { headers, rows } = parseCsv('a,b\n1,2\n3,4\n')
  assert.deepEqual(headers, ['a', 'b'])
  assert.deepEqual(rows, [['1', '2'], ['3', '4']])
})

test('keeps commas inside quoted fields', () => {
  const { rows } = parseCsv('race,contact\n"Acme Marathon, Inc.",Jane\n')
  assert.deepEqual(rows, [['Acme Marathon, Inc.', 'Jane']])
})

test('handles doubled quotes and embedded newlines', () => {
  const { rows } = parseCsv('note\n"She said ""yes""\nnext line"\n')
  assert.deepEqual(rows, [['She said "yes"\nnext line']])
})

test('strips a UTF-8 BOM off the first header', () => {
  const { headers } = parseCsv('﻿email,name\na@b.com,Jo\n')
  assert.equal(headers[0], 'email')
})

test('accepts CRLF and a missing trailing newline', () => {
  const { headers, rows } = parseCsv('a,b\r\n1,2')
  assert.deepEqual(headers, ['a', 'b'])
  assert.deepEqual(rows, [['1', '2']])
})

test('pads short rows to the header width', () => {
  const { rows } = parseCsv('a,b,c\n1\n')
  assert.deepEqual(rows, [['1', '', '']])
})

test('drops blank lines rather than emitting empty records', () => {
  const { rows } = parseCsv('a\n1\n\n\n2\n')
  assert.deepEqual(rows, [['1'], ['2']])
})

test('an empty file yields no headers', () => {
  assert.deepEqual(parseCsv('   \n'), { headers: [], rows: [] })
})
