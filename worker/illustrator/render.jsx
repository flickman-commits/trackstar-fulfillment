// Trackstar render script. Runs inside Illustrator (ExtendScript, so old JavaScript: no const, no JSON).
//
// The worker writes <this folder>/current.json before running this, with:
//   { template, out, preset, artboard, spec: { size, name, bib, time, pace, noTime, date, condition, temp, photo } }
// template is a COPY of the race's production file (the live file is never opened here),
// out is a path without extension, artboard is an optional word the artboard's name must
// contain (a file with two colorways), photo is a local file path or null.
//
// It finds the six personalization frames on the order's artboard, fills them, places the
// photo, exports out.pdf (the shop's preset, 1/4" bleed) and out.png, writes result.json,
// and closes without saving.
//
// Production files are working files, not clean templates: designers leave the last
// order's name, bib and time in the frames, sometimes a customer photo, and a frame or
// two end up on the wrong layer. So frames are recognised by what kind of text they
// hold, on any layer of the artboard, and leftover images are removed first.
#target illustrator

var HERE = new File($.fileName).parent;
var RESULT = new File(HERE + '/result.json');
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

function readJson(f) { f.encoding = 'UTF-8'; f.open('r'); var s = f.read(); f.close(); return eval('(' + s + ')'); }
function writeResult(obj) {
  var parts = [];
  for (var k in obj) parts.push('"' + k + '":' + (typeof obj[k] == 'string' ? '"' + obj[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"' : obj[k]));
  RESULT.encoding = 'UTF-8'; RESULT.open('w'); RESULT.write('{' + parts.join(',') + '}'); RESULT.close();
}
function trim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }
function sizeKey(name) { var m = /(\d+)\s*x\s*(\d+)/i.exec(name); return m ? m[1] + 'x' + m[2] : null; }
function inside(bounds, rect) { var cx = (bounds[0] + bounds[2]) / 2, cy = (bounds[1] + bounds[3]) / 2; return cx >= rect[0] && cx <= rect[2] && cy <= rect[1] && cy >= rect[3]; }
var BREAK = '\u0003'; // Illustrator's forced line break

// What kind of personalization a frame holds, from its current text (placeholder or a past order).
function kindOf(contents) {
  var s = trim(String(contents).replace(/\u0003/g, ' '));
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return 'time';
  if (/\d{1,2}:\d{2}\s*\/\s*mi/i.test(s)) return 'pace';
  if (/^\d{1,2}\.\d{2}\.\d{2}$/.test(s)) return 'date';
  if (/\u00B0/.test(s)) return 'weather';
  if (/^\d{1,6}$/.test(s) || /\bBIB\b/i.test(s)) return 'bib';
  if (/^[A-Za-z][A-Za-z .'\-]*$/.test(s) && s.length <= 60) return 'name';
  return null;
}

var doc = null;
try {
  var job = readJson(new File(HERE + '/current.json'));
  var spec = job.spec;
  doc = app.open(new File(job.template));

  // The artboard: right size, and the colorway word if the file has more than one.
  var abIndex = -1;
  for (var a = 0; a < doc.artboards.length; a++) {
    var abName = doc.artboards[a].name;
    if (sizeKey(abName) != spec.size) continue;
    if (job.artboard && abName.toLowerCase().indexOf(String(job.artboard).toLowerCase()) < 0) continue;
    abIndex = a;
  }
  if (abIndex < 0) throw new Error('No artboard for size ' + spec.size + (job.artboard ? ' (' + job.artboard + ')' : ''));
  var ab = doc.artboards[abIndex].artboardRect;

  // Every text frame on this artboard that looks like a personalization field, whatever layer it is on.
  // The race title and START/FINISH labels never match: titles contain the race name on locked assets
  // in a size far larger than any field, and labels are all caps; both are excluded by size and case.
  // A placeholder ("Runner Name", "BIB # HERE") wins over a past order's value when a field
  // appears twice; the loser is hidden, because a leftover name or bib must never print.
  function isPlaceholder(kind, text) {
    var t = trim(String(text));
    if (kind == 'name') return /name/i.test(t);
    if (kind == 'bib') return /BIB/i.test(t);
    return false;
  }
  var frames = {}, dupes = [], hiddenLeftovers = 0;
  for (var l = 0; l < doc.layers.length; l++) {
    var L = doc.layers[l];
    if (L.name == 'GUIDES') continue;
    var wasLocked = L.locked; if (wasLocked) L.locked = false;
    for (var t = 0; t < L.textFrames.length; t++) {
      var tf = L.textFrames[t];
      if (!inside(tf.geometricBounds, ab)) continue;
      var kind = kindOf(tf.contents);
      if (!kind) continue;
      if (kind == 'name') {
        var txt = trim(String(tf.contents).replace(/\u0003/g, ' '));
        // Not a name: an all-caps label (START, FINISH), or the race title ("Chicago", "Boston", "New York City Marathon").
        if (/^[A-Z\s]+$/.test(txt) || /marathon|half|miler|ultra/i.test(txt)) continue;
        if (spec.race && txt.length >= 4 && String(spec.race).toLowerCase().indexOf(txt.toLowerCase()) >= 0) continue;
      }
      if (frames[kind]) {
        var keepNew = isPlaceholder(kind, tf.contents) && !isPlaceholder(kind, frames[kind].contents);
        var keepOld = isPlaceholder(kind, frames[kind].contents) && !isPlaceholder(kind, tf.contents);
        if (keepNew) { frames[kind].hidden = true; frames[kind] = tf; hiddenLeftovers++; continue; }
        if (keepOld) { tf.hidden = true; hiddenLeftovers++; continue; }
        dupes.push(kind); continue;
      }
      frames[kind] = tf;
    }
  }
  var missing = [];
  var need = ['name', 'bib', 'time', 'pace', 'date', 'weather'];
  for (var n = 0; n < need.length; n++) if (!frames[need[n]]) missing.push(need[n]);
  if (missing.length) throw new Error('Could not find the ' + missing.join(', ') + ' frame' + (missing.length > 1 ? 's' : '') + ' on the ' + spec.size + ' artboard');
  if (dupes.length) throw new Error('More than one ' + dupes.join(', ') + ' frame on the ' + spec.size + ' artboard');

  var notes = [];
  if (hiddenLeftovers) notes.push(hiddenLeftovers + ' leftover text frame' + (hiddenLeftovers > 1 ? 's' : '') + ' hidden');

  // Leftover images from a past order, anywhere but the locked artwork.
  var photoLayer = null; try { photoLayer = doc.layers.getByName('PHOTO LAYER'); } catch (e) {}
  var removed = 0;
  for (var l2 = 0; l2 < doc.layers.length; l2++) {
    var L2 = doc.layers[l2];
    if (L2.name == 'LOCKED ASSETS' || L2.name == 'GUIDES') continue;
    var wasLocked2 = L2.locked; if (wasLocked2) L2.locked = false;
    for (var p = L2.placedItems.length - 1; p >= 0; p--) { L2.placedItems[p].remove(); removed++; }
    for (var r = L2.rasterItems.length - 1; r >= 0; r--) { L2.rasterItems[r].remove(); removed++; }
  }
  if (removed) notes.push(removed + ' leftover image' + (removed > 1 ? 's' : '') + ' removed');

  // The left margin is the designer's own guide: the leftmost vertical guide on this artboard.
  var margin = null;
  try {
    var guides = doc.layers.getByName('GUIDES');
    for (var gi = 0; gi < guides.groupItems.length; gi++) {
      var grp = guides.groupItems[gi];
      if (!inside(grp.geometricBounds, ab)) continue;
      for (var pi = 0; pi < grp.pathItems.length; pi++) {
        var pb = grp.pathItems[pi].geometricBounds;
        if (Math.abs(pb[0] - pb[2]) < 1 && (margin === null || pb[0] < margin)) margin = pb[0];
      }
    }
  } catch (e) {}
  if (margin === null) margin = frames.weather.geometricBounds[0];

  // Name: widen the box leftward to the margin first, so a long name is not clipped.
  var nameFrame = frames.name;
  if (nameFrame.kind == TextType.AREATEXT) {
    var tp = nameFrame.textPath, grow = tp.left - margin;
    if (grow > 0) { tp.width = tp.width + grow; tp.left = margin; }
  }
  nameFrame.contents = spec.name;
  if (nameFrame.kind == TextType.AREATEXT) {
    var orig = nameFrame.textRange.characterAttributes.size, tries = 0;
    while (tries < 8) {
      var laid = 0; for (var li = 0; li < nameFrame.lines.length; li++) laid += nameFrame.lines[li].characters.length;
      if (laid >= nameFrame.textRange.characters.length && nameFrame.lines.length <= 1) break;
      nameFrame.textRange.characterAttributes.size = nameFrame.textRange.characterAttributes.size - orig * 0.05; tries++;
    }
    if (tries) notes.push('name shrunk ' + tries + ' step' + (tries == 1 ? '' : 's'));
  }

  frames.bib.contents = String(spec.bib);
  frames.date.contents = spec.date;

  // Weather keeps the frame's own break between condition and temperature ("Sunny" / "63°",
  // or "Cloudy " / "45°" where the designer left a space before the break).
  var w = String(frames.weather.contents), wb = w.indexOf(BREAK);
  var wSep = wb >= 0 ? w.substring(0, wb).replace(/^\S.*?(\s*)$/, '$1') + BREAK : ' ';
  frames.weather.contents = spec.condition + wSep + String(spec.temp).replace(/F$/, '');

  if (spec.noTime) {
    frames.time.hidden = true; frames.pace.hidden = true; notes.push('no time');
  } else {
    frames.time.contents = spec.time;
    // Pace keeps whatever follows the number in this template: " / mi" on one line or a break then "/ mi".
    var pc = String(frames.pace.contents), tail = pc.replace(/^\s*\d{1,2}:\d{2}/, '');
    if (!/\/\s*mi/i.test(tail)) tail = ' / mi';
    frames.pace.contents = spec.pace + tail;
  }

  // Photo: a clipped group (square clipping path over a placeholder) per size on PHOTO LAYER.
  // The customer cropped it 1:1, so it goes in at the clipping path's exact bounds.
  if (spec.photo) {
    if (!photoLayer) throw new Error('Template has no PHOTO LAYER');
    photoLayer.visible = true; photoLayer.locked = false;
    var group = null;
    for (var g = 0; g < photoLayer.groupItems.length; g++) if (inside(photoLayer.groupItems[g].geometricBounds, ab)) group = photoLayer.groupItems[g];
    if (!group) throw new Error('No photo group on the ' + spec.size + ' artboard');
    var clip = null;
    for (var q = 0; q < group.pathItems.length; q++) { if (group.pathItems[q].clipping) clip = group.pathItems[q]; else group.pathItems[q].hidden = true; }
    if (!clip) throw new Error('No clipping path in the photo group');
    var cb = clip.geometricBounds;
    doc.activeLayer = photoLayer; group.locked = false; group.hidden = false;
    var img = group.placedItems.add();
    img.file = new File(spec.photo);
    img.width = cb[2] - cb[0]; img.height = cb[1] - cb[3];
    img.position = [cb[0], cb[1]];
    img.move(group, ElementPlacement.PLACEATEND);
    img.embed();
    notes.push('photo placed');
  } else if (photoLayer) {
    photoLayer.visible = false;
  }

  doc.artboards.setActiveArtboardIndex(abIndex);
  var pdf = new PDFSaveOptions();
  pdf.pDFPreset = job.preset || 'TRACKSTAR DEFAULT';
  pdf.saveMultipleArtboards = true;
  pdf.artboardRange = String(abIndex + 1);
  pdf.preserveEditability = false;
  pdf.bleedLink = false;
  pdf.bleedOffsetRect = [18, 18, 18, 18];
  doc.saveAs(new File(job.out + '.pdf'), pdf);

  var png = new ExportOptionsPNG24();
  png.artBoardClipping = true; png.antiAliasing = true; png.horizontalScale = 100; png.verticalScale = 100;
  doc.exportFile(new File(job.out + '.png'), ExportType.PNG24, png);

  doc.close(SaveOptions.DONOTSAVECHANGES);
  writeResult({ ok: true, notes: notes.join('; ') });
} catch (err) {
  try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
  writeResult({ ok: false, error: String(err.message || err) });
}
