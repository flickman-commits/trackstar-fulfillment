// Shared by render.jsx and check.jsx: how a production file is read.
// ExtendScript (old JavaScript): no const, no JSON, no Array.indexOf.

var BREAK = '\u0003'; // Illustrator's forced line break

function trim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }
function sizeKey(name) { var m = /(\d+)\s*x\s*(\d+)/i.exec(name); return m ? m[1] + 'x' + m[2] : null; }
function inside(bounds, rect) { var cx = (bounds[0] + bounds[2]) / 2, cy = (bounds[1] + bounds[3]) / 2; return cx >= rect[0] && cx <= rect[2] && cy <= rect[1] && cy >= rect[3]; }

// What kind of personalization a frame holds, from its current text (a placeholder or a past order).
function kindOf(contents) {
  var s = trim(String(contents).replace(/\u0003/g, ' '));
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return 'time';
  if (/\d{1,2}:\d{2}\s*\/\s*mi/i.test(s)) return 'pace';
  if (/^\d{1,2}\.\d{2}\.\d{2}$/.test(s)) return 'date';
  if (/^(19|20)\d{2}$/.test(s)) return 'year';
  if (/\d\s*°\s*[NSEW]\b/i.test(s)) return null;   // coordinates on the artwork, not weather
  if (/°/.test(s)) return 'weather';
  if (/^\d{1,6}$/.test(s) || /\bBIB\b/i.test(s)) return 'bib';
  if (/^[A-Za-z][A-Za-z .'\-]*$/.test(s) && s.length <= 40 && !/\.$/.test(s) && s.split(/\s+/).length <= 5) return 'name';
  return null;
}

// A text that is not a runner's name: an all-caps label (START, FINISH) or the race title.
function notAName(text, raceName) {
  var txt = trim(String(text).replace(/\u0003/g, ' '));
  if (/^[A-Z\s]+$/.test(txt) || /marathon|half|miler|ultra/i.test(txt)) return true;
  if (/^(start|finish)$/i.test(txt)) return true;
  if (txt.split(/\s+/).length < 2 && !/name/i.test(txt)) return true;   // a lone word is a label, not a runner
  if (raceName && txt.length >= 4 && String(raceName).toLowerCase().indexOf(txt.toLowerCase()) >= 0) return true;
  return false;
}

// A placeholder ("Runner Name", "BIB # HERE") beats a past order's value when a field appears twice.
function isPlaceholder(kind, text) {
  var t = trim(String(text));
  if (kind == 'name') return /name/i.test(t);
  if (kind == 'bib') return /BIB/i.test(t);
  return false;
}

function alignmentOf(frame) {
  var just = null; try { just = frame.textRange.paragraphAttributes.justification; } catch (e) { return 'unknown'; }
  if (just == Justification.RIGHT || just == Justification.FULLJUSTIFYLASTLINERIGHT) return 'right';
  if (just == Justification.LEFT || just == Justification.FULLJUSTIFYLASTLINELEFT || just == Justification.FULLJUSTIFY) return 'left';
  if (just == Justification.CENTER || just == Justification.FULLJUSTIFYLASTLINECENTER) return 'center';
  return 'unknown';
}

// The personalization frames on one artboard, by kind, with duplicates resolved toward
// placeholders. Returns { frames: {kind: frame}, leftovers: [frames to hide], dupes: [kinds] }.
// Illustrator hands out a fresh wrapper object each time, so === cannot tell two references to one
// frame apart. Compare what they point at instead.
function sameItem(a, b) {
  try {
    var ga = a.geometricBounds, gb = b.geometricBounds;
    return String(a.contents) == String(b.contents) && Math.abs(ga[0] - gb[0]) < 0.01 && Math.abs(ga[1] - gb[1]) < 0.01 && Math.abs(ga[2] - gb[2]) < 0.01;
  } catch (e) { return false; }
}

function layerOf(item) { var p = item; while (p && p.typename != 'Layer') p = p.parent; while (p && p.parent && p.parent.typename == 'Layer') p = p.parent; return p; }

function collectFrames(doc, ab, raceName) {
  var frames = {}, leftovers = [], dupes = [];
  // doc.textFrames reaches frames inside groups too, which layer.textFrames does not.
  for (var t = 0; t < doc.textFrames.length; t++) {
    var tf = doc.textFrames[t];
    var L = layerOf(tf);
    if (!L || L.name == 'GUIDES') continue;
    // A frame the designer hid, or a hidden layer, is not on the print and is not a field.
    var hiddenItem = false; try { hiddenItem = tf.hidden || !L.visible; } catch (e) {}
    if (hiddenItem) continue;
    if (!inside(tf.geometricBounds, ab)) continue;
    var kind = kindOf(tf.contents);
    if (!kind) continue;
    if (kind == 'name' && notAName(tf.contents, raceName)) continue;
    if (L.locked) L.locked = false;
    if (frames[kind]) {
      var keepNew = isPlaceholder(kind, tf.contents) && !isPlaceholder(kind, frames[kind].contents);
      var keepOld = isPlaceholder(kind, frames[kind].contents) && !isPlaceholder(kind, tf.contents);
      if (keepNew) { leftovers.push(frames[kind]); frames[kind] = tf; continue; }
      if (keepOld) { leftovers.push(tf); continue; }
      dupes.push(kind); continue;
    }
    frames[kind] = tf;
  }
  // A four-digit "year" on a design that carries a date is a bib number (2047 is a bib, not a year).
  if (frames.year && frames.date) {
    if (!frames.bib) { frames.bib = frames.year; } else { leftovers.push(frames.year); }
    delete frames.year;
  }
  // Two past orders' names and no placeholder: the name sits with the bib, so the nearer one is the
  // live frame and the other is a leftover.
  var ambiguousName = false;
  for (var d = 0; d < dupes.length; d++) if (dupes[d] == 'name') ambiguousName = true;
  if (ambiguousName && frames.bib) {
    var bibB = frames.bib.geometricBounds, best = null, bestDist = 1e9, candidates = [frames.name];
    for (var t2 = 0; t2 < doc.textFrames.length; t2++) {
      var c = doc.textFrames[t2];
      var cHidden = false; try { cHidden = c.hidden || !layerOf(c).visible; } catch (e) {}
      if (cHidden || sameItem(c, frames.name) || !inside(c.geometricBounds, ab) || kindOf(c.contents) != 'name' || notAName(c.contents, raceName)) continue;
      candidates.push(c);
    }
    for (var ci = 0; ci < candidates.length; ci++) {
      var gb = candidates[ci].geometricBounds;
      var dist = Math.abs(((gb[1] + gb[3]) / 2) - ((bibB[1] + bibB[3]) / 2)) + Math.abs(gb[2] - bibB[2]) * 0.25;
      if (dist < bestDist) { bestDist = dist; best = candidates[ci]; }
    }
    for (var cj = 0; cj < candidates.length; cj++) if (!sameItem(candidates[cj], best)) leftovers.push(candidates[cj]);
    frames.name = best;
    var kept = []; for (var dk = 0; dk < dupes.length; dk++) if (dupes[dk] != 'name') kept.push(dupes[dk]);
    dupes = kept;
  }
  return { frames: frames, leftovers: leftovers, dupes: dupes };
}

// Which artboard renders this order: the right size, then the template's rules
// (templates.json): artboard = a word the name must contain (a colorway),
// artboardExclude = a word it must not ("copy"), photoArtboard = a word that
// marks the variant with a photo window, used only when the order has a photo.
function pickArtboard(doc, size, rules, hasPhoto) {
  var idx = -1;
  for (var a = 0; a < doc.artboards.length; a++) {
    var name = doc.artboards[a].name, lower = name.toLowerCase();
    if (sizeKey(name) != size) continue;
    if (rules.artboard && lower.indexOf(String(rules.artboard).toLowerCase()) < 0) continue;
    if (rules.artboardExclude && lower.indexOf(String(rules.artboardExclude).toLowerCase()) >= 0) continue;
    if (rules.photoArtboard) {
      var isPhotoBoard = lower.indexOf(String(rules.photoArtboard).toLowerCase()) >= 0;
      if (isPhotoBoard != !!hasPhoto) continue;
    }
    idx = a;
  }
  return idx;
}

// The margin guides on an artboard: the leftmost and rightmost vertical guides on the GUIDES layer.
function marginsOf(doc, ab) {
  var marginL = null, marginR = null;
  try {
    var guides = doc.layers.getByName('GUIDES');
    for (var gi = 0; gi < guides.groupItems.length; gi++) {
      var grp = guides.groupItems[gi];
      if (!inside(grp.geometricBounds, ab)) continue;
      for (var pi = 0; pi < grp.pathItems.length; pi++) {
        var pb = grp.pathItems[pi].geometricBounds;
        if (Math.abs(pb[0] - pb[2]) < 1) {
          if (marginL === null || pb[0] < marginL) marginL = pb[0];
          if (marginR === null || pb[0] > marginR) marginR = pb[0];
        }
      }
    }
  } catch (e) {}
  return { left: marginL, right: marginR };
}

// The photo window on an artboard: a clipped group on PHOTO LAYER whose clipping path is roughly square.
function photoWindowOf(doc, ab) {
  var photoLayer = null; try { photoLayer = doc.layers.getByName('PHOTO LAYER'); } catch (e) { return null; }
  var group = null;
  for (var g = 0; g < photoLayer.groupItems.length; g++) if (inside(photoLayer.groupItems[g].geometricBounds, ab)) group = photoLayer.groupItems[g];
  if (!group) return null;
  var clip = null;
  for (var q = 0; q < group.pathItems.length; q++) if (group.pathItems[q].clipping) clip = group.pathItems[q];
  return clip ? { layer: photoLayer, group: group, clip: clip } : null;
}
