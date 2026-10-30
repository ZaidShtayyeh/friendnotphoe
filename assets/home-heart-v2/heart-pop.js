(function (global) {
    'use strict';
    const HOLD_MS = 1100, RESET_DELAY_MS = 900, RETURN_MS = 880;

    function mount(button, { home = document.getElementById('home-page') } = {}) {
        const art = button.querySelector('.heart-inflator');
        const burst = button.querySelector('.heart-burst');
        const letters = Array.from(button.querySelectorAll('.heart-letter'));
        const images = Array.from(button.querySelectorAll('.heart-layers img'));
        const motion = global.matchMedia('(prefers-reduced-motion: reduce)');
        const timers = new Set(), animations = new Set(), listeners = [];
        let state = 'idle', pointerId = null, keyboardKey = null, origin = null;
        let destroyed = false;
        const setState = value => { state = value; button.dataset.state = value; };
        const later = (fn, ms) => {
            const id = global.setTimeout(() => { timers.delete(id); fn(); }, ms);
            timers.add(id);
        };
        const animate = (element, frames, options) => {
            const animation = element.animate(frames, options);
            animations.add(animation);
            return animation;
        };
        function clearWork() {
            timers.forEach(id => global.clearTimeout(id)); timers.clear();
            animations.forEach(animation => animation.cancel()); animations.clear();
        }
        function releaseCapture() {
            const id = pointerId;
            pointerId = null; origin = null; keyboardKey = null;
            if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
        }
        function reset() {
            setState('idle');
            button.dataset.rejoin = 'false';
            clearWork(); releaseCapture(); burst.replaceChildren();
            art.style.transform = ''; art.style.opacity = '';
            letters.forEach(letter => { letter.style.transform = ''; });
        }
        function canStart() {
            const splash = document.getElementById('splash');
            return !destroyed && state === 'idle' && !document.hidden && images.every(image => image.complete && image.naturalWidth > 0) &&
                !home.classList.contains('hidden') && document.body.classList.contains('entered') &&
                (!splash || splash.style.display === 'none');
        }
        function finishReturn() {
            if (state !== 'returning') return;
            reset();
        }
        function settle() {
            if (state !== 'holding') return;
            const current = global.getComputedStyle(art);
            const from = { transform: current.transform, opacity: current.opacity };
            setState('returning'); clearWork(); releaseCapture();
            button.dataset.rejoin = 'true';
            animate(art, [from, { transform: 'none', opacity: 1 }], {
                duration: motion.matches ? 100 : 240, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards'
            });
            later(finishReturn, motion.matches ? 100 : 240);
        }
        function particles() {
            if (motion.matches) return;
            const bounds = button.getBoundingClientRect();
            const colors = ['#bd1647', '#d63f78', '#28ad68', '#762c40'];
            for (let i = 0; i < 12; i++) {
                const particle = document.createElement('span');
                particle.className = 'heart-particle';
                const star = i % 3 === 2;
                particle.style.color = colors[i % colors.length];
                particle.style.width = particle.style.height = (star ? 11 : 15 + i % 3 * 2) + 'px';
                particle.innerHTML = star
                    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1L15 9L23 12L15 15L12 23L9 15L1 12L9 9Z" fill="currentColor"/></svg>'
                    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S2.5 15.2 2.5 8.4C2.5 2.8 9.5 1 12 6C14.5 1 21.5 2.8 21.5 8.4C21.5 15.2 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
                burst.appendChild(particle);
                const angle = -Math.PI / 2 + i * Math.PI * 2 / 12;
                const x = Math.cos(angle) * bounds.width * .30;
                const y = Math.sin(angle) * bounds.height * .32;
                const dx = Math.cos(angle) * bounds.width * (.48 + (i % 3) * .025);
                const dy = Math.sin(angle) * bounds.height * .65;
                const rotation = (i % 2 ? 1 : -1) * (20 + i * 4);
                animate(particle, [
                    { transform: `translate(${x}px, ${y}px) scale(.65) rotate(0deg)`, opacity: 0 },
                    { offset: .12, opacity: .85 },
                    { offset: .58, transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${rotation}deg)`, opacity: .6 },
                    { transform: `translate(${dx * 1.08}px, ${dy + 35}px) scale(.45) rotate(${rotation * 1.6}deg)`, opacity: 0 }
                ], { duration: 700 + (i % 3) * 70, easing: 'cubic-bezier(.15,.65,.25,1)', fill: 'forwards' });
            }
        }
        function pop() {
            if (state !== 'holding') return;
            const from = global.getComputedStyle(art).transform;
            setState('popped'); clearWork(); releaseCapture();
            button.dataset.rejoin = motion.matches ? 'true' : 'false';
            art.style.opacity = '0';
            animate(art, [
                { transform: from, opacity: 1 },
                { transform: motion.matches ? 'none' : from + ' scale(1.025)', opacity: 0 }
            ], { duration: motion.matches ? 140 : 90, easing: 'ease-out', fill: 'forwards' });
            particles();
            if (!motion.matches) {
                const bounds = button.getBoundingClientRect();
                letters.forEach((letter, i) => {
                    const delay = (i * 29) % 95;
                    const dx = (i % 2 ? 1 : -1) * bounds.width * (.008 + (i % 3) * .006);
                    const dy = bounds.height * (.12 + (i % 4) * .018);
                    const turn = (i % 2 ? -1 : 1) * (9 + (i % 5) * 3);
                    const pose = (x,y,r) => `translate(${x}px, ${y}px) rotate(${r}deg)`;
                    // Acceleration downward, then a small damped bounce at the landing.
                    animate(letter, [
                        { transform: 'none', offset: 0, easing: 'cubic-bezier(.42,0,.85,.4)' },
                        { transform: pose(dx,dy,turn), offset: .68, easing: 'ease-out' },
                        { transform: pose(dx*.96,dy-7,turn*.9), offset: .84, easing: 'ease-in' },
                        { transform: pose(dx,dy,turn), offset: 1 }
                    ], { duration: 560, delay, fill: 'both' });
                });
            }
            later(() => {
                if (state !== 'popped') return;
                const poses = letters.map(letter => global.getComputedStyle(letter).transform);
                setState('returning'); clearWork(); burst.replaceChildren();
                art.style.opacity = '1';
                animate(art, [
                    { transform: motion.matches ? 'none' : 'scale(.87)', opacity: 0 },
                    { transform: 'none', opacity: 1 }
                ], { duration: motion.matches ? 220 : 660, delay: motion.matches ? 0 : 70, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
                if (!motion.matches) letters.forEach((letter, i) => {
                    animate(letter, [
                        { transform: poses[i], offset: 0, easing: 'cubic-bezier(.2,.75,.25,1)' },
                        { transform: 'translateY(-2px) rotate(0deg)', offset: .84, easing: 'ease-in-out' },
                        { transform: 'none', offset: 1 }
                    ], { duration: 720, delay: (12-i)*10, fill: 'both' });
                });
                later(() => { button.dataset.rejoin = 'true'; }, RETURN_MS - 140);
                later(finishReturn, RETURN_MS);
            }, RESET_DELAY_MS);
        }
        function start() {
            if (!canStart()) return false;
            if (typeof global.resetIdleTimer === 'function') global.resetIdleTimer();
            setState('holding');
            const width = button.getBoundingClientRect().width;
            const scale = Math.min(1.24, (global.innerWidth - 24) / width);
            const frames = motion.matches ? [{ opacity: 1 }, { opacity: .72 }] : [
                { transform: 'scale(1)', offset: 0 },
                { transform: 'scale(.985, 1.015)', offset: .12 },
                { transform: `translateY(-2px) scale(${1 + (scale - 1) * .52}, ${1 + (scale - 1) * .62}) rotate(-.35deg)`, offset: .62 },
                { transform: `translateY(-4px) scale(${scale}, ${scale + .035}) rotate(.5deg)`, offset: .90 },
                { transform: `translateY(-4px) scale(${scale}, ${scale + .035}) rotate(-.35deg)`, offset: 1 }
            ];
            animate(art, frames, { duration: HOLD_MS, easing: 'cubic-bezier(.35,.05,.65,.95)', fill: 'forwards' });
            later(pop, HOLD_MS);
            return true;
        }
        function listen(target, event, handler, options) {
            target.addEventListener(event, handler, options);
            listeners.push(() => target.removeEventListener(event, handler, options));
        }
        listen(button, 'pointerdown', e => {
            if (e.button !== 0 || e.isPrimary === false || !start()) return;
            e.preventDefault();
            pointerId = e.pointerId; origin = { x: e.clientX, y: e.clientY };
            button.setPointerCapture(pointerId);
        });
        listen(button, 'pointermove', e => {
            if (e.pointerId !== pointerId || !origin) return;
            if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 24) settle();
        });
        listen(button, 'pointerup', e => { if (e.pointerId === pointerId) settle(); });
        listen(button, 'pointercancel', e => { if (e.pointerId === pointerId) settle(); });
        listen(button, 'lostpointercapture', () => { if (state === 'holding') settle(); });
        listen(button, 'keydown', e => {
            if (e.code !== 'Space' && e.code !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat && start()) keyboardKey = e.code;
        });
        listen(button, 'keyup', e => {
            if (e.code !== keyboardKey) return;
            e.preventDefault(); settle();
        });
        listen(button, 'click', e => e.preventDefault());
        listen(button, 'contextmenu', e => e.preventDefault());
        listen(button, 'dragstart', e => e.preventDefault());
        listen(button, 'touchstart', e => e.stopPropagation(), { passive: true });
        listen(button, 'touchmove', e => e.stopPropagation(), { passive: true });
        listen(button, 'blur', reset);
        listen(global, 'blur', reset);
        listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
        listen(motion, 'change', reset);
        const observer = new MutationObserver(() => {
            if (home.classList.contains('hidden')) reset();
        });
        observer.observe(home, { attributes: true, attributeFilter: ['class'] });
        reset();
        return {
            get state() { return state; }, reset,
            destroy() { reset(); destroyed = true; observer.disconnect(); listeners.forEach(remove => remove()); }
        };
    }
    global.FnpHeartEgg = { mount, timing: { hold: HOLD_MS, resetDelay: RESET_DELAY_MS, return: RETURN_MS } };
    const button = document.getElementById('home-heart');
    if (button) global.homeHeartEgg = mount(button);
})(window);
