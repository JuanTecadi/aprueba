// Local test of v0.2 step 4: Pruebas, answers and thumbs saved online (Playwright + mock-supabase.js).
// Usage: (from the repository) python3 -m http.server 8765 & node tests/test-save.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
const URL = 'http://localhost:8765/';
const results = []; const ok = (name, cond) => results.push([cond ? 'PASS' : 'FAIL', name]);

async function newPage(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: opts.w || 1180, height: opts.h || 820 }, colorScheme: opts.dark ? 'dark' : 'light' });
  if (opts.db) await ctx.addInitScript(d => { if (!localStorage.getItem('mock.db')) localStorage.setItem('mock.db', d); }, opts.db);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  return p;
}
const mockdb = p => p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')));
const pending = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('aprueba.v02.pendientes.')).reduce((n, k) => n + JSON.parse(localStorage.getItem(k)).length, 0));
async function playPrueba(p, opts = {}) {
  await p.click('#c-grado'); await p.click('#start');
  let n = 0;
  while (await p.locator('.qo').count() && n < 15) {
    if (n === 0 && opts.thumbs) await opts.thumbs();
    await p.locator('.qo').nth(n % 4).click(); await p.waitForTimeout(60);
    await p.click('#next'); await p.waitForTimeout(60); n++;
  }
  await p.waitForTimeout(200);
  return n;
}

(async () => {
  const b = await chromium.launch();
  // Device 1: sign up, nickname, a Prueba with thumbs
  const p = await newPage(b);
  await p.click('#swap'); await p.fill('#email', 'mama@x.com'); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', 'Ana'); await p.click('#go'); await p.waitForTimeout(150);
  let firstQ;
  const n1 = await playPrueba(p, { thumbs: async () => {
    firstQ = await p.evaluate(() => document.querySelector('.qcard3') && document.querySelector('.qcard3').innerText);
    await p.click('.vote3[data-v="1"]'); await p.waitForTimeout(80);
    const a = (await mockdb(p)).ratings; await p.click('.vote3[data-v="1"]'); await p.waitForTimeout(80);
    const b2 = (await mockdb(p)).ratings; await p.click('.vote3[data-v="-1"]'); await p.waitForTimeout(80);
    const c = (await mockdb(p)).ratings;
    ok('thumb up saved as a row (valor 1)', a.length === 1 && a[0].valor === 1);
    ok('tapping again removes the row', b2.length === 0);
    ok('thumb down saved (valor -1)', c.length === 1 && c[0].valor === -1);
  } });
  ok('Prueba played to the end', n1 === 10 && (await p.locator('#app').innerText()).includes('¡Terminaste la prueba!'));
  let d = await mockdb(p);
  ok('one Prueba and 10 answers saved', d.pruebas.length === 1 && d.answers.length === 10);
  const qmap = Object.fromEntries(BANK.questions.map(q => [q.id, q]));
  const pr = d.pruebas[0];
  ok('Prueba row fields', pr.tipo === 'grado' && pr.materia === null && pr.tema === null && pr.n_preguntas === 10 && pr.duracion_seg >= 0 && /^[0-9a-f-]{36}$/.test(pr.id) && pr.started_at && pr.finished_at);
  ok('answers carry option codes, correct only when K, positions 1-10, times', d.answers.every(a => ['K', 'D1', 'D2', 'D3'].includes(a.opcion) && a.correcta === (a.opcion === 'K') && a.tiempo_ms >= 0 && a.answered_at) && d.answers.map(a => a.posicion).join() === '1,2,3,4,5,6,7,8,9,10');
  ok('every answer refers to a real question', d.answers.every(a => qmap[a.question_id]));
  ok('n_correctas and points match the answers', pr.n_correctas === d.answers.filter(a => a.correcta).length && pr.puntos === pr.n_correctas * 10);
  ok('nothing left waiting on the device', (await pending(p)) === 0);
  const pts1 = await p.locator('.pts').innerText();
  ok('top bar points = saved points', pts1 === `${pr.puntos} puntos`);

  // Device 2 (other browser): same account sees the same points, map and thumb
  const p2 = await newPage(b, { db: JSON.stringify(d) });
  await p2.fill('#email', 'mama@x.com'); await p2.fill('#pass', 'clave123'); await p2.click('#go'); await p2.waitForTimeout(250);
  ok('other device: same nickname and points', (await p2.locator('#top').innerText()).includes('¡Hola, Ana!') && (await p2.locator('.pts').innerText()) === pts1);
  await p2.click('[data-rail="progreso"]'); await p2.waitForTimeout(150);
  ok('other device: map is no longer empty', !(await p2.locator('#app').innerText()).includes('todavía está vacío'));
  ok('no page errors on device 2', p2.errs.length === 0);
  await p2.context().close();

  // Offline at the end of a Prueba: result still shows, the Prueba waits on the device, then is sent
  await p.click('[data-rail="home"]');
  await p.evaluate(() => localStorage.setItem('mock.offline', 'true'));
  await playPrueba(p);
  ok('offline: result screen still shows', (await p.locator('#app').innerText()).includes('¡Terminaste la prueba!'));
  ok('offline: the Prueba waits on the device', (await pending(p)) === 1 && (await mockdb(p)).pruebas.length === 1);
  const ptsOff = await p.locator('.pts').innerText();
  await p.evaluate(() => localStorage.setItem('mock.offline', 'false'));
  await p.click('[data-rail="home"]'); await playPrueba(p);
  d = await mockdb(p);
  ok('back online: the waiting Prueba and the new one are saved', d.pruebas.length === 3 && d.answers.length === 30 && (await pending(p)) === 0);
  // Reload: history comes from the server, no duplicates
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(200);
  const total = d.pruebas.reduce((a, x) => a + x.puntos, 0);
  ok('after reload: points = sum of saved Pruebas (no duplicates)', (await p.locator('.pts').innerText()) === `${total} puntos` && parseInt(ptsOff) <= total);
  ok('no page errors on device 1', p.errs.length === 0);
  if (p.errs.length) console.log(p.errs);
  await b.close();
  for (const r of results) console.log(r.join('  '));
  const f = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - f} passed, ${f} failed`); process.exit(f ? 1 : 0);
})();
