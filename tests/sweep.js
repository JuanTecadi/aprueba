// Shared helpers for v0.3 step 5: visit every screen and measure touch targets and text contrast.
// Used by test-step5.js. Each measure runs in the page.

// Touch target of every visible control: its box, enlarged by an absolutely positioned ::before when there is one
// (the way the app enlarges small controls). Returns the controls smaller than min in either direction.
async function smallTargets(p, min = 56) {
  return p.evaluate(min => {
    const sel = 'button, a[href], input:not([type=checkbox]), label.check, [role=switch]';
    const out = [];
    for (const e of document.querySelectorAll(sel)) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || e.closest('[hidden]') || getComputedStyle(e).visibility === 'hidden') continue;
      if (e.closest('[aria-hidden="true"]')) continue;
      let w = r.width, h = r.height;
      const b = getComputedStyle(e, '::before');
      if (b.content !== 'none' && b.position === 'absolute') {
        const px = v => (v === 'auto' ? 0 : parseFloat(v) || 0);
        w = Math.max(w, r.width - px(b.left) - px(b.right)); h = Math.max(h, r.height - px(b.top) - px(b.bottom));
        if (b.width !== 'auto' && parseFloat(b.width)) w = Math.max(w, parseFloat(b.width));
        if (b.height !== 'auto' && parseFloat(b.height)) h = Math.max(h, parseFloat(b.height));
      }
      if (w < min - 0.5 || h < min - 0.5) {
        const id = e.id ? '#' + e.id : '', cl = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '';
        out.push(`${e.tagName.toLowerCase()}${id}${cl} «${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 24)}» ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return out;
  }, min);
}

// WCAG contrast of every visible piece of text against the first solid background behind it.
// Large text (24 px, or 18.66 px bold) needs 3:1, the rest 4.5:1. Returns the pieces below their limit.
async function lowContrast(p) {
  return p.evaluate(() => {
    // rgb()/rgba(), or color(srgb r g b / a) with 0–1 channels (what color-mix() computes to)
    const rgba = s => {
      const m = (s.match(/[\d.]+/g) || []).map(Number); if (!m.length) return [0, 0, 0, 0];
      if (/^color\(srgb/.test(s)) return [m[0] * 255, m[1] * 255, m[2] * 255, m.length > 3 ? m[3] : 1];
      return m.length > 3 ? m : [...m, 1];
    };
    const L = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const bgOf = e => {
      for (let el = e; el; el = el.parentElement) {
        const c = rgba(getComputedStyle(el).backgroundColor);
        if (c[3] > 0.5) return c;
      }
      return [255, 255, 255, 1];
    };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement; if (!e || seen.has(e) || !n.textContent.trim()) continue; seen.add(e);
      if (e.closest('[hidden], [aria-hidden="true"], script, style, svg, .sr')) continue;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (!r.width || !r.height || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      if (e.closest('[disabled]')) continue;
      const fg = rgba(cs.color), bg = bgOf(e);
      const a = L(fg), b = L(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need) out.push(`«${n.textContent.trim().slice(0, 28)}» ${ratio.toFixed(2)}:1 (needs ${need}; ${cs.color} on rgb(${bg.slice(0, 3).map(Math.round).join(', ')}), ${size}px)`);
    }
    return out;
  });
}

module.exports = { smallTargets, lowContrast };
