// Trackstar render script. Runs inside Illustrator (ExtendScript, so old JavaScript: no const, no JSON).
//
// The worker writes <this folder>/current.json before running this, with:
//   { template, out, spec: { size, name, bib, time, pace, noTime, date, condition, temp, photo } }
// template is a COPY of the race's production file (the live file is never opened here),
// out is a path without extension, photo is a local file path or null.
//
// It fills the named text frames for the order's size, places the photo, exports
// out.pdf (the shop's own preset, 1/4" bleed) and out.png (a preview), writes
// result.json, and closes the document without saving.
//
// Frames are found by name, "<size>_<field>" (12x18_name, 8x10_bib, ...). A
// template whose frames are not named yet is named on the fly by what the
// placeholder says ("Runner Name", "BIB # HERE", "3:19:10", "7:36 / mi",
// "10.11.26", "Sunny" + "60°"). That naming happens on the copy, so no
// production file is ever written.
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
function fieldOf(s) {
  if (/BIB/i.test(s)) return 'bib';
  if (/Runner Name/i.test(s)) return 'name';
  if (/\/ ?mi/i.test(s)) return 'pace';
  if (/°/.test(s)) return 'weather';
  if (/^\d{1,2}\.\d{2}\.\d{2}$/.test(trim(s))) return 'date';
  if (/^\d:\d\d:\d\d$/.test(trim(s))) return 'time';
  return null;
}
function inside(bounds, rect) { var cx = (bounds[0] + bounds[2]) / 2, cy = (bounds[1] + bounds[3]) / 2; return cx >= rect[0] && cx <= rect[2] && cy <= rect[1] && cy >= rect[3]; }

var doc = null;
try {
  var job = readJson(new File(HERE + '/current.json'));
  var spec = job.spec;
  doc = app.open(new File(job.template));

  // The artboard for this size, by the size in its name.
  var abIndex = -1;
  for (var a = 0; a < doc.artboards.length; a++) if (sizeKey(doc.artboards[a].name) == spec.size) abIndex = a;
  if (abIndex < 0) throw new Error('No artboard named for size ' + spec.size);
  var ab = doc.artboards[abIndex].artboardRect;

  // Name the personalization frames if the template has not been prepared.
  var layer = doc.layers.getByName('PERSONALIZE LAYER');
  var named = 0;
  for (var i = 0; i < layer.textFrames.length; i++) {
    var tf = layer.textFrames[i];
    if (tf.name) { named++; continue; }
    var sz = null;
    for (var b = 0; b < doc.artboards.length; b++) if (inside(tf.geometricBounds, doc.artboards[b].artboardRect)) sz = sizeKey(doc.artboards[b].name);
    var fld = fieldOf(tf.contents);
    if (sz && fld) { tf.name = sz + '_' + fld; named++; }
  }
  var notes = [];
  function frame(field) {
    try { return doc.textFrames.getByName(spec.size + '_' + field); } catch (e) { throw new Error('Template has no frame for ' + spec.size + '_' + field); }
  }

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
  if (margin === null) margin = frame('weather').geometricBounds[0];

  // Name: widen the box leftward to the margin first, so a long name is not clipped.
  var nameFrame = frame('name');
  var tp = nameFrame.textPath, grow = tp.left - margin;
  if (grow > 0) { tp.width = tp.width + grow; tp.left = margin; }
  nameFrame.contents = spec.name;
  var orig = nameFrame.textRange.characterAttributes.size, tries = 0;
  while (tries < 8) {
    var laid = 0; for (var li = 0; li < nameFrame.lines.length; li++) laid += nameFrame.lines[li].characters.length;
    if (laid >= nameFrame.textRange.characters.length && nameFrame.lines.length <= 1) break;
    nameFrame.textRange.characterAttributes.size = nameFrame.textRange.characterAttributes.size - orig * 0.05; tries++;
  }
  if (tries) notes.push('name shrunk ' + tries + ' step' + (tries == 1 ? '' : 's'));

  frame('bib').contents = String(spec.bib);
  frame('date').contents = spec.date;
  frame('weather').contents = spec.condition + '\u0003' + String(spec.temp).replace(/F$/, '');
  if (spec.noTime) {
    // The customer asked for no finish time: time and pace come off the print.
    frame('time').hidden = true; frame('pace').hidden = true; notes.push('no time');
  } else {
    frame('time').contents = spec.time;
    frame('pace').contents = spec.pace + ' / mi';
  }

  // Photo: per size, a clipped group (square clipping path over a placeholder) on PHOTO LAYER.
  // The customer cropped it 1:1, so it goes in at the clipping path's exact bounds.
  var photoLayer = doc.layers.getByName('PHOTO LAYER');
  if (spec.photo) {
    var group = null;
    for (var g = 0; g < photoLayer.groupItems.length; g++) if (inside(photoLayer.groupItems[g].geometricBounds, ab)) group = photoLayer.groupItems[g];
    if (!group) throw new Error('No photo group on the ' + spec.size + ' artboard');
    var clip = null;
    for (var p = 0; p < group.pathItems.length; p++) { if (group.pathItems[p].clipping) clip = group.pathItems[p]; else group.pathItems[p].hidden = true; }
    if (!clip) throw new Error('No clipping path in the photo group');
    var cb = clip.geometricBounds;
    doc.activeLayer = photoLayer; group.locked = false;
    var img = group.placedItems.add();
    img.file = new File(spec.photo);
    img.width = cb[2] - cb[0]; img.height = cb[1] - cb[3];
    img.position = [cb[0], cb[1]];
    img.move(group, ElementPlacement.PLACEATEND);
    img.embed();
    notes.push('photo placed');
  } else {
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
  writeResult({ ok: true, notes: notes.join('; '), framesNamed: named });
} catch (err) {
  try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
  writeResult({ ok: false, error: String(err.message || err) });
}
