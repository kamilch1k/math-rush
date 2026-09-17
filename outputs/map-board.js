// Shared Miro-like board: hold left mouse button to pan, mouse wheel to zoom,
// pinch / toolbar buttons / double-click to zoom. Clicks still work on taps.
// Wire-up: <div class="board-viewport" data-board-viewport><div data-board-content>…</div></div>
// plus an optional <div data-board-toolbar> with [data-board-zoom-in/out/reset/label].
(function (global) {
  'use strict';

  var MIN_ZOOM = 0.2, MAX_ZOOM = 2.5, CLICK_TOLERANCE = 6, BOARD_MARGIN = 240;

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function contentSize(state) {
    return { w: state.content.offsetWidth, h: state.content.offsetHeight };
  }

  function viewportSize(state) {
    return { w: state.viewport.clientWidth, h: state.viewport.clientHeight };
  }

  function apply(state) {
    state.content.style.transform = 'translate(' + state.tx + 'px, ' + state.ty + 'px) scale(' + state.z + ')';
    if (state.label) state.label.textContent = Math.round(state.z * 100) + '%';
  }

  function clampAxis(pos, viewSize, contentSize) {
    if (contentSize + BOARD_MARGIN * 2 <= viewSize) return (viewSize - contentSize) / 2;
    return clamp(pos, viewSize - contentSize - BOARD_MARGIN, BOARD_MARGIN);
  }

  function clampPan(state) {
    var vw = viewportSize(state).w, vh = viewportSize(state).h;
    var size = contentSize(state);
    state.tx = clampAxis(state.tx, vw, size.w * state.z);
    state.ty = clampAxis(state.ty, vh, size.h * state.z);
  }

  function fit(state) {
    var vw = viewportSize(state).w;
    var cw = contentSize(state).w;
    if (vw < 10 || cw < 10) return;
    state.z = Math.min(1, vw / cw);
    state.tx = Math.max(0, (vw - cw * state.z) / 2);
    state.ty = 0;
    apply(state);
  }

  function fitAll(state) {
    var vw = viewportSize(state).w, vh = viewportSize(state).h;
    var size = contentSize(state);
    if (vw < 10 || vh < 10 || size.w < 10 || size.h < 10) return;
    state.z = clamp(Math.min(vw / size.w, vh / size.h), MIN_ZOOM, 1);
    state.tx = 0;
    state.ty = 0;
    clampPan(state);
    apply(state);
  }

  function refit(state) {
    if (!state.touched) fit(state);
    else { clampPan(state); apply(state); }
  }

  function panBy(state, dx, dy) {
    state.tx += dx;
    state.ty += dy;
    state.touched = true;
    clampPan(state);
    apply(state);
  }

  function zoomAtPoint(state, clientX, clientY, factor) {
    var rect = state.viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var px = clientX - rect.left, py = clientY - rect.top;
    var wx = (px - state.tx) / state.z, wy = (py - state.ty) / state.z;
    state.z = clamp(state.z * factor, MIN_ZOOM, MAX_ZOOM);
    state.tx = px - wx * state.z;
    state.ty = py - wy * state.z;
    state.touched = true;
    clampPan(state);
    apply(state);
  }

  function zoomAtCenter(state, factor) {
    var rect = state.viewport.getBoundingClientRect();
    zoomAtPoint(state, rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function pointersDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onDown(state, event) {
    try { state.viewport.setPointerCapture(event.pointerId); } catch (_) { /* noop */ }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.moved = 0;
    if (state.pointers.size === 2) {
      var pts = Array.from(state.pointers.values());
      state.pinchDist = pointersDistance(pts[0], pts[1]) || 1;
      state.pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
    state.viewport.classList.add('panning');
  }

  function onMove(state, event) {
    if (!state.pointers.has(event.pointerId)) return;
    var prev = state.pointers.get(event.pointerId);
    var dx = event.clientX - prev.x, dy = event.clientY - prev.y;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.moved += Math.abs(dx) + Math.abs(dy);
    if (state.pointers.size === 1) {
      if (state.moved <= CLICK_TOLERANCE) return;
      state.touched = true;
      panBy(state, dx, dy);
    } else if (state.pointers.size === 2) {
      var pts = Array.from(state.pointers.values());
      var dist = pointersDistance(pts[0], pts[1]) || 1;
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (state.pinchDist > 0) zoomAtPoint(state, mid.x, mid.y, dist / state.pinchDist);
      state.pinchDist = dist;
      state.pinchMid = mid;
    }
  }

  function onUp(state, event) {
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) state.pinchDist = 0;
    if (state.pointers.size === 0) state.viewport.classList.remove('panning');
    if (state.moved > CLICK_TOLERANCE) state.suppressClick = true;
  }

  function initViewport(viewport) {
    var content = viewport.querySelector('[data-board-content]');
    if (!content) return;
    var state = viewport._board;
    if (state) { refit(state); return; }
    state = {
      viewport: viewport, content: content, z: 1, tx: 0, ty: 0,
      touched: false, pointers: new Map(), pinchDist: 0, pinchMid: null,
      moved: 0, suppressClick: false, label: null
    };
    viewport._board = state;
    var parent = viewport.parentElement;
    var toolbar = parent ? parent.querySelector('[data-board-toolbar]') : null;
    if (toolbar) {
      state.label = toolbar.querySelector('[data-board-zoom-label]');
      var zoomIn = toolbar.querySelector('[data-board-zoom-in]');
      var zoomOut = toolbar.querySelector('[data-board-zoom-out]');
      var reset = toolbar.querySelector('[data-board-reset]');
      if (zoomIn) zoomIn.addEventListener('click', function (e) { e.stopPropagation(); zoomAtCenter(state, 1.25); });
      if (zoomOut) zoomOut.addEventListener('click', function (e) { e.stopPropagation(); zoomAtCenter(state, 1 / 1.25); });
      if (reset) reset.addEventListener('click', function (e) { e.stopPropagation(); state.touched = true; fitAll(state); });
    }
    content.style.transformOrigin = '0 0';
    viewport.addEventListener('pointerdown', function (e) { onDown(state, e); });
    viewport.addEventListener('pointermove', function (e) { onMove(state, e); });
    viewport.addEventListener('pointerup', function (e) { onUp(state, e); });
    viewport.addEventListener('pointercancel', function (e) { onUp(state, e); });
    viewport.addEventListener('click', function (e) {
      if (state.suppressClick) { e.stopPropagation(); e.preventDefault(); state.suppressClick = false; }
    }, true);
    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      zoomAtPoint(state, e.clientX, e.clientY, Math.exp(-delta * 0.0025));
    }, { passive: false });
    viewport.addEventListener('dblclick', function (e) {
      e.preventDefault();
      zoomAtPoint(state, e.clientX, e.clientY, 1.4);
    });
    refit(state);
  }

  function initAll(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-board-viewport]'), initViewport);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAll(); });
    else initAll();
    if (typeof global.addEventListener === 'function') global.addEventListener('resize', function () { initAll(); });
  }

  global.MathRushBoard = { init: initAll };
})(typeof window !== 'undefined' ? window : this);
