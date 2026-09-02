/* The openings walk.
 *
 * One page over the whole tree in openings.json: a position, the moves out of it, and a card
 * for each. The card is a game when one was played from that move — its final position, how
 * it ended, and the board to open — and "coming soon" when nothing has been played from it
 * yet, which is most of the tree and the work still to do.
 *
 * Nothing here knows the rules of chess either. A node carries the two squares its move
 * joins, so the board is the start position with the moves of the path applied to it, the
 * same three special cases activity.js already handles.
 *
 * The address is the line itself — #e4-Nf6-e5, the same name the game files carry — so every
 * position on the page can be linked to, and the back button walks back up the line.
 */
(function () {
  'use strict';

  var DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var START = ('RNBQKBNR' + 'PPPPPPPP' + '                                ' +
               'pppppppp' + 'rnbqkbnr').split('');

  var OUTCOME = {
    'mate-white': ['Checkmate · White', 'is-mate'],
    'mate-black': ['Checkmate · Black', 'is-mate'],
    'stalemate': ['Stalemate', 'is-draw'],
    'repetition': ['Repetition', 'is-draw']
  };

  var tree = null, games = [], names = [], catalogue = [];
  var parts = {}, squares = [];

  function id(name) { return document.getElementById(name); }
  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* ---- the tree ---- */

  function move(node) {
    return { from: DIGITS.indexOf(node.q[0]), to: DIGITS.indexOf(node.q[1]),
             promo: node.z || null, san: node.m };
  }

  // The nodes of a line, root first. A move the tree does not have stops the walk, so a
  // stale or hand-typed address lands on the deepest position it does know.
  function chain(path) {
    var nodes = [tree];
    for (var i = 0; i < path.length; i++) {
      var next = (nodes[nodes.length - 1].c || []).filter(function (child) {
        return child.m === path[i];
      })[0];
      if (!next) { break; }
      nodes.push(next);
    }
    return nodes;
  }

  function boardOf(nodes) {
    var board = START;
    for (var i = 1; i < nodes.length; i++) { board = window.PCG.applyMove(board, move(nodes[i])); }
    return board;
  }

  // The openings under a node, nearest first, for the two or three a card has room to name.
  function nearest(node, limit) {
    var found = [], queue = [{ node: node, path: [] }];
    while (queue.length && found.length < limit) {
      var at = queue.shift();
      (at.node.o || []).forEach(function (index) {
        if (found.length < limit) { found.push({ name: names[index], path: at.path }); }
      });
      (at.node.c || []).forEach(function (child) {
        queue.push({ node: child, path: at.path.concat([child.m]) });
      });
    }
    return found;
  }

  // Every opening by the line lichess gives it, walked once, for the search box.
  function catalogueOf(node, path) {
    (node.o || []).forEach(function (index) {
      catalogue.push({ name: names[index], path: path });
    });
    (node.c || []).forEach(function (child) {
      catalogueOf(child, path.concat([child.m]));
    });
  }

  /* ---- how a line and a score are written ---- */

  function numbered(ply, san) {
    return '<span class="op-n">' + (Math.floor(ply / 2) + 1) + (ply % 2 ? '…' : '.') +
           '</span>' + esc(san);
  }

  function title(path) {
    var written = [];
    for (var i = 0; i < path.length; i++) {
      if (i % 2 === 0) { written.push((i / 2 + 1) + '.'); }
      written.push(path[i]);
    }
    return written.join(' ');
  }

  // Scores are the server's, from the point of view of whoever is to move; the bar and the
  // number beside it are both White's, so that a card reads the same way as a game does.
  function evaluation(node, white) {
    if (node.s === undefined) {
      return '<span class="op-eval none" title="the engine has not scored this move yet">' +
             'unscored</span>';
    }
    var scored = { score: node.s, mate: !!node.x };
    var fromWhite = white ? node.s : -node.s;
    var label = node.x ? 'mate ' + Math.abs(node.s) + (fromWhite > 0 ? ' W' : ' B')
      : (fromWhite > 0 ? '+' : fromWhite < 0 ? '−' : '±') +
        (Math.abs(fromWhite) / 100).toFixed(2);
    return '<span class="op-eval" title="' + esc(label) + ', from White’s point of view">' +
           '<span class="vw-cell">' + window.PCG.cellContents(scored, white) + '</span>' +
           esc(label) + '</span>';
  }

  function miniBoard(board) {
    var cells = '';
    for (var rank = 7; rank >= 0; rank--) {
      for (var file = 0; file < 8; file++) {
        var piece = board.charAt(rank * 8 + file);
        cells += '<div class="mini-sq ' + ((rank + file) % 2 ? 'lt' : 'dk') +
          (piece === ' ' ? '' : ' pc-' +
            (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase()) + '"></div>';
      }
    }
    return '<div class="mini-board">' + cells + '</div>';
  }

  function outcomeChip(game) {
    var kind = OUTCOME[game.o];
    return kind ? '<span class="outcome ' + kind[1] + '">' + kind[0] + '</span>' : '';
  }

  /* ---- the page ---- */

  // The address joins the moves with a dash, the way a game file is named. Castling is the
  // one SAN with dashes of its own, so it is written without them — O-O-O is OOO — which
  // nothing else in the notation can be mistaken for.
  function address(path) {
    return path.map(function (san) { return san.replace(/-/g, ''); }).join('-');
  }

  function asked() {
    var text = decodeURIComponent(location.hash.slice(1));
    if (!text) { return []; }
    return text.split('-').map(function (token) {
      return token === 'OO' ? 'O-O' : token === 'OOO' ? 'O-O-O' : token;
    });
  }

  function link(path, text, extra) {
    return '<a href="#' + address(path) + '"' + (extra || '') + '>' + text + '</a>';
  }

  function drawTrail(path) {
    var out = [link([], 'start', path.length ? '' : ' class="here"')];
    for (var i = 0; i < path.length; i++) {
      if (i % 2 === 0) { out.push('<span class="op-num">' + (i / 2 + 1) + '.</span>'); }
      out.push(link(path.slice(0, i + 1), esc(path[i]),
                    i === path.length - 1 ? ' class="here"' : ''));
    }
    parts.trail.innerHTML = out.join('');
  }

  function drawName(node, path) {
    var here = (node.o || []).map(function (index) { return esc(names[index]); });
    var also = (node.a || []).map(function (index) { return esc(names[index]); });
    var heading = here.length ? here.join(' · ')
      : path.length ? 'After ' + esc(title(path)) : 'The initial position';
    parts.name.innerHTML = heading + (also.length
      ? '<span class="op-also">Also ' + also.join(', ') + ', reached here by another ' +
        'move order</span>'
      : '');
  }

  function drawHere(node, path) {
    var white = path.length % 2 === 0;
    parts.turn.innerHTML = '<b>' + (white ? 'White' : 'Black') + '</b> to move' +
      (path.length ? ' · after ' + esc(title(path)) : '') +
      (node.n ? ' · ' + node.n + ' opening' + (node.n === 1 ? '' : 's') + ' from here' : '');

    var game = node.g === undefined ? null : games[node.g];
    if (!game) { parts.played.innerHTML = ''; return; }
    parts.played.innerHTML =
      '<div class="op-game" data-game="' + esc(game.i) + '" data-title="' + esc(game.t) + '">' +
      (game.b ? miniBoard(game.b) : '') +
      '<div class="op-game-text"><h3>The game from here</h3>' +
      '<p>' + esc(game.t) + ' · ' + Math.floor(game.p / 2) + ' moves</p>' +
      outcomeChip(game) +
      ' <button type="button" class="open-board">Open board</button></div></div>';
  }

  function card(child, path, ply) {
    var line = path.concat([child.m]);
    var game = child.g === undefined ? null : games[child.g];
    var open = !!(child.c && child.c.length);

    var titles = [];
    (child.o || []).forEach(function (index) {
      titles.push('<b>' + esc(names[index]) + '</b>');
    });
    (child.a || []).forEach(function (index) {
      titles.push('<i>' + esc(names[index]) + ' — by another move order</i>');
    });
    if (!titles.length && child.n) {
      nearest(child, 3).forEach(function (found) {
        titles.push('<span class="op-below">↳ ' +
                    link(line.concat(found.path), esc(found.name)) + '</span>');
      });
      if (child.n > titles.length) {
        titles.push('<span class="op-more">and ' + (child.n - titles.length) +
                    ' more below</span>');
      }
    } else if (child.n > (child.o || []).length) {
      titles.push('<span class="op-more">' + (child.n - (child.o || []).length) +
                  ' more below</span>');
    }

    var body = game
      ? '<div class="op-body">' + (game.b ? miniBoard(game.b) : '') +
        '<div class="op-facts"><span class="meta">' + Math.floor(game.p / 2) + ' moves</span>' +
        outcomeChip(game) +
        '<button type="button" class="open-board">Open board</button></div></div>'
      : '<div class="op-soon">coming soon<span>no game played from here yet</span></div>';

    return '<div class="op-card' + (game ? ' has-game' : '') + (open ? ' is-open' : '') + '"' +
      ' data-line="' + esc(address(line)) + '"' +
      (game ? ' data-game="' + esc(game.i) + '" data-title="' + esc(game.t) + '"' : '') +
      (open ? ' tabindex="0" role="link"' : '') + '>' +
      '<div class="op-head"><span class="op-move">' + numbered(ply, child.m) + '</span>' +
      evaluation(child, ply % 2 === 0) + '</div>' +
      (titles.length ? '<div class="op-titles">' + titles.join('') + '</div>' : '') +
      body + '</div>';
  }

  function drawMoves(node, path) {
    var children = node.c || [];
    if (!children.length) {
      parts.count.textContent = 'The line stops here';
      parts.note.textContent = 'No opening is named past this position and no game was ' +
        'played on from it.';
      parts.cards.innerHTML = '<div class="op-end">Walk back up the line above, or ' +
        'start again from the initial position.</div>';
      return;
    }
    var played = children.filter(function (child) { return child.g !== undefined; }).length;
    var scored = children.filter(function (child) { return child.s !== undefined; }).length;
    var one = children.length === 1;
    parts.count.textContent = children.length + (one ? ' move' : ' moves') + ' from here';
    parts.note.textContent =
      (played === 0 ? 'Nothing has been played from ' + (one ? 'it' : 'any of them') + ' yet'
       : played === children.length ? (one ? 'It has' : 'All of them have') + ' a game behind '
         + (one ? 'it' : 'them')
       : played + ' of them have a game behind them') +
      '; the engine has scored ' + (scored === children.length ? (one ? 'it' : 'them all')
       : scored === 0 ? 'none of them' : scored) +
      '. Best first, as the engine ranks them.';
    parts.cards.innerHTML = children.map(function (child) {
      return card(child, path, path.length);
    }).join('');
  }

  function draw() {
    var path = asked();
    var nodes = chain(path);
    path = path.slice(0, nodes.length - 1);
    var node = nodes[nodes.length - 1];
    var board = boardOf(nodes);
    var last = nodes.length > 1 ? move(nodes[nodes.length - 1]) : null;

    drawTrail(path);
    drawName(node, path);
    squares = window.PCG.board(parts.board, false);
    window.PCG.paint(squares, board, last ? { from: last.from, to: last.to } : {});
    drawHere(node, path);
    drawMoves(node, path);
    parts.here.textContent = path.length ? title(path) : '';
    document.title = (path.length ? title(path) : 'Openings') + ' · Openings';
  }

  /* ---- moving about ---- */

  function go(line) {
    if (('#' + line) === location.hash) { draw(); return; }
    location.hash = line;
  }

  function wireSearch() {
    var field = parts.search, hits = parts.hits;
    // Names the query opens come first, then the shortest — so "alekhine" offers Alekhine
    // Defense before the dozen other openings that mention it in passing.
    field.addEventListener('input', function () {
      var query = field.value.trim().toLowerCase();
      if (query.length < 2) { hits.innerHTML = ''; return; }
      var found = catalogue.map(function (entry) {
        return { entry: entry, at: entry.name.toLowerCase().indexOf(query) };
      }).filter(function (hit) {
        return hit.at >= 0;
      }).sort(function (one, two) {
        return one.at - two.at || one.entry.name.length - two.entry.name.length ||
               (one.entry.name < two.entry.name ? -1 : 1);
      }).slice(0, 40).map(function (hit) { return hit.entry; });
      hits.innerHTML = found.length
        ? found.map(function (entry) {
            return '<button type="button" data-line="' + esc(address(entry.path)) + '">' +
                   esc(entry.name) + '<em>' + esc(title(entry.path)) + '</em></button>';
          }).join('')
        : '<button type="button" disabled>No opening of that name</button>';
    });
    hits.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-line]');
      if (button) { go(button.dataset.line); }
    });
    field.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') { return; }
      var first = hits.querySelector('button[data-line]');
      if (first) { event.preventDefault(); go(first.dataset.line); }
    });
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.op-find')) { hits.innerHTML = ''; }
    });
  }

  function wire() {
    parts.cards.addEventListener('click', function (event) {
      if (event.target.closest('.open-board') || event.target.closest('a')) { return; }
      var card_ = event.target.closest('.op-card.is-open');
      if (card_) { go(card_.dataset.line); }
    });
    parts.cards.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') { return; }
      var card_ = event.target.closest('.op-card.is-open');
      if (!card_) { return; }
      event.preventDefault();
      go(card_.dataset.line);
    });
    window.addEventListener('hashchange', draw);
    wireSearch();
  }

  function start() {
    parts = { trail: id('op-trail'), name: id('op-name'), board: id('op-board'),
              turn: id('op-turn'), played: id('op-played'), count: id('op-count'),
              note: id('op-note'), cards: id('op-cards'), here: id('bar-here'),
              search: id('op-search'), hits: id('op-hits') };
    fetch('openings.json').then(function (response) {
      if (!response.ok) { throw new Error(response.status + ' ' + response.statusText); }
      return response.json();
    }).then(function (document_) {
      tree = document_.t;
      games = document_.g || [];
      names = document_.d || [];
      catalogueOf(tree, []);
      wire();
      draw();
    }).catch(function (error) {
      parts.count.textContent = 'No openings';
      parts.note.textContent = 'openings.json could not be read: ' + error.message;
    });
  }

  start();
})();
