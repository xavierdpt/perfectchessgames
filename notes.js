/* The position notes (task-position-notes.md), shared by the pages that show them.
 *
 * A note belongs to a position, so notes.json holds them by FEN, and a page looks one up by the
 * position it is showing. A note is a few paragraphs, `a`, and the moves it features, `m`, in its
 * own order. Moves in the paragraphs are links in brackets, `[Nf6]` or `[Nf6 c4 g6]`, from the
 * note's position; the site build has played each of them through the server (`l`, keyed by the
 * link's text: `u` its moves as uci, `f` the FEN it ends on), since no page here knows the rules.
 * A link the build could not play is left as plain text.
 *
 * The evals are the ones the note was written from, from White's point of view, in centipawns or
 * as a mate distance signed by who mates: not the minibars' scores, which are the mover's.
 */
(function () {
  'use strict';

  var FILES = 'abcdefgh';
  var LINK = /\[([^\]]+)\]/g;
  var pending = null;

  function load() {
    if (!pending) {
      pending = fetch('notes.json').then(function (response) {
        return response.ok ? response.json() : {};
      }).catch(function () { return {}; });
    }
    return pending;
  }

  function escape(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function paragraph(text, links) {
    var html = '', last = 0, match;
    LINK.lastIndex = 0;
    while ((match = LINK.exec(text)) !== null) {
      html += escape(text.slice(last, match.index));
      var link = match[1];
      html += links[link]
        ? '<a href="#" class="nt-link" data-link="' + escape(link) + '">' + escape(link) + '</a>'
        : '<span class="nt-move">' + escape(link) + '</span>';
      last = LINK.lastIndex;
    }
    return html + escape(text.slice(last));
  }

  // Pawns from White's side, as the note was written: +0.32, −1.50, #3 (White mates), #-3.
  function evalLabel(move) {
    if (move.v === undefined) return '';
    if (move.x) return '#' + move.v;
    var pawns = move.v / 100;
    return (pawns > 0 ? '+' : pawns < 0 ? '−' : '') + Math.abs(pawns).toFixed(2);
  }

  function render(note) {
    var links = note.l || {};
    var html = (note.a || []).map(function (text) {
      return '<p>' + paragraph(text, links) + '</p>';
    }).join('');
    if (note.m && note.m.length) {
      html += '<ul class="nt-moves">' + note.m.map(function (move) {
        var label = evalLabel(move);
        var named = [move.n, move.e].filter(Boolean).map(escape).join(', ');
        return '<li><b>' + escape(move.s) + (move.k ? escape(move.k) : '') + '</b>' +
          (label ? ' <span class="nt-eval">' + label + '</span>' : '') +
          (named ? ' <span class="nt-name">' + named + '</span>' : '') +
          (move.t ? move.t.map(function (text) {
            return ' <span class="nt-text">' + paragraph(text, links) + '</span>';
          }).join('') : '') +
          '</li>';
      }).join('') + '</ul>';
    }
    return html;
  }

  function square(name) {
    return FILES.indexOf(name[0]) + 8 * (Number(name[1]) - 1);
  }

  // A link's move, as uci, in the shape the viewer applies to its board.
  function move(uci) {
    return { from: square(uci.slice(0, 2)), to: square(uci.slice(2, 4)), promo: uci[4] || null };
  }

  var api = { load: load, render: render, move: move, evalLabel: evalLabel };
  if (typeof window !== 'undefined') window.PCGNotes = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
