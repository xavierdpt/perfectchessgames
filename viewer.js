/* The board viewer for the published index.
 *
 * A game's file carries, for every position it passes through, the score of every legal move
 * and the squares that move joins. That is enough to draw the minibars, to replay the game,
 * and to let a click on the board make a move — the move is looked up in the position's own
 * list, so nothing here has to know the rules of chess. Applying a move to the board does:
 * castling, en passant and promotion are the three cases below.
 *
 * Playing a move the game did not play leaves the line. There are no scores past that point,
 * so the board shows the position and stops there; the chosen move is marked in the minibar
 * beside the move the game actually played, which is the whole point of being able to try it.
 */
(function () {
  'use strict';

  var DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var START = ('RNBQKBNR' + 'PPPPPPPP' + '                                ' +
               'pppppppp' + 'rnbqkbnr').split('');
  var FILES = 'abcdefgh';

  function d1(ch) { return DIGITS.indexOf(ch); }
  function d12(pair) { return DIGITS.indexOf(pair[0]) * 64 + DIGITS.indexOf(pair[1]); }
  function squareName(index) { return FILES[index % 8] + (Math.floor(index / 8) + 1); }

  /* ---- the game file ---- */

  function decode(doc) {
    return doc.p.map(function (line) {
      var parts = line.split(' ');
      var moves = parts.slice(1).map(function (token) {
        var flags = token.slice(6);
        var promo = flags.match(/[qrbn]/);
        return {
          san: doc.d[d12(token.slice(0, 2))],
          from: d1(token[2]),
          to: d1(token[3]),
          score: d12(token.slice(4, 6)) - 2048,
          mate: flags.indexOf('!') >= 0,
          promo: promo ? promo[0] : null
        };
      });
      return { played: parts[0] === '-' ? -1 : d12(parts[0]), moves: moves };
    });
  }

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

  /* ---- the minibar cell ----
   * Built from elements, the way the app builds it. A mate is a row of rectangles meant to
   * be counted, and only real elements give evenly sized, pixel-snapped bands with a gap
   * that stays the same whatever the row height is.
   */

  function cellContents(move, whiteToMove) {
    var fromWhite = whiteToMove ? move.score : -move.score;
    if (move.mate) {
      // Mate in N: N rectangles in the winner's colour, the grey behind them showing
      // through the gaps so they stay countable.
      var count = Math.min(20, Math.max(1, Math.abs(move.score)));
      var side = fromWhite > 0 ? 'w' : 'b';
      var bands = '';
      for (var i = 0; i < count; i++) { bands += '<div class="vw-mate ' + side + '"></div>'; }
      return '<div class="vw-mates">' + bands + '</div>';
    }
    // Black's share of the bar; ten pawns either way fills or empties it.
    var black = 50 + 100 * (-(fromWhite / 100)) / 20;
    black = Math.max(0, Math.min(100, black));
    return '<div class="vw-zero"></div><div class="vw-black" style="height:' + black + '%"></div>';
  }

  function scoreLabel(move) {
    if (move.mate) return 'mate ' + move.score;
    return 'cp ' + move.score;
  }

  /* ---- the modal ---- */

  var root = null, squares = [], barsBox = null, rows = [], moveSpans = [];
  var titleEl, plyEl, statusEl, movesEl, navButtons = {};
  var game = null, boards = [], ply = 0, origin = null, excursion = null;
  var cache = {};
  var lastFocus = null;

  function build() {
    root = document.createElement('div');
    root.className = 'vw';
    root.hidden = true;
    root.innerHTML =
      '<div class="vw-backdrop" data-close="1"></div>' +
      '<div class="vw-panel" role="dialog" aria-modal="true" aria-label="Game board">' +
        '<div class="vw-head">' +
          '<h2 class="vw-title"></h2><span class="vw-ply"></span>' +
          '<button type="button" class="vw-close" data-close="1">Close</button>' +
        '</div>' +
        '<div class="vw-body">' +
          '<div class="vw-left">' +
            '<div class="vw-board"></div>' +
            '<div class="vw-nav">' +
              '<button type="button" data-go="start" title="First position (Home)">|&#9664;</button>' +
              '<button type="button" data-go="prev" title="Previous (&#8592;)">&#9664;</button>' +
              '<button type="button" data-go="next" title="Next (&#8594;)">&#9654;</button>' +
              '<button type="button" data-go="end" title="Last position (End)">&#9654;|</button>' +
            '</div>' +
            '<div class="vw-status"></div>' +
            '<div class="vw-moves"></div>' +
          '</div>' +
          '<div class="vw-right">' +
            '<div class="vw-bars"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    titleEl = root.querySelector('.vw-title');
    plyEl = root.querySelector('.vw-ply');
    statusEl = root.querySelector('.vw-status');
    movesEl = root.querySelector('.vw-moves');
    barsBox = root.querySelector('.vw-bars');

    var boardEl = root.querySelector('.vw-board');
    squares = new Array(64);
    for (var row = 0; row < 9; row++) {
      for (var col = 0; col < 9; col++) {
        var cell = document.createElement('div');
        if (col === 0 || row === 8) {
          cell.className = 'vw-co';
          if (col > 0) cell.textContent = FILES[col - 1];
          else if (row < 8) cell.textContent = String(8 - row);
        } else {
          var file = col - 1, rank = 7 - row, index = rank * 8 + file;
          cell.className = 'vw-sq ' + ((rank + file) % 2 ? 'lt' : 'dk');
          cell.dataset.sq = String(index);
          squares[index] = cell;
        }
        boardEl.appendChild(cell);
      }
    }

    root.querySelectorAll('[data-go]').forEach(function (button) {
      navButtons[button.dataset.go] = button;
      button.addEventListener('click', function () { go(button.dataset.go); });
    });
    root.addEventListener('click', function (event) {
      if (event.target.dataset && event.target.dataset.close) close();
    });
    boardEl.addEventListener('click', onBoardClick);
    barsBox.addEventListener('click', function (event) {
      var row = event.target.closest('.vw-row');
      if (row) goTo(Number(row.dataset.ply));
    });
    document.addEventListener('keydown', onKey);
  }

  /* ---- rendering ---- */

  function currentBoard() { return excursion ? excursion.board : boards[ply]; }

  function lastMove() {
    if (excursion) return excursion.move;
    return ply > 0 ? game.positions[ply - 1].moves[game.positions[ply - 1].played] : null;
  }

  // Where the piece on the selected square may go, from this position's own move list.
  function destinations() {
    if (origin === null || excursion) return [];
    return game.positions[ply].moves.filter(function (m) { return m.from === origin; });
  }

  function renderBoard() {
    var board = currentBoard();
    var previous = lastMove();
    var dests = destinations();
    var movable = {};
    if (!excursion) {
      game.positions[ply].moves.forEach(function (m) { movable[m.from] = true; });
    }
    var destSet = {};
    dests.forEach(function (m) { destSet[m.to] = true; });

    for (var i = 0; i < 64; i++) {
      var cell = squares[i];
      var piece = board[i];
      cell.className = 'vw-sq ' + ((Math.floor(i / 8) + (i % 8)) % 2 ? 'lt' : 'dk') +
        (piece === ' ' ? '' : ' pc-' + (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase()) +
        (previous && previous.from === i ? ' from' : '') +
        (previous && previous.to === i ? ' to' : '') +
        (origin === i ? ' origin' : '') +
        (destSet[i] ? ' dest' + (piece === ' ' ? '' : ' occupied') : '') +
        (movable[i] && origin === null ? ' pick' : '');
    }
  }

  function renderBars() {
    var html = '';
    game.positions.forEach(function (position, index) {
      var whiteToMove = index % 2 === 0;
      var number = Math.floor(index / 2) + 1;
      var label = index === 0 ? '&#8212;'
        : (index % 2 ? number + '. ' : (number - 1) + '…') +
          game.positions[index - 1].moves[game.positions[index - 1].played].san;
      var cells = position.moves.map(function (move, order) {
        return '<div class="vw-cell' + (order === position.played ? ' played' : '') +
               '" data-i="' + order + '" title="' + move.san + ': ' + scoreLabel(move) + '">' +
               cellContents(move, whiteToMove) + '</div>';
      }).join('');
      html += '<div class="vw-row" data-ply="' + index + '"><div class="vw-label">' + label +
              '</div><div class="vw-mini">' + cells + '</div></div>';
    });
    barsBox.innerHTML = html;
    rows = Array.prototype.slice.call(barsBox.children);
  }

  // The game as it reads in a PGN. The move that led to the position on the board is marked,
  // so the board, the minibars and the text all say the same thing.
  function renderMoves() {
    var parts = [];
    game.positions.forEach(function (position, index) {
      if (position.played < 0) return;
      if (index % 2 === 0) parts.push('<span class="num">' + (index / 2 + 1) + '.</span>');
      parts.push('<span data-ply="' + (index + 1) + '">' +
                 position.moves[position.played].san + '</span>');
    });
    movesEl.innerHTML = parts.join(' ');
    moveSpans = Array.prototype.slice.call(movesEl.querySelectorAll('[data-ply]'));
  }

  function highlightMoves() {
    moveSpans.forEach(function (span) {
      var at = Number(span.dataset.ply) === ply && !excursion;
      span.className = at ? 'at' : '';
      if (at) span.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderHighlight() {
    rows.forEach(function (row, index) { row.classList.toggle('here', index === ply); });
    // A move tried off the line is marked next to the one the game played, in the same row.
    barsBox.querySelectorAll('.vw-cell.chosen').forEach(function (cell) {
      cell.classList.remove('chosen');
    });
    if (excursion) {
      var cell = rows[excursion.ply].children[1].children[excursion.index];
      if (cell) cell.classList.add('chosen');
    }
    var here = rows[ply];
    if (here) here.scrollIntoView({ block: 'nearest' });
  }

  function renderStatus() {
    var total = game.positions.length - 1;
    plyEl.textContent = 'position ' + ply + ' of ' + total;

    if (excursion) {
      var played = game.positions[excursion.ply].moves[game.positions[excursion.ply].played];
      statusEl.innerHTML = '<span class="off">Off the game.</span> You played <b>' +
        excursion.move.san + '</b> (' + scoreLabel(excursion.move) + ', ranked ' +
        (excursion.index + 1) + ' of ' + game.positions[excursion.ply].moves.length +
        '). The game played <b>' + played.san + '</b>.' +
        '<button type="button" data-go="back">Back to the game</button>';
      statusEl.querySelector('[data-go]').addEventListener('click', function () { goTo(ply); });
    } else {
      var position = game.positions[ply];
      var side = ply % 2 === 0 ? 'White' : 'Black';
      var previous = lastMove();
      statusEl.innerHTML = (previous ? 'After <b>' + previous.san + '</b>. ' : '') +
        side + ' to move'  ;
    }

    navButtons.start.disabled = navButtons.prev.disabled = ply === 0 && !excursion;
    navButtons.next.disabled = navButtons.end.disabled = ply === total && !excursion;
  }

  function render() {
    renderBoard();
    renderHighlight();
    highlightMoves();
    renderStatus();
  }

  /* ---- moving about ---- */

  function goTo(index) {
    ply = Math.max(0, Math.min(game.positions.length - 1, index));
    origin = null;
    excursion = null;
    render();
  }

  function go(where) {
    if (where === 'start') goTo(0);
    else if (where === 'prev') goTo(excursion ? ply : ply - 1);
    else if (where === 'next') goTo(ply + 1);
    else if (where === 'end') goTo(game.positions.length - 1);
  }

  function onBoardClick(event) {
    var cell = event.target.closest('.vw-sq');
    if (!cell || excursion) return;
    var index = Number(cell.dataset.sq);

    var chosen = destinations().filter(function (m) { return m.to === index; })[0];
    if (chosen) {
      var position = game.positions[ply];
      var order = position.moves.indexOf(chosen);
      if (order === position.played) {
        goTo(ply + 1);                                  // the move the game itself played
      } else {
        excursion = { ply: ply, index: order, move: chosen, board: applyMove(boards[ply], chosen) };
        origin = null;
        render();
      }
      return;
    }
    origin = (origin === index) ? null : index;
    renderBoard();
  }

  function onKey(event) {
    if (root.hidden) return;
    if (event.key === 'Escape') { close(); return; }
    var map = { ArrowLeft: 'prev', ArrowRight: 'next', Home: 'start', End: 'end' };
    if (map[event.key]) { event.preventDefault(); go(map[event.key]); }
  }

  /* ---- opening and closing ---- */

  function open(name, title) {
    if (!root) build();
    lastFocus = document.activeElement;
    titleEl.textContent = title;
    statusEl.textContent = 'Loading…';
    barsBox.innerHTML = '';
    movesEl.innerHTML = '';
    root.hidden = false;
    document.body.style.overflow = 'hidden';

    load(name).then(function (doc) {
      game = { positions: decode(doc) };
      boards = [START];
      game.positions.forEach(function (position, index) {
        if (position.played >= 0) {
          boards.push(applyMove(boards[index], position.moves[position.played]));
        }
      });
      titleEl.textContent = doc.t;
      renderBars();
      renderMoves();
      goTo(0);
      root.querySelector('.vw-close').focus();
    }).catch(function (error) {
      statusEl.textContent = 'Could not load this game: ' + error.message;
    });
  }

  function load(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    return fetch('games/' + name + '.json').then(function (response) {
      if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
      return response.json();
    }).then(function (doc) {
      cache[name] = doc;
      return doc;
    });
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.open-board');
    if (!button) return;
    var article = button.closest('.game');
    open(article.id, article.dataset.title);
  });
})();
