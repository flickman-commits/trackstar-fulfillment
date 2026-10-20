import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeSignatureHtml as clean } from './signature.js'
import { DEFAULTS } from './settings.js'

test('a normal signature comes through as it was', () => {
  const sig = '<p style="margin:0;font-weight:700;color:#111">Matt Hickman</p><p style="margin:0">Owner | <a href="https://www.trackstar.art" style="color:#1a56db">Trackstar</a></p><img src="https://cdn.example.com/logo.png" alt="Trackstar" width="120" height="40"><br>'
  assert.equal(clean(sig), sig)
  // The built-in signature keeps every part of itself.
  assert.match(clean(DEFAULTS.signature), /Matt Hickman/)
  assert.match(clean(DEFAULTS.signature), /href="https:\/\/www\.flickmanmedia\.com"/)
  assert.match(clean(DEFAULTS.signature), /font-family:Inter/)
})

test('scripts, handlers and dangerous links are dropped', () => {
  assert.equal(clean('<script>alert(1)</script>Hi'), 'Hi')
  assert.equal(clean('<img src=x onerror=alert(1)>'), '<img>')
  assert.equal(clean('<img src="https://ok.example/a.png" onerror="alert(1)">'), '<img src="https://ok.example/a.png">')
  assert.equal(clean('<a href="javascript:alert(1)">x</a>'), '<a>x</a>')
  assert.equal(clean('<a href="jav&#x09;ascript:alert(1)">x</a>'), '<a>x</a>')
  assert.equal(clean('<a href="javascript&colon;alert(1)">x</a>'), '<a>x</a>')
  assert.equal(clean('<a href="data:text/html,hi">x</a>'), '<a>x</a>')
  assert.equal(clean('<img src="http://insecure.example/a.png">'), '<img>')
  assert.equal(clean('<a href="mailto:matt@trackstar.art" onclick="x()">mail</a>'), '<a href="mailto:matt@trackstar.art">mail</a>')
  assert.equal(clean('<iframe src="https://evil.example"></iframe>ok'), 'ok')
  assert.equal(clean('<svg onload=alert(1)><circle/></svg>ok'), 'ok')
  assert.equal(clean('<!-- <script>alert(1)</script> -->ok'), 'ok')
  assert.equal(clean('<scr<script>ipt>alert(1)</script>'), '&lt;scr')
})

test('unknown tags lose their tags but keep their text; styles keep only the allowed properties', () => {
  assert.equal(clean('<font color="red">Hi</font> <h1>there</h1>'), 'Hi there')
  assert.equal(clean('<span style="color:red;position:fixed;background:url(https://x/y.png)">a</span>'), '<span style="color:red">a</span>')
  assert.equal(clean('<span style="color:expression(alert(1))">a</span>'), '<span>a</span>')
  assert.equal(clean('<span style="color:rgb(34, 34, 34);font-size:14px">a</span>'), '<span style="color:rgb(34, 34, 34);font-size:14px">a</span>')
  assert.equal(clean('<table><tbody><tr><td width="50%">x</td></tr></tbody></table>'), '<table><tbody><tr><td width="50%">x</td></tr></tbody></table>')
  assert.equal(clean('<p class="x" id="y" data-a="1">p</p>'), '<p>p</p>')
  assert.equal(clean('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2')
  assert.equal(clean('<a href="https://x.example/?a=1&b=2">x</a>'), '<a href="https://x.example/?a=1&amp;b=2">x</a>')
  assert.equal(clean(null), '')
})
