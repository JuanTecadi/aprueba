// Ayuda with videos and the help video on the login (decided 23 November 2026; mockup «aPrueba – Ayuda con videos
// (maqueta)»). Checks: the login button opens the help video over the screen, which closes with «Cerrar», Escape or a tap
// outside and gives the focus back; the Ayuda page keeps its card and adds four video cards in order, with titles,
// lengths and labels from the texts; no video is downloaded before it is tapped; a tapped video opens large on the same
// page and plays, with its title, line, length and size, and the other three under «Otros videos» (vertical videos);
// «‹ Volver», the rail and leaving the page stop the video; the files exist and stay small. At 1180 × 820 and 390 × 844.
// (Touch sizes, contrast and sideways scroll of these screens: test-step5.js, part B.)
// Usage: python3 -m http.server 8765 & node tests/test-videos.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const TX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const URL = 'http://localhost:8765/';
const OUT = process.argv[2] || null;
const res = []; const ok = (n, c, info) => { res.push([c ? 'PASS' : 'FAIL', n]); if (!c && info !== undefined) console.log('   ', n, JSON.stringify(info)); };
const VIDS = [['ayuda', 'videoAyuda', '1:00', '4,0'], ['estudiantes', 'videoEstudiantes', '0:40', '2,3'], ['familias', 'videoFamilias', '0:37', '2,1'], ['docentes', 'videoDocentes', '0:46', '3,0']];

async function newPage(b, w = 1180, h = 820) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  // The test browser may not decode H.264, so the check is that the app starts playback: each play() call is recorded
  await p.addInitScript(() => { const pl = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.dataset.played = '1'; return pl.call(this); }; });
  p.vids = []; p.on('request', r => { const m = r.url().match(/videos\/(\w+)\.mp4/); if (m) p.vids.push(m[1]); });
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  return p;
}
const shot = async (p, n) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true }); } };
async function signUpTo(p, email, nick) {
  await p.click('#swap'); await p.fill('#email', email); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', nick); await p.click('#go'); await p.waitForTimeout(200);
  await p.click('[data-g="5to"]'); await p.click('#go'); await p.waitForTimeout(300);
}
const rail = async (p, v) => { await p.click(`[data-rail="${v}"]`); await p.waitForTimeout(150); };
const playing = p => p.evaluate(() => { const v = document.querySelector('video'); return !!v && v.dataset.played === '1'; });

(async () => {
  const b = await chromium.launch();

  // ---------- files ----------
  for (const [k, , , mb] of VIDS) {
    const f = path.join(__dirname, '..', 'videos', k + '.mp4'), j = path.join(__dirname, '..', 'videos', k + '.jpg');
    const size = fs.existsSync(f) ? fs.statSync(f).size : 0;
    ok(`file videos/${k}.mp4 exists, ${mb} MB as shown (±0,05), under 5 MB`, size > 0 && Math.abs(size / 1e6 - parseFloat(mb.replace(',', '.'))) <= 0.05 && size < 5e6, size);
    ok(`file videos/${k}.jpg exists, under 100 KB`, fs.existsSync(j) && fs.statSync(j).size < 100 * 1024);
  }

  for (const [w, h] of [[1180, 820], [390, 844]]) {
    const W = `${w}: `;
    const p = await newPage(b, w, h);
    // ---------- the login ----------
    ok(W + 'login: «¿Cómo funciona? Ver video» in the brand panel', (await p.locator('.lbrand #lvideo').innerText()).trim() === TX.loginVideo && await p.locator('#lvideo').isVisible());
    ok(W + 'login: no video downloaded before the tap', p.vids.length === 0, p.vids);
    await p.click('#lvideo'); await p.waitForTimeout(700);
    ok(W + 'login: the player over the screen, with the help video\'s title', (await p.locator('#vover [role="dialog"]').count()) === 1 && (await p.locator('#vover-t').innerText()) === TX.videoAyudaTitulo);
    ok(W + 'login: playback of the help video starts', (await p.getAttribute('#vover video', 'src')) === 'videos/ayuda.mp4' && await playing(p) && p.vids.includes('ayuda'));
    ok(W + 'login: the focus goes to «Cerrar»', (await p.evaluate(() => document.activeElement.id)) === 'vclose' && (await p.locator('#vclose').innerText()).trim() === TX.videoCerrar);
    await shot(p, `v1-login-video-${w}`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    ok(W + 'login: Escape closes it, the focus back on the button, no video left', (await p.locator('#vover').count()) === 0 && (await p.locator('video').count()) === 0 && (await p.evaluate(() => document.activeElement.id)) === 'lvideo');
    await p.click('#lvideo'); await p.waitForTimeout(200); await p.click('#vclose'); await p.waitForTimeout(150);
    ok(W + 'login: «Cerrar» closes it', (await p.locator('#vover').count()) === 0);
    await p.click('#lvideo'); await p.waitForTimeout(200); await p.mouse.click(5, h - 5); await p.waitForTimeout(150);
    ok(W + 'login: a tap outside closes it', (await p.locator('#vover').count()) === 0);
    await p.click('#swap'); await p.waitForTimeout(100);
    ok(W + 'sign-up form: the button is there too', (await p.locator('#lvideo').count()) === 1);
    await p.click('#swap'); await p.waitForTimeout(100);

    // ---------- Ayuda: the list ----------
    await signUpTo(p, `v${w}@x.com`, 'Vid' + w);
    p.vids.length = 0;
    await rail(p, 'ayuda'); await p.waitForTimeout(300);
    ok(W + 'Ayuda: the card «Cómo funciona aPrueba» keeps its six lines', (await p.locator('.pcard2 h2').innerText()) === TX.ayudaSubtitulo && (await p.locator('.alist li').count()) === 6);
    ok(W + 'Ayuda: the «Videos» card', (await p.locator('.vcard h2').innerText()) === TX.ayudaVideos);
    ok(W + 'Ayuda: four video cards, in order', (await p.$$eval('.vcard .vtile', e => e.map(x => x.dataset.video))).join() === VIDS.map(v => v[0]).join());
    ok(W + 'Ayuda: titles and lengths from the texts', (await p.$$eval('.vcard .vtile', e => e.map(x => x.querySelector('.vtit').textContent + '|' + x.querySelector('.vdur').textContent))).join() ===
      VIDS.map(v => TX[v[1] + 'Titulo'] + '|' + v[2]).join());
    ok(W + 'Ayuda: each card is a button labelled «Ver video: …»', (await p.$$eval('.vcard .vtile', e => e.map(x => x.tagName + '|' + x.getAttribute('aria-label')))).join() ===
      VIDS.map(v => 'BUTTON|' + TX.videoVer.replace('{titulo}', TX[v[1] + 'Titulo'])).join());
    ok(W + 'Ayuda: each card shows its still image', (await p.$$eval('.vcard .vposter img', e => e.map(x => x.complete && x.naturalWidth > 0))).every(Boolean));
    ok(W + 'Ayuda: no video downloaded before a tap', p.vids.length === 0, p.vids);
    ok(W + 'Ayuda: the cards in ' + (w < 600 ? 'two columns' : 'one row'), (await p.$$eval('.vcard .vtile', e => new Set(e.map(x => Math.round(x.getBoundingClientRect().top))).size)) === (w < 600 ? 2 : 1));
    await shot(p, `v2-ayuda-${w}`);

    // ---------- a vertical video ----------
    await p.click('.vcard [data-video="estudiantes"]'); await p.waitForTimeout(700);
    ok(W + 'vertical video: opens large on the Ayuda page, with «‹ Volver»', (await p.locator('.vwatch.v').count()) === 1 && (await p.locator('#back').count()) === 1 && (await p.locator('.vcard').count()) === 0);
    ok(W + 'vertical video: playback starts, and only that file is downloaded', (await p.getAttribute('.vwatch video', 'src')) === 'videos/estudiantes.mp4' && await playing(p) && p.vids.join() === 'estudiantes', p.vids);
    ok(W + 'vertical video: title, line, length and size', (await p.locator('.vinfo h2').innerText()) === TX.videoEstudiantesTitulo && (await p.locator('.vinfo p').innerText()) === TX.videoEstudiantesTexto
      && (await p.locator('.vinfo small').innerText()) === TX.videoDatos.replace('{duracion}', '0:40').replace('{mb}', '2,3'));
    ok(W + 'vertical video: «Otros videos» with the other three', (await p.locator('.votros').innerText()) === TX.videoOtros && (await p.$$eval('.vinfo .vtile', e => e.map(x => x.dataset.video))).join() === 'ayuda,familias,docentes');
    ok(W + 'vertical video: upright (taller than wide)', await p.evaluate(() => { const r = document.querySelector('.vplayer').getBoundingClientRect(); return r.height > r.width; }));
    await shot(p, `v3-video-vertical-${w}`);

    // ---------- another one from «Otros videos»: the help video, landscape ----------
    await p.click('.vinfo [data-video="ayuda"]'); await p.waitForTimeout(700);
    ok(W + 'help video from «Otros videos»: landscape, playing, one video on the page', (await p.locator('.vwatch.h').count()) === 1 && (await p.locator('video').count()) === 1 && await playing(p));
    ok(W + 'help video: no «Otros videos» under a landscape video', (await p.locator('.votros').count()) === 0);
    ok(W + 'help video: wider than tall', await p.evaluate(() => { const r = document.querySelector('.vplayer').getBoundingClientRect(); return r.width > r.height; }));
    await shot(p, `v4-video-ayuda-${w}`);

    // ---------- leaving ----------
    await p.click('#back'); await p.waitForTimeout(200);
    ok(W + '«‹ Volver»: back to the list, the video gone', (await p.locator('.vcard').count()) === 1 && (await p.locator('video').count()) === 0);
    await p.click('.vcard [data-video="familias"]'); await p.waitForTimeout(300); await rail(p, 'ayuda');
    ok(W + 'the rail\'s Ayuda while a video is open: back to the list', (await p.locator('.vcard').count()) === 1 && (await p.locator('video').count()) === 0);
    await p.click('.vcard [data-video="docentes"]'); await p.waitForTimeout(300); await rail(p, 'home');
    ok(W + 'leaving Ayuda: the video stops (gone from the page)', (await p.locator('video').count()) === 0);
    await rail(p, 'ayuda');
    ok(W + 'coming back to Ayuda: the list', (await p.locator('.vcard').count()) === 1);
    ok(W + 'no page errors', p.errs.length === 0, p.errs);
    await p.context().close();
  }

  await b.close();
  for (const [r, n] of res) console.log(r, n);
  const f = res.filter(r => r[0] === 'FAIL').length;
  console.log(`${res.length - f} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})();
