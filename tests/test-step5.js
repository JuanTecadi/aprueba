// v0.3 step 5 (8 Nov 2026; replaces the v0.2 step 5 test of 4 Nov 2026). Two parts:
// A. Points and board data on the v0.3 screens (1180 × 820): the chip pops on a correct answer only; an abandoned Prueba
//    saves nothing and the total returns; a finished Prueba is saved with its answers and codes; the board lists only
//    students who joined, ties share a rank, the Materia filter works, the switch is saved at once, the own row and
//    «Mi práctica» match the points chip; no connection: the board shows the message and the switch does not change.
// B. Every screen at 1180 × 820, 820 × 1180 and 390 × 844: no horizontal scroll, every control has a 56 px touch area,
//    every text passes its WCAG contrast limit (4.5:1, or 3:1 for large text), no page errors.
// Usage: python3 -m http.server 8765 & node tests/test-step5.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
const TX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const { smallTargets, lowContrast } = require('./sweep.js');
const URL = 'http://localhost:8765/';
const OUT = process.argv[2] || null;
const res = []; const ok = (n, c, detail) => { res.push([c ? 'PASS' : 'FAIL', n]); if (!c && detail && detail.length) console.log('   ' + n + ':\n     ' + detail.join('\n     ')); };
const byStem = {}; for (const q of BANK.questions) byStem[q.stem.replace(/\s+/g, ' ').trim()] = q;

// Other students already on the board (fixed points per scope)
const OTHERS = [
  { id: 'u-a', email: 'a@x.com', pass: 'x', nickname: 'Leoa', leaderboard: true, puntos: { ALL: 320, CIE: 60, MAT: 110 } },
  { id: 'u-b', email: 'b@x.com', pass: 'x', nickname: 'Cuco', leaderboard: true, puntos: { ALL: 310, MAT: 310 } },
  { id: 'u-c', email: 'c@x.com', pass: 'x', nickname: 'Tita', leaderboard: true, puntos: { ALL: 310 } },
  { id: 'u-d', email: 'd@x.com', pass: 'x', nickname: 'Paty', leaderboard: false, puntos: { ALL: 900 } }   // not opted in: never shown
];

async function newPage(b, o = {}) {
  const ctx = await b.newContext({ viewport: { width: o.w || 1180, height: o.h || 820 } });
  if (o.db) await ctx.addInitScript(d => { if (!localStorage.getItem('mock.db')) localStorage.setItem('mock.db', d); }, o.db);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  return p;
}
const mockdb = p => p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')));
const ptsNum = async p => parseInt((await p.locator('#ptsbtn .n').innerText()).replace(/\D/g, ''), 10);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const rail = async (p, v) => { await p.click(`[data-rail="${v}"]`); await p.waitForTimeout(120); };
async function signUp(p, email, nick, board = true) {
  await p.click('#swap'); await p.fill('#email', email); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', nick);
  if (!board) await p.click('#swt');
  await p.click('#go'); await p.waitForTimeout(150);
}
async function answer(p, right) {
  const q = byStem[(await p.locator('.qstem').innerText()).replace(/\s+/g, ' ').trim()];
  await p.click(`.qo[data-o="${right ? q.correct : (q.correct + 1) % q.options.length}"]`);
  return q;
}
async function playAll(p, pattern) {   // pattern(i) = answer correctly?
  for (let i = 0; i < 10; i++) { await answer(p, pattern(i)); await p.waitForTimeout(40); await p.click('#next'); await p.waitForTimeout(40); }
  await p.waitForTimeout(200);
}

(async () => {
  const b = await chromium.launch();

  // ==================== A. points and board data (1180 × 820) ====================
  const p = await newPage(b, { db: JSON.stringify({ users: OTHERS, pruebas: [], answers: [], ratings: [], rpcCalls: 0 }) });
  await signUp(p, 'mama@x.com', 'Ana', false);   // switch turned off on the nickname screen
  ok('nickname screen with the switch off: not on the board', (await mockdb(p)).users.find(u => u.nickname === 'Ana').leaderboard === false);
  ok('points chip: 0 puntos, label for screen readers', (await p.locator('#ptsbtn .n').innerText()) === '0 puntos' && (await p.getAttribute('#ptsbtn', 'aria-label')) === '0 puntos. Ver la tabla de posiciones');

  // ---------- board, not on it ----------
  await p.click('#ptsbtn'); await p.waitForTimeout(200);
  let tx = await p.locator('#app').innerText();
  ok('board lists only students who joined; ties share a rank', tx.includes('Leoa') && tx.includes('Cuco') && tx.includes('Tita') && !tx.includes('Paty')
    && (await p.locator('.brd4 li .rk4').allInnerTexts()).join() === '1,2,2');
  ok('switch off: note «Nadie ve tus puntos…», no own row', tx.includes(TX.tablaFueraNota) && !tx.includes('(tú)') && (await p.getAttribute('#swt4', 'aria-checked')) === 'false');
  await p.click('[data-tm="MAT"]'); await p.waitForTimeout(150);
  ok('Materia filter: board changes (Matemáticas: Cuco, Leoa)', (await p.locator('.brd4 li .nk').allInnerTexts()).join() === 'Cuco,Leoa');
  await p.click('[data-tm="ALL"]'); await p.waitForTimeout(150);
  await p.click('#swt4'); await p.waitForTimeout(200);
  ok('switch on: saved at once', (await mockdb(p)).users.find(u => u.nickname === 'Ana').leaderboard === true && (await p.getAttribute('#swt4', 'aria-checked')) === 'true');
  ok('joined with 0 points: own row «–» after the others', (await p.locator('.brd4 li.me').innerText()).includes('Ana (tú)') && (await p.locator('.brd4 li.me .rk4').innerText()) === '–');

  // ---------- live points ----------
  await rail(p, 'home'); await p.click('#c-grado'); await p.click('#start'); await p.waitForTimeout(100);
  const before = await ptsNum(p);
  await answer(p, true); await p.waitForTimeout(60);
  ok('correct answer: the chip pops at once', (await p.locator('#ptsbtn.pop').count()) === 1);
  await p.waitForTimeout(600);
  ok('correct answer: the chip shows +10', (await ptsNum(p)) === before + 10);
  await p.click('#next'); await p.waitForTimeout(60);
  await answer(p, false); await p.waitForTimeout(500);
  ok('wrong answer: no pop, total unchanged', (await ptsNum(p)) === before + 10 && (await p.locator('#ptsbtn.pop').count()) === 0);
  await p.click('#quit'); await p.click('#quit-yes'); await p.waitForTimeout(150);
  ok('abandoned Prueba: nothing saved, total back to the saved one', (await ptsNum(p)) === before && (await mockdb(p)).pruebas.length === 0);

  // ---------- a finished Prueba ----------
  await p.click('#c-grado'); await p.click('#start'); await p.waitForTimeout(80);
  await playAll(p, i => i % 3 !== 2);   // 7 of 10 correct
  tx = await p.locator('#app').innerText();
  ok('result: 7 de 10, +70 puntos', tx.includes('7 de 10') && tx.includes('+70 puntos'));
  ok('points chip after the Prueba = saved total', (await ptsNum(p)) === before + 70);
  let d = await mockdb(p);
  const pr = d.pruebas[0], an = d.answers.filter(a => a.prueba_id === pr.id);
  ok('saved: one Prueba, 10 answers, 7 with code K, 70 points', d.pruebas.length === 1 && an.length === 10 && an.filter(a => a.opcion === 'K').length === 7
    && an.every(a => (a.opcion === 'K') === a.correcta) && pr.puntos === 70 && pr.n_correctas === 7);

  // ---------- board and «Mi práctica» after playing ----------
  const total = await ptsNum(p);
  await p.click('#ptsbtn'); await p.waitForTimeout(200);
  ok('board: own row in place with the same points as the chip', (await p.locator('.brd4 li.me').innerText()).includes('Ana (tú)') && (await p.locator('.brd4 li.me .pp').innerText()) === `${total} puntos`);
  await p.click('[data-tv="prac"]'); await p.waitForTimeout(80);
  ok('Mi práctica: this week = the chip total, «1 prueba»', (await p.locator('.pnum:not(.dim) b').innerText()) === String(total) && (await p.locator('.wk4.cur .wn').innerText()) === '1 prueba');
  await rail(p, 'progreso');
  ok('maps after playing: no points', !/puntos/i.test(await p.locator('#app').innerText()));
  await rail(p, 'tabla'); await p.waitForTimeout(150);
  await p.click('#swt4'); await p.waitForTimeout(200);
  ok('leave the board: own row gone at once, saved', !(await p.locator('.brd4').innerText()).includes('Ana') && (await mockdb(p)).users.find(u => u.nickname === 'Ana').leaderboard === false);
  ok('A: no page errors', p.errs.length === 0); if (p.errs.length) console.log(p.errs);
  await p.context().close();

  // ---------- no connection ----------
  const po = await newPage(b);
  await signUp(po, 'off@x.com', 'Off');   // joined by default
  await po.evaluate(() => localStorage.setItem('mock.offline', 'true'));
  await rail(po, 'tabla'); await po.waitForTimeout(150);
  ok('no connection: the board shows «No hay conexión…»', (await po.locator('.pcard4').first().innerText()).includes(TX.errorConexion));
  await po.click('#swt4'); await po.waitForTimeout(150);
  ok('no connection: the board switch stays on, with the message', (await po.getAttribute('#swt4', 'aria-checked')) === 'true' && (await po.locator('#swerr').innerText()) === TX.errorConexion);
  await rail(po, 'config'); await po.click('#swtab'); await po.waitForTimeout(150);
  ok('no connection: the Configuración switch stays on, with the message', (await po.getAttribute('#swtab', 'aria-checked')) === 'true' && (await po.locator('#swerr').innerText()) === TX.errorConexion);
  await po.context().close();

  // ==================== B. every screen at three widths ====================
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
    const q = await newPage(b, { w, h });
    const small = [], low = [], wide = [];
    const visit = async name => {
      if (OUT) await q.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: w === 390 });
      (await smallTargets(q)).forEach(x => small.push(`${name}: ${x}`));
      (await lowContrast(q)).forEach(x => low.push(`${name}: ${x}`));
      if (await overflow(q)) wide.push(name);
    };
    await visit('01-login'); await q.click('#swap'); await visit('02-crear');
    await q.fill('#email', `s${w}@x.com`); await q.fill('#pass', 'clave123'); await q.check('#adulto'); await q.click('#go'); await q.waitForTimeout(150);
    await visit('03-apodo'); await q.fill('#nick', 'Ana' + w); await q.click('#go'); await q.waitForTimeout(150);
    await visit('04-pruebas');
    for (const m of ['CIE', 'LEN', 'MAT', 'SOC']) { await rail(q, 'home'); await q.click(`[data-m="${m}"]`); await visit(`05-materia-${m}`); }
    await q.click('#all'); await visit('06-intro-todo-SOC');
    await rail(q, 'home'); await q.click('#c-grado'); await visit('06-intro-todo5to');
    await rail(q, 'home'); await q.click('[data-m="CIE"]'); await q.locator('[data-t]').first().click(); await visit('06-intro-tema');
    await q.click('#start'); await q.waitForTimeout(80); await visit('07-pregunta');
    await answer(q, true); await q.waitForTimeout(80); await visit('08-correcta');
    await q.click('#next'); await q.waitForTimeout(60); await answer(q, false); await q.waitForTimeout(80); await visit('09-incorrecta');
    await q.click('#quit'); await q.waitForTimeout(60); await visit('10-salir'); await q.click('#quit-no'); await q.click('#next'); await q.waitForTimeout(60);
    while (await q.locator('.qo').count()) { await answer(q, true); await q.waitForTimeout(30); await q.click('#next'); await q.waitForTimeout(30); }
    await q.waitForTimeout(400); await visit('11-resultado');
    await q.click('#mis'); await q.locator('.rrow').nth(1).click(); await q.waitForTimeout(60); await visit('12-respuestas');
    await rail(q, 'progreso'); await visit('13-mapa-todo');
    for (const m of ['CIE', 'LEN', 'MAT', 'SOC']) { await q.click(`[data-mat="${m}"]`); await q.waitForTimeout(60); await visit(`14-mapa-${m}`); }
    await rail(q, 'tabla'); await q.waitForTimeout(150); await visit('15-tabla-posiciones');
    await q.click('[data-tv="prac"]'); await q.waitForTimeout(60); await visit('16-tabla-practica');
    await rail(q, 'ayuda'); await visit('17-ayuda');
    await rail(q, 'config'); await visit('18-config');
    ok(`${w}x${h} every screen: no horizontal scroll`, wide.length === 0, wide);
    ok(`${w}x${h} every screen: touch areas ≥ 56 px`, small.length === 0, small);
    ok(`${w}x${h} every screen: text contrast passes WCAG`, low.length === 0, low);
    ok(`${w}x${h} no page errors`, q.errs.length === 0, q.errs);
    await q.context().close();
  }

  await b.close();
  for (const [r, n] of res) console.log(r, n);
  const f = res.filter(r => r[0] === 'FAIL').length;
  console.log(`${res.length - f} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})();
