/* Find the mate.
 *
 * mate.json holds positions where the side to move has a forced mate, with every legal move
 * scored. A level is a mate distance: answer a mate in n and the next position is a mate at
 * the next distance the file has; miss one and the next is a mate in one again. The answer is
 * a move, played on the board, and it is right when it scores a mate in exactly n — which is
 * often more than one move, so the verdict names the others.
 *
 * The board, the bars and the ladder are in activity.js.
 */
(function () {
  'use strict';

  var PCG = window.PCG;
  var STORE = 'perfectchessgames.mate.level';
  var HINT = 'Every legal move, scored, once you have answered.';
  var ASK = 'Pick up a piece and play the move you think forces mate.';

  var page = null, run = null;
  var puzzle = null, moves = [], board = [], white = true, squares = [];
  var origin = null, answer = null, done = false;

  /* ---- rendering ---- */

  function renderBoard() {
    var marks = { origin: origin };
    if (answer) { marks.from = answer.from; marks.to = answer.to; }
    if (!done) {
      marks.pick = {};
      marks.dest = {};
      moves.forEach(function (move) {
        if (origin === null) marks.pick[move.from] = true;
        if (move.from === origin) marks.dest[move.to] = true;
      });
    }
    PCG.paint(squares, board, marks);
  }

  function label(distance) { return 'mate in ' + distance; }

  function renderHead() {
    page.level.innerHTML = 'Find the mate in <span class="ac-n">' + run.key() + '</span>';
    PCG.turn(page.turn, white);
    page.here.textContent = puzzle.f;
    PCG.score(page.score, run, label);
  }

  /* ---- answering ---- */

  function mating(move) { return move.mate && move.score === run.key(); }

  // A list of moves, named while there are few enough to name.
  function named(names) {
    var shown = names.slice(0, 4).map(function (san) {
      return '<span class="san">' + san + '</span>';
    });
    if (names.length > 4) shown.push((names.length - 4) + ' more');
    return shown.join(', ');
  }

  function others(names, played) {
    var rest = names.filter(function (san) { return san !== played; });
    if (!rest.length) return 'It is the only move that does.';
    if (rest.length > 4) return 'So do ' + rest.length + ' of the other moves.';
    return 'So ' + (rest.length === 1 ? 'does ' : 'do ') + named(rest) + '.';
  }

  // Why the move was not the answer. A move can be a mate and still be wrong, either because
  // it mates more slowly than the position allows or because it is the other side that mates.
  function missed(move, distance) {
    var san = '<span class="san">' + move.san + '</span>';
    if (move.mate && move.score > 0) {
      return san + ' mates in ' + move.score + ', not in ' + distance + '.';
    }
    if (move.mate) {
      return san + ' throws it away: mate in ' + Math.abs(move.score) + ' against.';
    }
    return san + ' keeps the game going at ' + move.score + ' centipawns.';
  }

  function answered(move, gaveUp) {
    answer = move;
    done = true;
    origin = null;
    if (move) board = PCG.applyMove(board, move);

    var right = !gaveUp && move && mating(move);
    var answers = moves.filter(mating).map(function (m) { return m.san; });
    var distance = run.key();

    if (right) {
      run.win();
      PCG.verdict(page.verdict, 'right',
        '<b class="good">Found it.</b> <span class="san">' + move.san + '</span> forces mate ' +
        'in ' + distance + '. ' + others(answers, move.san) +
        ' Next: mate in ' + run.key() + '.');
    } else {
      run.lose();
      PCG.verdict(page.verdict, 'wrong', (gaveUp
        ? '<b>The mate in ' + distance + ' was ' + named(answers) + '.</b>'
        : '<b class="bad">Not that one.</b> ' + missed(move, distance) +
          ' The mate in ' + distance + ' was ' + named(answers) + '.') +
        ' Back to mate in ' + run.key() + '.');
    }

    PCG.score(page.score, run, label);
    PCG.bars(page.bars, moves, white, moves.indexOf(move), 'chosen');
    PCG.source(page.from, puzzle);
    page.next.disabled = false;
    page.give.disabled = true;
    renderBoard();
    page.next.focus();
  }

  /* ---- promotion ----
   * Four moves share the two squares and differ only in what the pawn becomes, so the click
   * has to be asked which one it meant. The pieces are drawn on the square it is going to.
   */

  function closePromotion() {
    var open = page.board.querySelector('.mt-promo');
    if (open) open.remove();
  }

  function askPromotion(choices) {
    closePromotion();
    var box = document.createElement('div');
    box.className = 'mt-promo';
    var square = squares[choices[0].to];
    var above = square.offsetTop + square.offsetHeight * 4 <= page.board.clientHeight;
    box.style.left = square.offsetLeft + 'px';
    if (above) {
      box.style.top = square.offsetTop + 'px';
    } else {
      box.style.bottom = (page.board.clientHeight - square.offsetTop -
                          square.offsetHeight) + 'px';
      box.style.flexDirection = 'column-reverse';
    }
    choices.forEach(function (move) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pc-' + (white ? 'w' : 'b') + move.promo.toUpperCase();
      button.title = move.san;
      button.setAttribute('aria-label', move.san);
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        closePromotion();
        answered(move, false);
      });
      box.appendChild(button);
    });
    page.board.appendChild(box);
  }

  function onBoardClick(event) {
    if (done) return;
    var cell = event.target.closest('.vw-sq');
    if (!cell) return;
    closePromotion();
    var index = Number(cell.dataset.sq);
    var chosen = origin === null ? [] : moves.filter(function (move) {
      return move.from === origin && move.to === index;
    });
    if (chosen.length > 1 && chosen[0].promo) { askPromotion(chosen); return; }
    if (chosen.length) { answered(chosen[0], false); return; }
    origin = moves.some(function (move) { return move.from === index; }) ? index : null;
    renderBoard();
  }

  /* ---- a position ---- */

  function show() {
    puzzle = run.deal();
    moves = PCG.moves(puzzle, true);
    board = puzzle.b.split('');
    white = PCG.whiteToMove(puzzle);
    origin = null;
    answer = null;
    done = false;
    page.next.disabled = true;
    page.give.disabled = false;
    closePromotion();
    // A position with Black to move is drawn from Black's side: the mate is Black's to find.
    squares = PCG.board(page.board, !white);
    renderHead();
    renderBoard();
    PCG.closeBars(page.bars, HINT);
    PCG.source(page.from, null);
    if (page.verdict.className !== 'ac-verdict') PCG.verdict(page.verdict, '', ASK);
  }

  document.addEventListener('DOMContentLoaded', function () {
    page = PCG.chrome();
    page.board.addEventListener('click', onBoardClick);
    page.next.addEventListener('click', function () { if (!page.next.disabled) show(); });
    page.give.addEventListener('click', function () { if (!done) answered(null, true); });
    document.addEventListener('keydown', function (event) {
      // Enter on the focused button already clicks it; only the page itself needs handling.
      if (event.key === 'Enter' && done && event.target.tagName !== 'BUTTON') show();
      if (event.key === 'Escape') { closePromotion(); origin = null; renderBoard(); }
    });

    PCG.load('mate.json', function (puzzles) {
      var pools = PCG.group(puzzles);
      var distances = Object.keys(pools).map(Number).sort(function (a, b) { return a - b; });
      run = PCG.ladder(distances, pools, STORE);
      show();
    }, page);
  });
}());
