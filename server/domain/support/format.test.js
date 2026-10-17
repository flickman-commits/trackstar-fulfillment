import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineToHtml, replyToHtml, replyToPlain } from './format.js'

test('bold, italic and links become HTML', () => {
  assert.equal(lineToHtml('This is **really** _nice_'), 'This is <strong>really</strong> <em>nice</em>')
  assert.equal(lineToHtml('See [your design](https://fast.trackstar.art/approve/abc)'), 'See <a href="https://fast.trackstar.art/approve/abc">your design</a>')
  assert.equal(lineToHtml('Track it at https://track.amazon.com/tracking/TBA1.'), 'Track it at <a href="https://track.amazon.com/tracking/TBA1">https://track.amazon.com/tracking/TBA1</a>.')
})

test('underscores in addresses and words are left alone', () => {
  assert.equal(lineToHtml('email kp_24_x@yahoo.com'), 'email kp_24_x@yahoo.com')
  assert.equal(lineToHtml('https://x.com/a_b_c'), '<a href="https://x.com/a_b_c">https://x.com/a_b_c</a>')
})

test('HTML the customer could see is escaped, and only http(s) and mailto links are made', () => {
  assert.equal(lineToHtml('<b>hi</b> & bye'), '&lt;b&gt;hi&lt;/b&gt; &amp; bye')
  assert.equal(lineToHtml('[x](javascript:alert(1))'), '[x](javascript:alert(1))')
})

test('paragraphs and lines', () => {
  assert.equal(replyToHtml('Hey Jane,\n\nLine one\nLine two'), '<div>\n<div>Hey Jane,</div>\n<div><br></div>\n<div>Line one</div>\n<div>Line two</div>\n</div>')
})

test('a DM gets plain text', () => {
  assert.equal(replyToPlain('**Shipped!** See [tracking](https://t.co/1) and _thanks_'), 'Shipped! See tracking: https://t.co/1 and thanks')
})
