// Local test of v0.2 step 5 (4 Nov 2026): top bar, main page, live points, map without points, result page,
// Tabla de posiciones and «Tu progreso». Playwright + mock-supabase.js.
// Usage: (from the repository) python3 -m http.server 8765 & node tests/test-step5.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
const URL = 'http://localhost:8765/';
const SHOTS = process.argv[2] || null;
const results = []; const ok = (name, cond) => results.push([cond ? 'PASS' : 'FAIL', name]);
const byStem = {}; for (const q of BANK.questions) byStem[q.stem.replace(/\s+/g, ' ').trim()] = q;

// Other students already on the board (fixed points per scope)
const OTHERS = [
  { id: 'u-a', email: 'a@x.com', pass: 'x', nickname: 'Leoa', leaderboard: true, puntos: { ALL: 320, CIE: 60, MAT: 110 } },
  { id: 'u-b', email: 'b@x.com', pass: 'x', nickname: 'Cuco', leaderboard: true, puntos: { ALL: 310, MAT: 310 } },
  { id: 'u-c', email: 'c@x.com', pass: 'x', nickname: 'Tita', leaderboard: true, puntos: { ALL: 310 } },
  { id: 'u-d', email: 'd@x.com', pass: 'x', nickname: 'Paty', leaderboard: false, puntos: { ALL: 900 } }   // not opted in: never shown
];

async function newPage(b, o = {}) {
  const ctx = await b.newContext({ viewport: { width: o.w || 1180, height: o.h || 820 }, colorScheme: o.dark ? 'dark' : 'light' });
  if (o.db) await ctx.addInitScript(d => { if (!localStorage.getItem('mock.db')) localStorage.setItem('mock.db', d); }, o.db);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  return p;
}
const mockdb = p => p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')));
const ptsNum = async p => parseInt((await p.locator('#ptsbtn .n').innerText()).replace(/\D/g, ''), 10);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
// The question on screen and its correct option text
async function current(p) {
  const stem = (await p.locator('.qscreen .stem').innerText()).replace(/\s+/g, ' ').trim();
  const q = byStem[stem]; return { q, right: q && q.options[q.correct] };
}
async function answer(p, correct) {
  const { q, right } = await current(p);
  const opts = p.locator('.qscreen .opt');
  for (let i = 0; i < await opts.count(); i++) {
    const tx = (await opts.nth(i).innerText()).replace(/[✓✗]/g, '').replace(/\s+/g, ' ').trim();
    if ((tx === right.replace(/\s+/g, ' ').trim()) === correct) { await opts.nth(i).click(); return q; }
  }
}
async function signUp(p, email, nick) {
  await p.click('#tab-crear'); await p.fill('#email', email); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', nick); await p.click('#go'); await p.waitForTimeout(150);
}
async function playAll(p, pattern) {   // pattern(i) = answer correctly?
  for (let i = 0; i < 10; i++) { await answer(p, pattern(i)); await p.waitForTimeout(40); await p.locator('.side .btn-main').click(); await p.waitForTimeout(40); }
  await p.waitForTimeout(200);
}

(async () => {
  const b = await chromium.launch();
  const db = JSON.stringify({ users: OTHERS, pruebas: [], answers: [], ratings: [], rpcCalls: 0 });
  const p = await newPage(b, { db });
  await signUp(p, 'mama@x.com', 'Ana');

  // ---------- main page and top bar ----------
  const tiles = await p.locator('.menu.home7 > .mt').count();
  ok('main page: seven tiles', tiles === 7);
  ok('main page: no Configuración link at the bottom', (await p.locator('#app .btn-link').count()) === 0 && (await p.locator('#config').count()) === 1 && (await p.locator('#top #config').count()) === 1);
  const box = async s => p.locator(s).first().boundingBox();
  const g = await box('#c-grado'), pr = await box('#c-progreso'), tb = await box('#c-tabla'), m1 = await box('.home7 [data-m]');
  ok('landscape: Todo 5to double width, row 1 = Todo 5to, Mi progreso, Tabla', Math.abs(g.width - 2 * pr.width - 14) < 3 && Math.abs(g.y - pr.y) < 2 && Math.abs(pr.y - tb.y) < 2 && tb.x > pr.x);
  const mats = await p.locator('.home7 [data-m]').evaluateAll(els => els.map(e => e.getBoundingClientRect().y));
  ok('landscape: the four Materias in one row under it', mats.length === 4 && mats.every(y => Math.abs(y - mats[0]) < 2) && m1.y > g.y + g.height - 1);
  ok('icons: Mi progreso squares, podium, gear', (await p.locator('#c-progreso use[href="#i-PRG"]').count()) === 1 && (await p.locator('#c-tabla use[href="#i-TAB"]').count()) === 1 && (await p.locator('#config use[href="#i-CFG"]').count()) === 1 && (await p.locator('#ptsbtn use[href="#i-TAB"]').count()) === 1);
  ok('top bar order: name and gear, sound, points', (await p.evaluate(() => [...document.querySelector('#top .who').children].map(e => e.id).join())) === 'config,snd,ptsbtn');
  ok('top bar: points chip label for screen readers', (await p.locator('#ptsbtn').getAttribute('aria-label')) === '0 puntos. Ver la tabla de posiciones');
  await shot(p, '01-inicio-1180');
  await p.click('#config'); ok('name and gear open Configuración', (await p.locator('h1').innerText()) === 'Configuración' && (await p.locator('#sw').count()) === 1);
  ok('Configuración: leaderboard switch off for a new account', (await p.locator('#sw').getAttribute('aria-checked')) === 'false' && (await p.locator('#sw').innerText()).includes('Aparecer en la tabla de posiciones'));
  await p.click('#back'); await p.click('#ptsbtn'); await p.waitForTimeout(150);
  ok('points chip opens the Tabla de posiciones', (await p.locator('h1').innerText()) === 'Tabla de posiciones');

  // ---------- Tabla de posiciones, not opted in ----------
  let tx = await p.locator('#app').innerText();
  ok('board lists only opted-in students, ties share a rank', tx.includes('Leoa') && tx.includes('Cuco') && tx.includes('Tita') && !tx.includes('Paty')
    && (await p.locator('.board li .rk').allInnerTexts()).join() === '1,2,2');
  ok('switch off: «No apareces en la tabla» and its note', tx.includes('No apareces en la tabla') && tx.includes('Nadie ve tus puntos'));
  ok('own row absent when not opted in', !tx.includes('(tú)'));
  ok('week view: line «La tabla empieza de cero cada lunes.»', tx.includes('La tabla empieza de cero cada lunes.'));
  ok('no Profe Ariel on the board page', (await p.locator('#app img[src*="profe-ariel"]').count()) === 0);
  ok('Tu progreso: 8 weeks, current labelled «Esta»', (await p.locator('.bars .wk').count()) === 8 && (await p.locator('.bars .wk.cur .wl b').innerText()) === 'Esta');
  await p.click('[data-tm="MAT"]'); await p.waitForTimeout(150);
  ok('Materia filter: board changes (Matemáticas)', (await p.locator('.board li .nk').allInnerTexts()).join() === 'Cuco,Leoa');
  await p.click('[data-tm="LEN"]'); await p.waitForTimeout(150);
  ok('empty board shows «Todavía nadie aparece aquí…»', (await p.locator('#app').innerText()).includes('Todavía nadie aparece aquí'));
  await p.click('[data-tm="ALL"]'); await p.click('[data-per="mes"]'); await p.waitForTimeout(150);
  ok('month view: no Monday line', !(await p.locator('#app').innerText()).includes('cada lunes'));
  await p.click('[data-per="semana"]'); await p.waitForTimeout(100);
  // join the board
  await p.click('#sw'); await p.waitForTimeout(200);
  let d = await mockdb(p);
  ok('switch on: saved at once', d.users.find(u => u.nickname === 'Ana').leaderboard === true && (await p.locator('#sw').getAttribute('aria-checked')) === 'true' && (await p.locator('#app').innerText()).includes('Apareces en la tabla'));
  ok('opted in with 0 points: own row at the bottom with «–»', (await p.locator('.board li.me2').innerText()).includes('Ana (tú)') && (await p.locator('.board li.me2 .rk').innerText()) === '–');
  await shot(p, '05-tabla-1180');

  // ---------- live points ----------
  await p.click('#back'); await p.click('#c-grado'); await p.locator('#start').click(); await p.waitForTimeout(100);
  const before = await ptsNum(p);
  await answer(p, true); await p.waitForTimeout(60);
  ok('correct answer: chip pops at once', await p.locator('#ptsbtn.pop').count() === 1);
  await p.waitForTimeout(600);
  ok('correct answer: top bar +10 at once', (await ptsNum(p)) === before + 10);
  await shot(p, '02-pregunta-1180');
  await p.locator('.side .btn-main').click(); await p.waitForTimeout(60);
  await answer(p, false); await p.waitForTimeout(500);
  ok('wrong answer: top bar unchanged, no pop', (await ptsNum(p)) === before + 10 && (await p.locator('#ptsbtn.pop').count()) === 0);
  await p.click('#ptsbtn'); await p.waitForTimeout(80);
  ok('points chip during a Prueba asks the Salir confirmation first', (await p.locator('.confirm').count()) === 1 && (await p.locator('.confirm').innerText()).includes('tus puntos de esta prueba no se guardarán'));
  await p.click('#quit-no'); await p.click('#quit'); await p.click('#quit-yes'); await p.waitForTimeout(150);
  ok('abandoned Prueba: total returns to the saved one', (await ptsNum(p)) === before && (await mockdb(p)).pruebas.length === 0);

  // ---------- result page: whole grade ----------
  await p.click('#c-grado'); await p.locator('#start').click(); await p.waitForTimeout(80);
  await playAll(p, i => i % 3 !== 2);   // 7 of 10 correct
  tx = await p.locator('#app').innerText();
  ok('end of Prueba reached, 7 de 10, +70 puntos', tx.includes('¡Terminaste la prueba!') && tx.includes('7 de 10') && tx.includes('+70 puntos'));
  ok('top bar after the Prueba = saved total', (await ptsNum(p)) === before + 70);
  ok('launch tile: Todo 5to, yellow badge, not a button', (await p.locator('.endcard .ltile.grade').count()) === 1 && (await p.locator('.endcard button.ltile').count()) === 0 && (await p.locator('.ltile').innerText()).includes('Todo 5to'));
  await shot(p, '03-resultado-1180');
  await p.click('#toggle-ans'); await p.waitForTimeout(80);
  ok('Ver mis respuestas: 10 rows, all closed', (await p.locator('.arow').count()) === 10 && (await p.locator('.arow[aria-expanded="true"]').count()) === 0 && (await p.locator('.aopen:not([hidden])').count()) === 0);
  ok('button now reads «Ocultar mis respuestas»', (await p.locator('#toggle-ans').innerText()) === 'Ocultar mis respuestas');
  const loc0 = await p.locator('.arow .loc').first().innerText();
  ok('whole grade: location line Materia › Tema › Subtema', (loc0.match(/›/g) || []).length === 2 && /^(Ciencias|Lengua|Matemáticas|Sociales) › /.test(loc0));
  await p.locator('.arow').nth(2).click();   // a wrong one (i = 2)
  let open = p.locator('.aopen:not([hidden])');
  ok('wrong row opens: Tu respuesta ✗, Respuesta correcta, Explicación', (await open.count()) === 1 && /Tu respuesta/i.test(await open.innerText()) && /Respuesta correcta/i.test(await open.innerText()) && /Explicación/i.test(await open.innerText()) && (await open.locator('.ans.no2').count()) === 1);
  await shot(p, '04-respuestas-1180');
  await p.locator('.arow').nth(0).click();   // a right one: closes row 3
  open = p.locator('.aopen:not([hidden])');
  ok('one row at a time; right row has no «Respuesta correcta»', (await open.count()) === 1 && (await p.locator('.arow').nth(0).getAttribute('aria-expanded')) === 'true' && !/Respuesta correcta/i.test(await open.innerText()));
  await p.locator('.arow').nth(0).click();
  ok('tap again closes it', (await p.locator('.aopen:not([hidden])').count()) === 0);

  // ---------- map without points ----------
  await p.click('#prog'); await p.waitForTimeout(100);
  ok('map (Todo 5to): no points', !/puntos/i.test(await p.locator('#app').innerText()));
  for (const m of ['CIE', 'LEN', 'MAT', 'SOC']) { await p.click(`[data-mat="${m}"]`); await p.waitForTimeout(60); }
  ok('map (each Materia): no points', !/\d+ puntos/i.test(await p.locator('#app').innerText()));

  // ---------- Materia and Tema Pruebas: launch tile and location line ----------
  await p.click('#back'); await p.click('[data-m="MAT"]'); await p.click('#all'); await p.locator('#start').click();
  await playAll(p, () => true);
  ok('Todo Matemáticas: solid badge with the name', (await p.locator('.ltile.all').innerText()).includes('Todo Matemáticas'));
  await p.click('#toggle-ans');
  ok('Materia Prueba: location line «Tema N · Tema › Subtema»', /^Tema \d+ · .+ › .+/.test(await p.locator('.arow .loc').first().innerText()));
  await p.click('#home'); await p.click('[data-m="CIE"]'); await p.locator('[data-t]').first().click(); await p.locator('#start').click();
  await playAll(p, i => i < 5);
  ok('Tema Prueba: Tema badge with number and name', (await p.locator('.ltile.tema .bignum').innerText()) === '1');
  await p.click('#toggle-ans');
  ok('Tema Prueba: location line = Subtema only', !/›|·/.test(await p.locator('.arow .loc').first().innerText()));
  await shot(p, '06-resultado-tema-1180');

  // ---------- board after playing ----------
  const total = await ptsNum(p);
  await p.click('#ptsbtn'); await p.waitForTimeout(200);
  ok('board: own row highlighted with its points in place', (await p.locator('.board li.me2').innerText()).includes('Ana (tú)') && (await p.locator('.board li.me2 .pp').innerText()) === `${total} puntos`);
  ok('Tu progreso: this week = total points, Pruebas counted', (await p.locator('.prog2 .nums b').first().innerText()) === String(total) && (await p.locator('.bars .wk.cur .wp').innerText()) === '3');
  await p.click('#sw'); await p.waitForTimeout(200);
  ok('leave the board: disappears at once', !(await p.locator('.board').innerText()).includes('Ana') && (await mockdb(p)).users.find(u => u.nickname === 'Ana').leaderboard === false);
  ok('no page errors (1180)', p.errs.length === 0);

  // ---------- own row below the top (tablaTop = 8) ----------
  const many = OTHERS.concat(Array.from({ length: 9 }, (_, i) => ({ id: 'u-m' + i, email: i + '@m.com', pass: 'x', nickname: 'Alumno' + i, leaderboard: true, puntos: { ALL: 2000 - i * 10 } })));
  const pb = await newPage(b, { db: JSON.stringify({ users: many, pruebas: [], answers: [], ratings: [], rpcCalls: 0 }) });
  await signUp(pb, 'papa@x.com', 'Beto');
  await pb.click('#c-tabla'); await pb.waitForTimeout(150); await pb.click('#sw'); await pb.waitForTimeout(200);
  await pb.click('#back'); await pb.click('[data-m="SOC"]'); await pb.locator('[data-t]').first().click(); await pb.locator('#start').click();
  await playAll(pb, () => true);
  await pb.click('#ptsbtn'); await pb.waitForTimeout(200);
  const rows = await pb.locator('.board li:not(.gap)').count();
  ok('top 8 plus own row added below, highlighted', rows === 9 && (await pb.locator('.board li.gap').count()) === 1 && (await pb.locator('.board li').last().innerText()).includes('Beto (tú)'));

  // ---------- three widths and dark mode: no horizontal scroll, layout rules ----------
  for (const [w, h, dark] of [[820, 1180, false], [390, 844, false], [1180, 820, true], [390, 844, true]]) {
    const tag = `${w}x${h}${dark ? ' dark' : ''}`;
    const q = await newPage(b, { w, h, dark });
    await signUp(q, `${w}${dark}@x.com`, 'Ema' + w + (dark ? 'd' : ''));
    const gg = await q.locator('#c-grado').boundingBox(), app = await q.locator('.menu.home7').boundingBox();
    if (w < 960) ok(`${tag} Todo 5to full width on top`, Math.abs(gg.width - app.width) < 2);
    if (w < 600) ok(`${tag} only the gear shows in the top bar`, !(await q.locator('#config .nm').isVisible()) && await q.locator('#config .ic').isVisible());
    const tgt = await q.locator('#config').evaluate(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e, '::before'); return r.height - parseFloat(s.top) - parseFloat(s.bottom); });
    ok(`${tag} name button touch area ≥ 56 px`, tgt >= 55.5);
    let of = await overflow(q);
    await shot(q, `10-inicio-${tag.replace(' ', '-')}`);
    await q.click('#c-tabla'); await q.waitForTimeout(150); of = of || await overflow(q);
    await shot(q, `11-tabla-${tag.replace(' ', '-')}`);
    await q.click('#back'); await q.click('#c-grado'); await q.locator('#start').click(); await playAll(q, i => i % 2 === 0);
    of = of || await overflow(q);
    await q.click('#toggle-ans'); await q.locator('.arow').nth(1).click(); of = of || await overflow(q);
    await shot(q, `12-resultado-${tag.replace(' ', '-')}`);
    await q.click('#config'); of = of || await overflow(q);
    await shot(q, `13-config-${tag.replace(' ', '-')}`);
    await q.click('#back'); await q.click('#c-progreso'); of = of || await overflow(q);
    ok(`${tag} no horizontal scroll on main page, board, result, Configuración, map`, !of);
    ok(`${tag} no page errors`, q.errs.length === 0);
  }

  // ---------- no connection: board shows the connection message ----------
  const po = await newPage(b);
  await signUp(po, 'off@x.com', 'Off');
  await po.evaluate(() => localStorage.setItem('mock.offline', 'true'));
  await po.click('#c-tabla'); await po.waitForTimeout(150);
  ok('no connection: board shows «No hay conexión…»', (await po.locator('#app').innerText()).includes('No hay conexión'));
  await po.click('#sw'); await po.waitForTimeout(150);
  ok('no connection: switch stays off with the message', (await po.locator('#sw').getAttribute('aria-checked')) === 'false' && (await po.locator('#swerr').innerText()).includes('No hay conexión'));

  await b.close();
  for (const [r, n] of results) console.log(r, n);
  const f = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - f} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})();
