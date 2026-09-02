/* Who is winning.
 *
 * winning.json holds positions where one side is ahead by a known margin and neither side has
 * a mate, with every legal move scored. The score of the position is the score of its best
 * move, which is the first in the list, and the level is how big that score is: nine pawns to
 * start with, then eight, down to two. Say which side it favours. Right and the margin
 * narrows, wrong and it opens back up.
 *
 * Nothing is played on these boards, so their moves carry no squares: the answer is a button.
 * The board, the bars and the ladder are in activity.js.
 */
(function () {
  'use strict';

  var PCG = window.PCG;
  var STORE = 'perfectchessgames.winning.level';
  var HINT = 'Every legal move, scored, once you have answered.';
  var ASK = 'Who is ahead in this position?';

  var page = null, run = null, buttons = {};
  var puzzle = null, moves = [], white = true, squares = [];
  var margin = 0, done = false;

  /* ---- what the position is worth ---- */

  // Always from White's side, which is the side the question is asked from. The file's scores
  // are the side to move's, the way the database keeps them.
  function fromWhite(score) { return white ? score : -score; }

  // Truncated, not rounded: 999 centipawns is nine pawns and a bit, and rounding it to ten
  // would put it outside the band the level says it is in.
  function pawns(centipawns) {
    return (Math.trunc(Math.abs(centipawns) / 10) / 10).toFixed(1);
  }

  function label(band) { return band / 100 + '–' + (band / 100 + 1) + ' pawns'; }

  function renderHead() {
    page.level.innerHTML = 'Who is winning? <span class="ac-n">' + label(run.key()) +
                           '</span>';
    PCG.turn(page.turn, white);
    page.here.textContent = puzzle.f;
    PCG.score(page.score, run, label);
  }

  /* ---- answering ---- */

  function answered(said) {
    done = true;
    var ahead = margin > 0 ? 'White' : 'Black';
    var worth = ahead + ' is ahead by ' + pawns(margin) + ' pawns — the score of the best ' +
                'move, <span class="san">' + moves[0].san + '</span>.';

    if (said === ahead) {
      run.win();
      PCG.verdict(page.verdict, 'right', '<b class="good">Right.</b> ' + worth +
                  ' Next: a position won by ' + label(run.key()) + '.');
    } else {
      run.lose();
      PCG.verdict(page.verdict, 'wrong', (said
        ? '<b class="bad">No — ' + ahead + '.</b> ' + worth
        : '<b>' + worth + '</b>') +
        ' Back to ' + label(run.key()) + '.');
    }

    PCG.score(page.score, run, label);
    PCG.bars(page.bars, moves, white, 0, 'best');
    PCG.source(page.from, puzzle);
    buttons.White.disabled = true;
    buttons.Black.disabled = true;
    page.next.disabled = false;
    page.give.disabled = true;
    page.next.focus();
  }

  /* ---- a position ---- */

  function show() {
    puzzle = run.deal();
    moves = PCG.moves(puzzle, false);
    white = PCG.whiteToMove(puzzle);
    margin = fromWhite(moves[0].score);
    done = false;
    buttons.White.disabled = false;
    buttons.Black.disabled = false;
    page.next.disabled = true;
    page.give.disabled = false;
    // Never flipped: the question is about White and Black, not about whose turn it is, and a
    // board that turned over with the side to move would be saying something about the answer.
    squares = PCG.board(page.board, false);
    PCG.paint(squares, puzzle.b.split(''));
    renderHead();
    PCG.closeBars(page.bars, HINT);
    PCG.source(page.from, null);
    if (page.verdict.className !== 'ac-verdict') PCG.verdict(page.verdict, '', ASK);
  }

  document.addEventListener('DOMContentLoaded', function () {
    page = PCG.chrome();
    buttons.White = document.getElementById('wn-white');
    buttons.Black = document.getElementById('wn-black');
    Object.keys(buttons).forEach(function (side) {
      buttons[side].addEventListener('click', function () {
        if (!done) answered(side);
      });
    });
    page.next.addEventListener('click', function () { if (!page.next.disabled) show(); });
    page.give.addEventListener('click', function () { if (!done) answered(null); });
    document.addEventListener('keydown', function (event) {
      if (event.target.tagName === 'BUTTON') return;
      var key = event.key.toLowerCase();
      if (!done && key === 'w') answered('White');
      if (!done && key === 'b') answered('Black');
      if (done && event.key === 'Enter') show();
    });

    PCG.load('winning.json', function (puzzles) {
      var pools = PCG.group(puzzles);
      // Widest margin first: the easiest question is the one the engine is loudest about.
      var bands = Object.keys(pools).map(Number).sort(function (a, b) { return b - a; });
      run = PCG.ladder(bands, pools, STORE);
      show();
    }, page);
  });
}());
