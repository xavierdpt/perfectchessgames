/* What the two activities have in common.
 *
 * They are the same page with a different question in it: a position out of the database, a
 * ladder of levels to climb, and — once the answer is in — the score of every legal move,
 * drawn as the bars the game viewer draws. Everything here is that frame. What is asked, and
 * what counts as an answer, is in mate.js and winning.js.
 *
 * The move tokens are the ones make-pgn-index.py writes; the encoding is documented there,
 * above DIGITS. A file whose positions are played on carries the two squares of each move so
 * that a click can be matched to one; a file whose positions are only looked at does not, and
 * `moves()` is told which shape it is reading. Nothing here knows the rules of chess: a move
 * is looked up in its position's own list, and applying it to the board is three special
 * cases — castling, en passant, promotion.
 */
window.PCG = (function () {
  'use strict';

  var DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var FILES = 'abcdefgh';

  function d1(ch) { return DIGITS.indexOf(ch); }
  function d12(pair) { return DIGITS.indexOf(pair[0]) * 64 + DIGITS.indexOf(pair[1]); }

  /* ---- a position out of an activity file ---- */

  function moves(puzzle, squares) {
    var head = squares ? 6 : 4;
    return puzzle.m.split(' ').map(function (token) {
      var flags = token.slice(head);
      var promo = flags.match(/[qrbn]/);
      return {
        san: puzzle.d[d12(token.slice(0, 2))],
        from: squares ? d1(token[2]) : -1,
        to: squares ? d1(token[3]) : -1,
        score: d12(token.slice(head - 2, head)) - 2048,
        mate: flags.indexOf('!') >= 0,
        promo: promo ? promo[0] : null
      };
    });
  }

  function whiteToMove(puzzle) { return puzzle.f.split(' ')[1] !== 'b'; }

  function applyMove(board, move) {
    var next = board.slice();
    var piece = next[move.from];
    var fromFile = move.from % 8, toFile = move.to % 8;
    var fromRank = Math.floor(move.from / 8), toRank = Math.floor(move.to / 8);

    // Castling: the king crosses two files, and the rook lands on the square it passed.
    if ((piece === 'K' || piece === 'k') && Math.abs(toFile - fromFile) === 2) {
      var side = toFile > fromFile ? 7 : 0;
      next[toRank * 8 + (toFile > fromFile ? 5 : 3)] = next[toRank * 8 + side];
      next[toRank * 8 + side] = ' ';
    }
    // En passant: a pawn that leaves its file onto an empty square takes the pawn beside it.
    if ((piece === 'P' || piece === 'p') && fromFile !== toFile && next[move.to] === ' ') {
      next[fromRank * 8 + toFile] = ' ';
    }
    next[move.to] = move.promo
      ? (piece === 'P' ? move.promo.toUpperCase() : move.promo)
      : piece;
    next[move.from] = ' ';
    return next;
  }

  /* ---- the board ---- */

  // Rebuilt for each position, because a position with Black to move may be drawn the other
  // way up and the coordinates have to turn with it.
  function board(element, flipped) {
    element.textContent = '';
    var squares = new Array(64);
    for (var row = 0; row < 9; row++) {
      for (var col = 0; col < 9; col++) {
        var cell = document.createElement('div');
        if (col === 0 || row === 8) {
          cell.className = 'vw-co';
          if (col > 0) cell.textContent = flipped ? FILES[8 - col] : FILES[col - 1];
          else if (row < 8) cell.textContent = String(flipped ? row + 1 : 8 - row);
        } else {
          var file = flipped ? 8 - col : col - 1;
          var rank = flipped ? row : 7 - row;
          var index = rank * 8 + file;
          cell.className = 'vw-sq ' + ((rank + file) % 2 ? 'lt' : 'dk');
          cell.dataset.sq = String(index);
          squares[index] = cell;
        }
        element.appendChild(cell);
      }
    }
    return squares;
  }

  // marks: the move that led here (from, to), the square picked up (origin), where it may go
  // (dest), and the pieces that have somewhere to go at all (pick).
  function paint(squares, pieces, marks) {
    marks = marks || {};
    var dest = marks.dest || {}, pick = marks.pick || {};
    for (var i = 0; i < 64; i++) {
      var piece = pieces[i];
      squares[i].className = 'vw-sq ' + ((Math.floor(i / 8) + (i % 8)) % 2 ? 'lt' : 'dk') +
        (piece === ' ' ? '' : ' pc-' +
          (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase()) +
        (marks.from === i ? ' from' : '') +
        (marks.to === i ? ' to' : '') +
        (marks.origin === i ? ' origin' : '') +
        (dest[i] ? ' dest' + (piece === ' ' ? '' : ' occupied') : '') +
        (pick[i] ? ' pick' : '');
    }
  }

  /* ---- the bars ----
   * The game viewer's cells, cell for cell, so a bar means the same thing on every page of
   * the site: the balance in centipawns, or a countable stack of bands for a mate.
   */

  function cellContents(move, white) {
    var fromWhite = white ? move.score : -move.score;
    if (move.mate) {
      var count = Math.min(20, Math.max(1, Math.abs(move.score)));
      var side = fromWhite > 0 ? 'w' : 'b';
      var bands = '';
      for (var i = 0; i < count; i++) { bands += '<div class="vw-mate ' + side + '"></div>'; }
      return '<div class="vw-mates">' + bands + '</div>';
    }
    var black = 50 + 100 * (-(fromWhite / 100)) / 20;
    black = Math.max(0, Math.min(100, black));
    return '<div class="vw-zero"></div><div class="vw-black" style="height:' + black +
           '%"></div>';
  }

  function scoreLabel(move) {
    return move.mate ? 'mate ' + move.score : 'cp ' + move.score;
  }

  function bars(element, list, white, marked, mark) {
    element.className = 'ac-bars';
    element.innerHTML = '<div class="vw-mini">' + list.map(function (move, index) {
      return '<div class="vw-cell' + (index === marked ? ' ' + mark : '') +
             '" title="' + move.san + ': ' + scoreLabel(move) + '">' +
             cellContents(move, white) + '</div>';
    }).join('') + '</div>';
  }

  function closeBars(element, hint) {
    element.className = 'ac-bars empty';
    element.innerHTML = '<div class="ac-hint">' + hint + '</div>';
  }

  /* ---- the ladder ---- */

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = list[i]; list[i] = list[j]; list[j] = swap;
    }
    return list;
  }

  function remembered(key) {
    try { return Number(localStorage.getItem(key)) || 0; } catch (error) { return 0; }
  }

  function remember(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (error) { /* private window */ }
  }

  // The levels of an activity, in order, each one a pool of positions. A pool is shuffled
  // once and then dealt in order, so a position does not come round again before the rest of
  // its level has been seen. `best` counts levels rather than naming one, and is 0 until the
  // first is cleared, so that the two activities can keep it the same way.
  function ladder(keys, pools, store) {
    var decks = keys.map(function (key) { return { items: shuffle(pools[key].slice()), at: 0 }; });
    return {
      keys: keys,
      level: 0,
      solved: 0,
      best: remembered(store),
      key: function () { return keys[this.level]; },
      deal: function () {
        var deck = decks[this.level];
        if (deck.at >= deck.items.length) { shuffle(deck.items); deck.at = 0; }
        return deck.items[deck.at++];
      },
      win: function () {
        this.solved++;
        if (this.level + 1 > this.best) { this.best = this.level + 1; remember(store, this.best); }
        this.level = Math.min(this.level + 1, keys.length - 1);
      },
      lose: function () { this.level = 0; }
    };
  }

  /* ---- the page ---- */

  function chrome() {
    var id = document.getElementById.bind(document);
    return {
      board: id('ac-board'), level: id('ac-level'), turn: id('ac-turn'), score: id('ac-score'),
      verdict: id('ac-verdict'), bars: id('ac-bars'), next: id('ac-next'), give: id('ac-give'),
      from: id('ac-from'), here: id('bar-here')
    };
  }

  function turn(element, white) {
    element.hidden = false;
    element.textContent = white ? 'White to move' : 'Black to move';
    element.className = 'ac-turn ' + (white ? 'white' : 'black');
  }

  // Where the position was met, when it was met on one of the four hundred games. The rest
  // are positions the engine scored somewhere else and have no game to point at.
  function source(element, puzzle) {
    if (!puzzle || !puzzle.g) { element.textContent = ''; return; }
    element.innerHTML = 'from <a href="index.html#' + puzzle.g + '">' + puzzle.g + '</a>, ' +
                        'move ' + (Math.floor(puzzle.y / 2) + 1) + (puzzle.y % 2 ? '…' : '.');
  }

  function verdict(element, kind, html) {
    element.className = 'ac-verdict' + (kind ? ' ' + kind : '');
    element.innerHTML = html;
  }

  function score(element, run, label) {
    element.innerHTML = 'level <b>' + (run.level + 1) + '</b> of ' + run.keys.length +
                        ' · solved ' + run.solved +
                        ' · best <b>' + (run.best ? label(run.keys[run.best - 1]) : '—') + '</b>';
  }

  // Both files are a version and a list of positions, and both are read the same way.
  function load(name, start, parts) {
    fetch(name).then(function (response) {
      if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
      return response.json();
    }).then(function (document_) {
      var puzzles = document_.p || [];
      if (!puzzles.length) throw new Error('it holds no position');
      start(puzzles);
    }).catch(function (error) {
      parts.level.textContent = 'No positions';
      verdict(parts.verdict, 'wrong', name + ' could not be read: ' + error.message);
    });
  }

  // A level's positions, grouped in the order the keys are given.
  function group(puzzles) {
    var pools = {};
    puzzles.forEach(function (puzzle) {
      (pools[puzzle.n] = pools[puzzle.n] || []).push(puzzle);
    });
    return pools;
  }

  return {
    moves: moves, whiteToMove: whiteToMove, applyMove: applyMove,
    board: board, paint: paint,
    bars: bars, closeBars: closeBars, cellContents: cellContents, scoreLabel: scoreLabel,
    shuffle: shuffle, ladder: ladder, group: group,
    chrome: chrome, turn: turn, source: source, verdict: verdict, score: score, load: load
  };
}());
