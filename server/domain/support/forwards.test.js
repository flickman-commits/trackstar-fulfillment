import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findForwarded, parseForwardedAddress, unwrapForward } from './forwards.js'

const ours = e => /@trackstar\.art$/i.test(String(e || ''))
const base = { fromEmail: 'matt@trackstar.art', fromName: 'Matt Hickman', toEmails: 'fast@trackstar.art', subject: 'Fwd: Frame arrived cracked', labels: ['INBOX'], sentAt: new Date('2026-10-18T15:00:00Z'), inReplyTo: '<x@mail.gmail.com>', bodyHtml: '<div>wrapper</div>' }

test('Gmail forward: the customer, their subject, date and words; the note above is kept apart', () => {
  const bodyText = `Can you take this one?\n\n---------- Forwarded message ---------\nFrom: Jane Doe <jane.doe@gmail.com>\nDate: Fri, Oct 17, 2026 at 3:12 PM\nSubject: Frame arrived cracked\nTo: Matt Hickman <matt@trackstar.art>\n\n\nHi Matt,\nMy frame arrived cracked. Photo attached.\n\nJane`
  const out = unwrapForward({ ...base, bodyText }, { isOurs: ours })
  assert.equal(out.message.direction, 'in')
  assert.equal(out.message.fromEmail, 'jane.doe@gmail.com')
  assert.equal(out.message.fromName, 'Jane Doe')
  assert.equal(out.message.subject, 'Frame arrived cracked')
  assert.equal(out.message.bodyText, 'Hi Matt,\nMy frame arrived cracked. Photo attached.\n\nJane')
  assert.equal(out.message.bodyHtml, null)
  assert.equal(out.message.inReplyTo, null)
  assert.equal(out.message.sentAt.getFullYear(), 2026)
  assert.equal(out.note, 'Can you take this one?')
  assert.equal(out.forwardedBy.email, 'matt@trackstar.art')
})

test('Apple Mail forward, with the blank line after the marker', () => {
  const bodyText = `Begin forwarded message:\n\nFrom: "Sam Lee" <sam@lee.com>\nSubject: Re: Order 4550\nDate: October 17, 2026 at 9:41:02 AM EDT\nTo: matt@trackstar.art\n\nWhere is my order?`
  const f = findForwarded(bodyText)
  assert.deepEqual(f.from, { email: 'sam@lee.com', name: 'Sam Lee' })
  assert.equal(f.subject, 'Re: Order 4550')
  assert.equal(f.body, 'Where is my order?')
  assert.equal(f.note, '')
})

test('Outlook forward: a rule of underscores, From and Sent', () => {
  const bodyText = `FYI\n\n________________________________\nFrom: Pat Kim <pat.kim@outlook.com>\nSent: Friday, October 17, 2026 10:02 AM\nTo: Matt <matt@trackstar.art>\nSubject: Wrong year on my print\n\nIt says 2025, I ran 2026.`
  const out = unwrapForward({ ...base, bodyText }, { isOurs: ours })
  assert.equal(out.message.fromEmail, 'pat.kim@outlook.com')
  assert.equal(out.message.subject, 'Wrong year on my print')
  assert.equal(out.message.bodyText, 'It says 2025, I ran 2026.')
  assert.equal(out.note, 'FYI')
})

test('addresses in the shapes mail clients write them', () => {
  assert.deepEqual(parseForwardedAddress('Jane Doe [mailto:Jane@X.com]'), { email: 'jane@x.com', name: 'Jane Doe' })
  assert.deepEqual(parseForwardedAddress('jane@x.com'), { email: 'jane@x.com', name: '' })
  assert.deepEqual(parseForwardedAddress('*Jane* <jane@x.com>'), { email: 'jane@x.com', name: 'Jane' })
})

test('not a forward: a teammate writing to fast@, a forward of our own mail, a customer, our own sent mail', () => {
  assert.equal(unwrapForward({ ...base, subject: 'Note', bodyText: 'Heads up, Chicago proofs are late.' }, { isOurs: ours }), null)
  assert.equal(unwrapForward({ ...base, bodyText: '---------- Forwarded message ---------\nFrom: Eli <eli@trackstar.art>\nSubject: x\n\nhi' }, { isOurs: ours }), null)
  assert.equal(unwrapForward({ ...base, fromEmail: 'jane@gmail.com', bodyText: '---------- Forwarded message ---------\nFrom: Bob <bob@b.com>\n\nhi' }, { isOurs: ours }), null)
  assert.equal(unwrapForward({ ...base, labels: ['SENT'], bodyText: '---------- Forwarded message ---------\nFrom: Bob <bob@b.com>\n\nhi' }, { isOurs: ours }), null)
})

test('no subject in the forwarded headers: the forward\'s own subject, without Fwd:', () => {
  const out = unwrapForward({ ...base, subject: 'Fwd: Fw: Help!', bodyText: '---------- Forwarded message ---------\nFrom: Bob <bob@b.com>\n\nhi' }, { isOurs: ours })
  assert.equal(out.message.subject, 'Help!')
})
