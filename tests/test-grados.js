// 4to and 6to in one app (decided 18 November 2026, built on the branch grados): the grade step at sign-up, the free
// switch in Configuración, the grade identity on screen, one question file per grade (only the current grade's file is
// downloaded), progress, points and the Tabla per grade, the racha across grades, the grade saved with each Prueba, and
// the switch without a connection. Functional checks at 1180 × 820; the grade step and the switch also at 820 × 1180 and
// 390 × 844. (Contrast, touch sizes and sideways scroll of every grade screen: test-step5.js, part B.)
// Usage: python3 -m http.server 8765 & node tests/test-grados.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const TX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const BANKS = Object.fromEntries(['4to', '5to', '6to'].map(g => [g, JSON.parse(fs.readFileSync(path.join(__dirname, '..', `questions-${g}.json`), 'utf8'))]));
const URL = 'http://localhost:8765/';
const OUT = process.argv[2] || null;
const res = []; const ok = (n, c) => res.push([c ? 'PASS' : 'FAIL', n]);
const byStem = {}; for (const g in BANKS) for (const q of BANKS[g].questions) byStem[q.stem.replace(/\s+/g, ' ').trim()] = q;

async function newPage(b, w = 1180, h = 820) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  p.files = []; p.on('request', r => { const m = r.url().match(/questions-\w+\.json/); if (m) p.files.push(m[0]); });
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  return p;
}
const mockdb = p => p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')));
const ptsNum = async p => parseInt((await p.locator('#ptsbtn .n').innerText()).replace(/\D/g, ''), 10);
const rail = async (p, v) => { await p.click(`[data-rail="${v}"]`); await p.waitForTimeout(150); };
const bg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const shot = async (p, n) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, n + '.png') }); } };
async function signUpTo(p, email, nick) {
  await p.click('#swap'); await p.fill('#email', email); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', nick); await p.click('#go'); await p.waitForTimeout(200);
}
async function playTodo(p, right = () => true) {   // a whole-grade Prueba; returns the question ids
  await rail(p, 'home'); await p.click('#c-grado'); await p.click('#start'); await p.waitForTimeout(80);
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const q = byStem[(await p.locator('.qstem').innerText()).replace(/\s+/g, ' ').trim()]; ids.push(q.id);
    await p.click(`.qo[data-o="${right(i) ? q.correct : (q.correct + 1) % 4}"]`); await p.waitForTimeout(40); await p.click('#next'); await p.waitForTimeout(40);
  }
  await p.waitForTimeout(250);
  return ids;
}
const own = async p => { await rail(p, 'tabla'); await p.waitForTimeout(250); const t = await p.locator('.brd5 li.me .pp').innerText().catch(() => ''); return parseInt(t.replace(/\D/g, ''), 10) || 0; };

(async () => {
  const b = await chromium.launch();

  // ---------- A. The whole flow at 1180 × 820 ----------
  const p = await newPage(b);
  ok('login: the logo without a grade, tab title «aPrueba»', (await p.getAttribute('.lbrand .logo', 'src')) === 'img/aprueba-on-dark.svg' && (await p.title()) === 'aPrueba');
  ok('login: no question file downloaded before sign-in', p.files.length === 0);
  await signUpTo(p, 'g@x.com', 'Gabi');
  ok('grade step: title and help line', (await p.locator('.grdcard h1').innerText()) === TX.gradoTitulo && (await p.locator('.grdcard .gsub').innerText()) === TX.gradoAyuda);
  ok('grade step: one card per grade offered, in order', (await p.$$eval('.gopt', e => e.map(x => x.dataset.g))).join() === '4to,5to,6to');
  ok('grade step: each card with its chivo and logo', (await p.$$eval('.gopt', e => e.map(x => x.querySelector('.gchivo').getAttribute('src') + ' ' + x.querySelector('.glogo').getAttribute('src')))).join() ===
    'img/chivo-4to-saludo.svg img/aprueba-4to-on-dark.svg,img/chivo-saludo.svg img/aprueba-5to-on-dark.svg,img/chivo-6to-saludo.svg img/aprueba-6to-on-dark.svg');
  ok('grade step: none chosen, «Continuar» disabled', (await p.locator('.gopt[aria-pressed="true"]').count()) === 0 && await p.locator('#go').isDisabled());
  await p.click('[data-g="4to"]'); await p.waitForTimeout(80);
  ok('grade step: the tapped card is marked, «Continuar» enabled', (await p.getAttribute('[data-g="4to"]', 'aria-pressed')) === 'true' && !(await p.locator('#go').isDisabled()));
  await shot(p, 'A1-grado');
  await p.click('#go'); await p.waitForTimeout(300);
  ok('4to: saved on the account', (await mockdb(p)).users.find(u => u.nickname === 'Gabi').grado === '4to');
  ok('4to: only the 4to question file downloaded', p.files.join() === 'questions-4to.json');
  ok('4to: green-teal background #063F36', (await bg(p)) === 'rgb(6, 63, 54)');
  ok('4to: «Todo 4to», the 4to chivo, the tab title', (await p.locator('.gtile').innerText()).includes('Todo 4to') && (await p.getAttribute('.deco', 'src')) === 'img/chivo-4to-saludo.svg' && (await p.title()) === 'aPrueba 4to');
  ok('4to: the Andes (three layers)', (await p.locator('#land path').count()) === 3);
  await shot(p, 'A2-home-4to');
  await p.click('[data-m="CIE"]'); await p.waitForTimeout(120);
  ok('4to: Tema tiles show the number (no 4to icons yet) and the 4to names', (await p.locator('.ttile .tnum').count()) === 12 && (await p.locator('.ttile .tn').first().innerText()) === BANKS['4to'].materias[0].temas[0].name);
  const ids4 = await playTodo(p);
  ok('4to Prueba: only 4to questions', ids4.every(id => /^[A-Z]{3}4-/.test(id)));
  let db = await mockdb(p);
  ok('4to Prueba: saved with grado 4to (140 points with the bonus)', db.pruebas.length === 1 && db.pruebas[0].grado === '4to');
  await rail(p, 'home');
  ok('4to: the points chip shows 140', (await ptsNum(p)) === 140);
  ok('4to: own row on the 4to board = 140', (await own(p)) === 140);
  await rail(p, 'progreso');
  ok('4to: map tab «Todo 4to», no icons on the rows', (await p.locator('[data-mat="ALL"]').innerText()) === 'Todo 4to' && (await p.locator('.mtr .mti').count()) === 0);

  // Configuración: the grade row, «Cambiar», «‹ Volver» leaves without changing
  await rail(p, 'config');
  ok('Configuración: the grade pill 4to and «Cambiar»', (await p.locator('.crow .gctl .gpill').innerText()) === '4to' && (await p.locator('#cgrado').innerText()) === TX.gradoCambiar);
  await p.click('#cgrado'); await p.waitForTimeout(100);
  ok('grade cards from Configuración: the current grade marked, the change note, the rail', (await p.getAttribute('[data-g="4to"]', 'aria-pressed')) === 'true'
    && (await p.locator('.grdcard .gsub').innerText()) === TX.gradoCambioNota && await p.locator('#rail').isVisible() && (await p.getAttribute('[data-rail="config"]', 'aria-current')) === 'page');
  await p.click('[data-g="6to"]'); await p.click('#back'); await p.waitForTimeout(120);
  ok('«‹ Volver» leaves without changing', (await p.locator('.crow .gctl .gpill').innerText()) === '4to' && (await mockdb(p)).users.find(u => u.nickname === 'Gabi').grado === '4to');

  // No connection: the switch is not saved
  await p.click('#cgrado'); await p.click('[data-g="6to"]');
  await p.evaluate(() => localStorage.setItem('mock.offline', 'true'));
  await p.click('#go'); await p.waitForTimeout(120);
  ok('no connection: the message, and the grade does not change', (await p.locator('#err').innerText()) === TX.errorConexion && (await p.title()) === 'aPrueba 4to');
  await p.evaluate(() => localStorage.setItem('mock.offline', 'false'));
  await p.click('#go'); await p.waitForTimeout(300);
  ok('switch to 6to: «Listo, guardado.» under the grade, pill 6to, saved', (await p.locator('#gok').innerText()) === TX.guardado && (await p.locator('.crow .gctl .gpill').innerText()) === '6to'
    && (await mockdb(p)).users.find(u => u.nickname === 'Gabi').grado === '6to');
  ok('6to: plum background #401C5C, tab title', (await bg(p)) === 'rgb(64, 28, 92)' && (await p.title()) === 'aPrueba 6to');
  ok('6to: the 6to question file downloaded only now', p.files.join() === 'questions-4to.json,questions-6to.json');
  await rail(p, 'home');
  ok('6to: «Todo 6to», the 6to chivo, the 6to points (0: the 4to points stay in 4to)', (await p.locator('.gtile').innerText()).includes('Todo 6to') && (await p.getAttribute('.deco', 'src')) === 'img/chivo-6to-saludo.svg' && (await ptsNum(p)) === 0);
  ok('6to: the racha counts the 4to Prueba of today (no «0»: a message or the racha line)', (await p.locator('.hmsg, .hracha').count()) === 1);
  await shot(p, 'A3-home-6to');
  ok('6to: own row on the 6to board shows «–» (no points in 6to)', (await own(p)) === 0);
  await rail(p, 'progreso');
  ok('6to: the map shows nothing started (the 4to answers stay in 4to)', (await p.locator('.mtr.lv0').count()) === 48);
  const ids6 = await playTodo(p, i => i < 5);
  ok('6to Prueba: only 6to questions', ids6.every(id => /^[A-Z]{3}6-/.test(id)));
  db = await mockdb(p);
  ok('6to Prueba: saved with grado 6to; the 4to Prueba still 4to', db.pruebas.length === 2 && db.pruebas[1].grado === '6to' && db.pruebas[0].grado === '4to');
  ok('6to: a second Prueba the same day adds no new racha day (no racha line on the result)', !(await p.locator('#app').innerText()).includes('Racha:'));
  await rail(p, 'home');
  ok('6to: the chip shows only the 6to points (50)', (await ptsNum(p)) === 50);
  ok('6to: own row on the 6to board = 50', (await own(p)) === 50);
  await rail(p, 'tabla'); await p.click('[data-tv="prac"]'); await p.waitForTimeout(80);
  ok('«Mi práctica» counts every grade (2 Pruebas this week)', (await p.locator('.wk4.cur .wn').innerText()) === '2 pruebas');

  // Reload: the session comes back in 6to, downloading only the 6to file
  p.files = [];
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(200);
  ok('reload: back in 6to, only the 6to file downloaded', (await p.title()) === 'aPrueba 6to' && p.files.join() === 'questions-6to.json' && (await ptsNum(p)) === 50);
  // Back to 4to: its points and map are still there
  await rail(p, 'config'); await p.click('#cgrado'); await p.click('[data-g="4to"]'); await p.click('#go'); await p.waitForTimeout(300);
  await rail(p, 'home');
  ok('back to 4to: the 140 points are still there', (await ptsNum(p)) === 140);
  await rail(p, 'ayuda');
  ok('Ayuda: the sixth line', (await p.locator('.alist li').count()) === 6 && (await p.locator('.alist li').last().innerText()) === TX.ayuda6);
  // Sign out: the login is on the 5to navy again
  await rail(p, 'config'); await p.click('#salir'); await p.waitForTimeout(150);
  ok('sign out: login on the 5to navy, title «aPrueba»', (await p.evaluate(() => getComputedStyle(document.querySelector('.lbrand')).backgroundColor)) === 'rgb(27, 42, 85)' && (await p.title()) === 'aPrueba' && !(await p.evaluate(() => document.body.className)).includes('g-4to'));
  ok('A: no page errors', p.errs.length === 0); if (p.errs.length) console.log(p.errs);
  await p.context().close();

  // ---------- B. The grade step and the switch at 820 × 1180 and 390 × 844 ----------
  for (const [w, h] of [[820, 1180], [390, 844]]) {
    const q = await newPage(b, w, h);
    await signUpTo(q, `s${w}@x.com`, `Sami${w}`);
    const boxes = await q.$$eval('.gopt', e => e.map(x => { const r = x.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
    const stacked = boxes.every((x, i) => i === 0 || x[1] > boxes[i - 1][1] + boxes[i - 1][3] - 1);
    ok(`${w}: grade cards ${w < 600 ? 'stacked' : 'side by side'}`, w < 600 ? stacked : boxes.every(x => Math.abs(x[1] - boxes[0][1]) < 1));
    ok(`${w}: no sideways scroll on the grade step`, !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await q.click('[data-g="6to"]'); await shot(q, `B-${w}-grado`); await q.click('#go'); await q.waitForTimeout(300);
    ok(`${w}: 6to chosen, its colour`, (await bg(q)) === 'rgb(64, 28, 92)');
    await rail(q, 'config'); await q.click('#cgrado'); await q.click('[data-g="5to"]'); await q.click('#go'); await q.waitForTimeout(300);
    ok(`${w}: switched to 5to, navy again`, (await bg(q)) === 'rgb(27, 42, 85)' && (await q.locator('#gok').innerText()) === TX.guardado);
    ok(`${w}: no page errors`, q.errs.length === 0);
    await q.context().close();
  }
  await b.close();
  for (const r of res) if (r[0] === 'FAIL') console.log(r.join('  '));
  const f = res.filter(r => r[0] === 'FAIL').length;
  console.log(`${res.length - f} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})();
