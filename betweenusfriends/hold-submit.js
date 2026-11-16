/* A deliberate hold for pointer/keyboard users; standard activation for assistive technology. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FNFHoldSubmit = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  function create(button, options) {
    options = options || {};
    var doc = options.document || document;
    var win = options.window || window;
    var now = options.now || function () { return performance.now(); };
    var requestFrame = options.requestFrame || requestAnimationFrame;
    var cancelFrame = options.cancelFrame || cancelAnimationFrame;
    var duration = options.duration || 1100;
    var active = false, start = 0, frame = null, pointer = null, completed = false;
    var keyboardGesture = false;
    var listeners = [];
    function listen(target, type, handler) { target.addEventListener(type, handler); listeners.push([target,type,handler]); }
    function progress(value) { button.style.setProperty('--hold-progress', String(value)); }
    function cancel() {
      active = false;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      button.classList.remove('is-holding');
      progress(0);
      if (pointer !== null && button.hasPointerCapture && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
      pointer = null;
    }
    function tick() {
      if (!active) return;
      if (button.disabled || doc.hidden) { cancel(); return; }
      var value = Math.min(1, (now() - start) / duration);
      progress(value);
      if (value < 1) { frame = requestFrame(tick); return; }
      completed = true;
      cancel();
      options.onComplete();
    }
    function begin() {
      if (active || button.disabled || completed) return;
      active = true; start = now(); progress(0);
      button.classList.add('is-holding');
      frame = requestFrame(tick);
    }
    listen(button, 'pointerdown', function (e) {
      if (e.button !== 0 || e.isPrimary === false || button.disabled) return;
      e.preventDefault();
      keyboardGesture = false; completed = false; pointer = e.pointerId;
      button.focus({preventScroll:true});
      if (button.setPointerCapture) button.setPointerCapture(pointer);
      begin();
    });
    ['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(function (type) {
      listen(button, type, function (e) { if (pointer === null || e.pointerId === pointer) cancel(); });
    });
    listen(button, 'keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      keyboardGesture = true; completed = false; begin();
    });
    listen(button, 'keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault(); cancel();
    });
    listen(button, 'click', function (e) {
      e.preventDefault();
      // Screen readers/voice controls activate with a virtual click and no preceding key event.
      if (e.detail === 0 && !keyboardGesture && !completed && !button.disabled) {
        completed = true; options.onComplete();
      }
    });
    listen(button, 'blur', function () { keyboardGesture = false; completed = false; cancel(); });
    listen(win, 'blur', cancel);
    listen(doc, 'visibilitychange', function () { if (doc.hidden) cancel(); });
    return { cancel: cancel, reset: function () { cancel(); completed = false; keyboardGesture = false; }, destroy: function () { cancel(); listeners.forEach(function (l) { l[0].removeEventListener(l[1],l[2]); }); } };
  }
  return {create:create};
});
