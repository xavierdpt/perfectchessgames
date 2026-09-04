/* The shape of a game, opened from a game card's "Shape" button.
 *
 * Two readings of the same file the board viewer already loads, and neither needs anything
 * the file does not carry: the number of legal moves at each position is the length of that
 * position's own move list, and the score of every one of those moves is what the viewer
 * draws as a bar. So the panel is a graph of how much either side could do, and, underneath
 * it, the two sides' bars played forward one move at a time.
 *
 * The bar cells come from viewer.js (window.PCGGame), so a bar means here exactly what it
 * means on the board viewer and on the two activity pages: the balance in centipawns from
 * White's point of view, or a countable stack of bands for a mate.
 */
(function () {
  'use strict';

  var TICK = 600;                       // milliseconds a move holds at 1×
  var W = 1000, H = 300;                // the graph's own coordinates; it scales to the panel
  var ML = 46, MR = 14, MT = 16, MB = 30;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var root = null, parts = {}, plot = {};
  var positions = null, counts = [], frames = 0, frame = 0, mostMoves = 0;
  var timer = null, speed = 1, playing = false, lastFocus = null;

  function api() { return window.PCGGame; }        // viewer.js, whichever order it loaded in

  /* ---- the panel ---- */

  function build() {
    root = document.createElement('div');
    root.className = 'vw sh';
    root.hidden = true;
    root.innerHTML =
      '<div class="vw-backdrop" data-close="1"></div>' +
      '<div class="vw-panel sh-panel" role="dialog" aria-modal="true" ' +
           'aria-label="The shape of the game">' +
        '<div class="vw-head">' +
          '<h2 class="vw-title"></h2><span class="vw-ply"></span>' +
          '<button type="button" class="vw-close" data-close="1">Close</button>' +
        '</div>' +
        '<div class="sh-body">' +
          '<div class="sh-graph"></div>' +
          '<div class="sh-keys">' +
            '<span class="sh-key white">White</span>' +
            '<span class="sh-key black">Black</span>' +
            '<span class="sh-keys-note">legal moves at each ply, and the score of every one ' +
              'of them below</span>' +
          '</div>' +
          '<div class="sh-strips">' +
            '<div class="sh-strip" data-side="w">' +
              '<div class="sh-side"></div><div class="vw-mini"></div>' +
            '</div>' +
            '<div class="sh-strip" data-side="b">' +
              '<div class="sh-side"></div><div class="vw-mini"></div>' +
            '</div>' +
          '</div>' +
          '<div class="sh-transport">' +
            '<button type="button" data-go="first" title="First move (Home)">|&#9664;</button>' +
            '<button type="button" data-go="prev" title="Back one move (&#8592;)">&#9664;</button>' +
            '<button type="button" data-go="play" class="sh-play" ' +
                    'title="Play or pause (space)">&#9654; Play</button>' +
            '<button type="button" data-go="next" title="On one move (&#8594;)">&#9654;</button>' +
            '<button type="button" data-go="last" title="Last move (End)">&#9654;|</button>' +
            '<input type="range" class="sh-range" min="0" max="0" value="0" ' +
                   'aria-label="Move" disabled>' +
            '<span class="sh-at"></span>' +
            '<label class="sh-speed">Speed ' +
              '<select><option value="0.5">0.5&times;</option>' +
              '<option value="1" selected>1&times;</option>' +
              '<option value="2">2&times;</option></select></label>' +
          '</div>' +
          '<div class="sh-note"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    parts.title = root.querySelector('.vw-title');
    parts.sub = root.querySelector('.vw-ply');
    parts.graph = root.querySelector('.sh-graph');
    parts.strips = root.querySelector('.sh-strips');
    parts.note = root.querySelector('.sh-note');
    parts.play = root.querySelector('.sh-play');
    parts.range = root.querySelector('.sh-range');
    parts.at = root.querySelector('.sh-at');
    parts.w = side('w');
    parts.b = side('b');

    root.addEventListener('click', function (event) {
      if (event.target.dataset && event.target.dataset.close) close();
    });
    root.querySelectorAll('[data-go]').forEach(function (button) {
      button.addEventListener('click', function () { go(button.dataset.go); });
    });
    parts.range.addEventListener('input', function () {
      pause();
      show(Number(parts.range.value));
    });
    root.querySelector('.sh-speed select').addEventListener('change', function (event) {
      speed = Number(event.target.value);
      if (playing) { start(); }                    // the new rate takes effect at once
    });
    parts.graph.addEventListener('pointerdown', scrub);
    parts.graph.addEventListener('pointermove', function (event) {
      if (event.buttons === 1) { scrub(event); }
    });
    document.addEventListener('keydown', onKey);
  }

  function side(which) {
    var box = root.querySelector('.sh-strip[data-side="' + which + '"]');
    return { label: box.querySelector('.sh-side'), mini: box.querySelector('.vw-mini') };
  }

  /* ---- the graph ----
   * Inline SVG, because the site loads no libraries and this needs none. Both curves are
   * drawn against one ply axis, White's points on the even plies and Black's on the odd, so
   * the two read as one game rather than as two.
   */

  function niceStep(total) {
    var steps = [1, 2, 5, 10, 20, 25, 50, 100];
    for (var i = 0; i < steps.length; i++) {
      if (total / steps[i] <= 12) { return steps[i]; }
    }
    return 200;
  }

  function x(ply) {
    var last = counts.length - 1;
    return ML + (last > 0 ? ply / last : 0) * (W - ML - MR);
  }

  function y(count) {
    return H - MB - (count / plot.top) * (H - MT - MB);
  }

  function points(even) {
    var out = [];
    for (var i = even ? 0 : 1; i < counts.length; i += 2) {
      out.push(x(i).toFixed(1) + ',' + y(counts[i]).toFixed(1));
    }
    return out.join(' ');
  }

  function drawGraph() {
    plot.top = Math.max(10, Math.ceil(mostMoves / 10) * 10);
    var yStep = plot.top <= 20 ? 5 : 10;
    var moves = Math.ceil((counts.length - 1) / 2);
    var xStep = niceStep(moves);

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
              'aria-label="Legal moves available to each side at every ply">' +
      '<rect class="sh-plot" x="' + ML + '" y="' + MT + '" width="' + (W - ML - MR) +
      '" height="' + (H - MT - MB) + '"/>';

    for (var n = 0; n <= plot.top; n += yStep) {
      svg += '<line class="sh-grid" x1="' + ML + '" y1="' + y(n).toFixed(1) +
             '" x2="' + (W - MR) + '" y2="' + y(n).toFixed(1) + '"/>' +
             '<text class="sh-axis" x="' + (ML - 8) + '" y="' + (y(n) + 4).toFixed(1) +
             '" text-anchor="end">' + n + '</text>';
    }
    for (var move = xStep; move <= moves; move += xStep) {
      var ply = (move - 1) * 2;
      svg += '<line class="sh-grid soft" x1="' + x(ply).toFixed(1) + '" y1="' + MT +
             '" x2="' + x(ply).toFixed(1) + '" y2="' + (H - MB) + '"/>' +
             '<text class="sh-axis" x="' + x(ply).toFixed(1) + '" y="' + (H - MB + 17) +
             '" text-anchor="middle">' + move + '</text>';
    }

    // The white curve is drawn twice: a dark casing under a white stroke, or it would be a
    // pale line on a pale ground.
    svg += '<polyline class="sh-curve black" points="' + points(false) + '"/>' +
           '<polyline class="sh-curve casing" points="' + points(true) + '"/>' +
           '<polyline class="sh-curve white" points="' + points(true) + '"/>' +
           '<line class="sh-cursor" x1="0" y1="' + MT + '" x2="0" y2="' + (H - MB) + '"/>' +
           '<circle class="sh-dot white" r="4.5"/><circle class="sh-dot black" r="4"/>' +
           '<text class="sh-axis unit" x="' + ML + '" y="' + (MT - 4) + '">legal moves</text>' +
           '</svg>';
    parts.graph.innerHTML = svg;
    plot.cursor = parts.graph.querySelector('.sh-cursor');
    plot.dots = { w: parts.graph.querySelector('.sh-dot.white'),
                  b: parts.graph.querySelector('.sh-dot.black') };
  }

  function markGraph() {
    var white = frame * 2, black = white + 1;
    var at = x(Math.min(black, counts.length - 1));
    plot.cursor.setAttribute('x1', at);
    plot.cursor.setAttribute('x2', at);
    dot('w', white);
    dot('b', black);
  }

  function dot(which, ply) {
    var mark = plot.dots[which];
    if (ply >= counts.length) { mark.setAttribute('r', 0); return; }
    mark.setAttribute('r', which === 'w' ? 4.5 : 4);
    mark.setAttribute('cx', x(ply).toFixed(1));
    mark.setAttribute('cy', y(counts[ply]).toFixed(1));
  }

  function scrub(event) {
    if (!positions) { return; }
    // The svg fills its box at the viewBox's own ratio, so a client x maps straight onto it.
    var box = parts.graph.getBoundingClientRect();
    var at = ((event.clientX - box.left) / box.width) * W;
    var ply = Math.round(((at - ML) / (W - ML - MR)) * (counts.length - 1));
    pause();
    show(Math.floor(Math.max(0, Math.min(counts.length - 1, ply)) / 2));
  }

  /* ---- the two strips ----
   * The cells are kept between frames rather than rewritten: a cell that stays is a cell
   * whose height can be tweened, which is what makes this an animation and not a slideshow.
   * A mate cell is a stack of bands to be counted, so it is rebuilt — there is nothing in it
   * to slide.
   */

  function fill(cell, move, white) {
    var kind = move.mate ? 'mate' : 'cp';
    if (cell.dataset.kind !== kind || move.mate) {
      cell.innerHTML = api().cellContents(move, white);
      cell.dataset.kind = kind;
    } else {
      cell.lastChild.style.height = api().blackShare(move, white) + '%';
    }
    cell.title = move.san + ': ' + api().scoreLabel(move);
  }

  function strip(which, index) {
    var box = parts[which].mini;
    var label = parts[which].label;
    var name = which === 'w' ? 'White' : 'Black';
    var position = index < positions.length ? positions[index] : null;
    var moves = position ? position.moves : [];

    while (box.children.length > moves.length) { box.removeChild(box.lastChild); }
    while (box.children.length < moves.length) {
      var cell = document.createElement('div');
      cell.className = 'vw-cell';
      box.appendChild(cell);
    }
    moves.forEach(function (move, order) {
      var element = box.children[order];
      fill(element, move, index % 2 === 0);
      element.classList.toggle('played', order === position.played);
    });

    label.className = 'sh-side ' + (which === 'w' ? 'white' : 'black');
    label.innerHTML = '<b>' + name + '</b>' + (!position
      ? ' &#183; the game is over'
      : ' to move &#183; move ' + (Math.floor(index / 2) + 1) + ' &#183; ' +
        (moves.length ? moves.length + (moves.length === 1 ? ' legal move' : ' legal moves')
                      : 'no legal move — this is where the game ends'));
  }

  /* ---- the clock ---- */

  function show(next) {
    frame = Math.max(0, Math.min(frames - 1, next));
    strip('w', frame * 2);
    strip('b', frame * 2 + 1);
    markGraph();
    parts.range.value = String(frame);
    parts.at.textContent = 'move ' + (frame + 1) + ' of ' + frames;
    if (playing && frame === frames - 1) { pause(); }
    parts.play.innerHTML = frame === frames - 1 && !playing
      ? '&#8635; Replay' : (playing ? '&#10073;&#10073; Pause' : '&#9654; Play');
  }

  function start() {
    clearInterval(timer);
    playing = true;
    timer = setInterval(function () { show(frame + 1); }, TICK / speed);
    show(frame);
  }

  function pause() {
    clearInterval(timer);
    timer = null;
    playing = false;
    if (positions) { show(frame); }
  }

  function go(where) {
    if (where === 'first') { pause(); show(0); }
    else if (where === 'prev') { pause(); show(frame - 1); }
    else if (where === 'next') { pause(); show(frame + 1); }
    else if (where === 'last') { pause(); show(frames - 1); }
    else if (where === 'play') {
      if (playing) { pause(); }
      else { if (frame === frames - 1) { frame = 0; } start(); }
    }
  }

  function onKey(event) {
    if (!root || root.hidden) { return; }
    if (event.key === 'Escape') { close(); return; }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      go('play');
      return;
    }
    var map = { ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', End: 'last' };
    if (map[event.key]) { event.preventDefault(); go(map[event.key]); }
  }

  /* ---- opening and closing ---- */

  function open(name, title) {
    if (!root) { build(); }
    lastFocus = document.activeElement;
    positions = null;
    parts.title.textContent = title || name;
    parts.sub.textContent = '';
    parts.note.textContent = 'Loading…';
    parts.graph.innerHTML = '';
    parts.w.mini.innerHTML = parts.b.mini.innerHTML = '';
    parts.w.label.textContent = parts.b.label.textContent = '';
    parts.at.textContent = '';
    parts.range.disabled = true;
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    root.querySelector('.vw-close').focus();

    api().load(name).then(function (doc) {
      positions = api().decode(doc);
      counts = positions.map(function (position) { return position.moves.length; });
      mostMoves = counts.reduce(function (a, b) { return Math.max(a, b); }, 0);
      frames = Math.ceil(positions.length / 2);
      frame = 0;
      parts.title.textContent = doc.t;
      parts.sub.textContent = (positions.length - 1) + ' plies · ' + mostMoves +
                              ' legal moves at the most';
      parts.note.textContent = '';
      parts.range.max = String(frames - 1);
      parts.range.disabled = false;
      // A cell keeps its width from move to move, so the length of a strip is the number of
      // moves that side had: the strip says the same thing as the curve above it.
      parts.strips.style.setProperty('--cw', (100 / Math.max(1, mostMoves)) + '%');
      drawGraph();
      if (reduced) { pause(); } else { start(); }
    }).catch(function (error) {
      parts.note.textContent = 'Could not load this game: ' + error.message;
    });
  }

  function close() {
    if (!root || root.hidden) { return; }
    pause();
    root.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) { lastFocus.focus(); }
  }

  /* The card names its game the way the board viewer's button does: the index card is the
     game and carries its id, an openings card is a move a game was played from. */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.open-shape');
    if (!button) { return; }
    var card = button.closest('[data-game], .game');
    if (!card) { return; }
    open(card.dataset.game || card.id, card.dataset.title);
  });
})();
