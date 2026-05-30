/**
 * build-preview.mjs — regenerate a standalone, interactive preview of the
 * Trackstar Instant Lookup widget from the live block .liquid file.
 *
 * Why: lets us eyeball every state (search, found, multiple, manual, confirm,
 * green success) in a plain browser BEFORE pushing to the live theme. The HTML
 * is generated straight from blocks/trackstar-instant-lookup.liquid so it can
 * never drift from what actually ships. A mocked lookup endpoint + a scenario
 * picker drive the different result paths; a fake /cart/add form makes the
 * "require lookup" add-to-cart toggle observable.
 *
 * Run:  node shopify/_preview/build-preview.mjs
 * View: http://localhost:8773  (preview_start "widget-preview")
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIQUID = path.join(__dirname, '..', 'blocks', 'trackstar-instant-lookup.liquid');
const OUT = path.join(__dirname, 'index.html');

const PROP_DEFAULTS = {
  prop_runner: 'Runner Name (First & Last)',
  prop_year: 'Race Year',
  prop_race: 'Race Name',
  prop_bib: 'Bib #',
  prop_time: 'Time',
  prop_pace: 'Pace',
  prop_event: 'Event',
  prop_notime: 'No time',
  prop_gift: 'Gift',
  prop_verified: '_lookup_verified',
};

let src = fs.readFileSync(LIQUID, 'utf8');

// 1. Drop the schema block.
src = src.replace(/{%\s*schema\s*%}[\s\S]*?{%\s*endschema\s*%}/g, '');
// 2. Drop comment blocks (both whitespace-control variants).
src = src.replace(/{%-?\s*comment\s*-?%}[\s\S]*?{%-?\s*endcomment\s*-?%}/g, '');

// 3. Pull the three pieces.
const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
const bodyMatch = src.match(/<div\s+class="tsil"[\s\S]*?<\/div>\s*<\/div>\s*(?=<style>)/);

if (!styleMatch || !scriptMatch || !bodyMatch) {
  console.error('Could not extract style/script/body from the liquid. Aborting.');
  process.exit(1);
}

let css = styleMatch[1];
let js = scriptMatch[1];
let body = bodyMatch[0];

// 4. Collapse Liquid conditionals in the body: if/else -> else branch,
//    if/endif -> inner. (The widget body only has the logo if/else and the
//    subheading if/endif, neither nested.)
function collapseConditionals(s) {
  s = s.replace(/{%-?\s*if[\s\S]*?-?%}([\s\S]*?){%-?\s*else\s*-?%}([\s\S]*?){%-?\s*endif\s*-?%}/g, '$2');
  s = s.replace(/{%-?\s*if[\s\S]*?-?%}([\s\S]*?){%-?\s*endif\s*-?%}/g, '$1');
  return s;
}
body = collapseConditionals(body);

// 5. Replace Liquid output tokens with concrete preview values.
function replaceTokens(s) {
  return s
    .replace(/{{\s*block\.id\s*}}/g, 'preview')
    .replace(/{{\s*block\.shopify_attributes\s*}}/g, '')
    .replace(/{{\s*block\.settings\.race_name[^}]*}}/g, 'Memphis Marathon')
    .replace(/{{\s*block\.settings\.api_base[^}]*}}/g, 'MOCK')
    .replace(/{{\s*block\.settings\.require_lookup\s*}}/g, 'true')
    .replace(/{{\s*block\.settings\.accent_color[^}]*}}/g, '#4600D6')
    .replace(/{{\s*block\.settings\.heading[^}]*}}/g, 'Trackstar Instant Lookup')
    .replace(/{{\s*block\.settings\.subheading[^}]*}}/g, "Verify your runner's time.")
    .replace(/{{\s*block\.settings\.(prop_\w+)[^}]*}}/g, (_, id) => PROP_DEFAULTS[id] || '')
    // Anything left (e.g. image_url filters in discarded branches) -> empty.
    .replace(/{{[^}]*}}/g, '');
}
css = replaceTokens(css);
js = replaceTokens(js);
body = replaceTokens(body);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trackstar Instant Lookup — Preview</title>
<style>
  body { margin: 0; background: #F7F5F0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: -0.04em; color: #1A1A1A; }
  .pv-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; padding: .75rem 1rem; background: #1A1A1A; color: #fff; font-size: .85rem; }
  .pv-bar strong { font-weight: 700; }
  .pv-bar select, .pv-bar button { font-family: inherit; font-size: .8rem; padding: .35rem .5rem; border-radius: 0; border: 1px solid #555; background: #2a2a2a; color: #fff; }
  .pv-note { opacity: .7; }
  .pv-stage { max-width: 460px; margin: 2rem auto; padding: 0 1rem; }
  .pv-atc { margin-top: 1rem; }
  .pv-atc button { width: 100%; padding: 14px; border: 0; border-radius: 0; background: #1A1A1A; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: -0.04em; cursor: pointer; }
  .pv-atc button:disabled { opacity: .4; cursor: not-allowed; }
  .pv-atc-label { font-size: .7rem; text-transform: uppercase; color: #666; margin: 0 0 .25rem; letter-spacing: 0.02em; }
${css}
</style>
</head>
<body>
  <div class="pv-bar">
    <strong>Widget Preview</strong>
    <label>Scenario:
      <select id="pv-scenario">
        <option value="single">Single match</option>
        <option value="multiple">Multiple matches</option>
        <option value="none">No match (manual)</option>
        <option value="error">Lookup error (manual)</option>
        <option value="ratelimited">Rate limited (manual)</option>
      </select>
    </label>
    <span class="pv-note">Search any name → result depends on scenario. Mocked lookup; no network.</span>
  </div>

  <div class="pv-stage">
    ${body}

    <div class="pv-atc">
      <p class="pv-atc-label">Mock product form (watch this enable on confirm)</p>
      <form action="/cart/add" onsubmit="return false">
        <button type="submit" name="add">Add to cart</button>
      </form>
    </div>
  </div>

  <script>
    // ---- Mock the public lookup endpoint so every state is reachable offline.
    window.__TSIL_SCENARIO = 'single';
    document.getElementById('pv-scenario').addEventListener('change', function (e) {
      window.__TSIL_SCENARIO = e.target.value;
    });
    var SAMPLE_SINGLE = { name: 'Matt Hickman', bib: '1487', time: '3:45:12', pace: '8:35', eventType: 'Marathon' };
    var SAMPLE_MULTI = [
      { name: 'Matt Hickman', bib: '1487', time: '3:45:12', pace: '8:35', eventType: 'Marathon' },
      { name: 'Matthew Hickman', bib: '2231', time: '1:52:40', pace: '8:36', eventType: 'Half Marathon' },
      { name: 'Matt Hickmann', bib: '0099', time: '4:10:05', pace: '9:32', eventType: 'Marathon' }
    ];
    var _fetch = window.fetch;
    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.indexOf('/api/public/results-lookup') !== -1) {
        var s = window.__TSIL_SCENARIO;
        function reply(status, data) {
          return Promise.resolve({ status: status, json: function () { return Promise.resolve(data); } });
        }
        if (s === 'error') return reply(500, {});
        if (s === 'ratelimited') return reply(429, {});
        if (s === 'none') return reply(200, { found: false });
        if (s === 'multiple') return reply(200, { suggestions: SAMPLE_MULTI, truncated: false });
        return reply(200, { found: true, result: SAMPLE_SINGLE });
      }
      return _fetch.apply(this, arguments);
    };
  </script>

  <script>
${js}
  </script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log('Wrote', path.relative(process.cwd(), OUT));
