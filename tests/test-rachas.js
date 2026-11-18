// Rachas y puntos (decided 16 Nov 2026, built 17 Nov 2026). Three parts:
// A. The racha on the main page (1180 × 820): a day counts with a Prueba finished, Venezuela time; weekends never break
//    it; a missed school day does; today counts once a Prueba is finished; from 2 days «N días seguidos».
// B. The personal message when there is no racha: none with 0 Pruebas, the first Prueba, the Pruebas count, more than
//    last week (only when true), welcome back (after 3 days), progress by Materia (each Materia with 10 answers);
//    never the same line twice in a row.
// C. Points by scope and the bonuses, at 1180 × 820, 820 × 1180 and 390 × 844: Tema points on the tiles, the chip by
//    scope (its icon and label; the Materia chip opens the Tabla filtered), the intro total, a perfect Prueba on the
//    5th day of a racha (bigger pop from the 7th correct answer, 10 de 10, +140 puntos, +40 por aciertos seguidos,
//    the +50 sticker, the totals), the bonuses saved by the stand-in as the app showed them; the sweep (56 px touch
//    areas, WCAG contrast, no horizontal scroll) on the main page with the racha, the Materia screen and the result.
// Usage: python3 -m http.server 8765 & node tests/test-rachas.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions-5to.json'), 'utf8'));
const TX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const AJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ajustes.json'), 'utf8'));
const { smallTargets, lowContrast } = require('./sweep.js');
const URL = 'http://localhost:8765/';
const OUT = process.argv[2] || null;
const res = []; const ok = (n, c, detail) => { res.push([c ? 'PASS' : 'FAIL', n]); if (!c && detail && detail.length) console.log('   ' + n + ':\n     ' + [].concat(detail).join('\n     ')); };
const byStem = {}; for (const q of BANK.questions) byStem[q.stem.replace(/\s+/g, ' ').trim()] = q;

// Days in Venezuela time
const today = new Intl.DateTimeFormat('en-CA', { timeZone: AJ.zonaHoraria }).format(new Date());
const add = (k, n) => { const u = new Date(k + 'T00:00:00Z'); u.setUTCDate(u.getUTCDate() + n); return u.toISOString().slice(0, 10); };
const weekend = k => [0, 6].includes(new Date(k + 'T00:00:00Z').getUTCDay());
const schoolDays = n => { const out = []; let k = add(today, -1); while (out.length < n) { if (!weekend(k)) out.push(k); k = add(k, -1); } return out; };   // the n school days before today, newest first
const at = (ymd, hm = '12:00') => new Date(`${ymd}T${hm}:00-04:00`).toISOString();   // Caracas is UTC-4
const now = () => new Date(Date.now() - 60000).toISOString();

// Seed Pruebas: [{ fin, m (Materia), right (0 to 10) }]; 10 questions of Tema 1 of that Materia each
function seed(list) {
  const pr = [], an = [];
  list.forEach((x, i) => {
    const id = 'p-' + i, qs = BANK.questions.filter(q => q.materia === (x.m || 'CIE') && q.tema === 'T01').slice(0, 10), right = x.right ?? 6;
    qs.forEach((q, j) => an.push({ prueba_id: id, question_id: q.id, posicion: j + 1, opcion: j < right ? 'K' : 'D1', correcta: j < right, tiempo_ms: 4000, bono: 0 }));
    pr.push({ id, student_id: 'UID', tipo: 'tema', materia: x.m || 'CIE', tema: 'T01', started_at: x.fin, finished_at: x.fin, duracion_seg: 60, n_correctas: right, n_preguntas: 10, puntos: right * 10, bono_racha: 0 });
  });
  return { pr, an };
}
let n = 0;
async function student(b, list, w = 1180, h = 820) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.click('#swap'); await p.fill('#email', `r${++n}@x.com`); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', 'Ana'); await p.click('#go'); await p.waitForTimeout(150);
  await p.click('[data-g="5to"]'); await p.click('#go'); await p.waitForTimeout(150);   // the grade step (4to and 6to, 18 Nov 2026)
  await p.evaluate(s => {
    const d = JSON.parse(localStorage.getItem('mock.db')), uid = JSON.parse(localStorage.getItem('mock.session'));
    s.pr.forEach(x => { x.student_id = uid; }); d.pruebas.push(...s.pr); d.answers.push(...s.an);
    localStorage.setItem('mock.db', JSON.stringify(d));
  }, seed(list));
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(250);
  return p;
}
const racha = async p => ((await p.locator('.hracha').count()) ? (await p.locator('.hracha').innerText()).trim() : null);
const msg = async p => ((await p.locator('.hmsg').count()) ? (await p.locator('.hmsg').innerText()).trim() : null);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const groupHas = (g, text, v = {}) => TX.mensaje[g].some(l => fill(l.texto, v) === text);
async function visits(p, k) {   // the message on k visits to the main page
  const seen = [];
  for (let i = 0; i < k; i++) { seen.push(await msg(p)); await p.click('[data-rail="ayuda"]'); await p.click('[data-rail="home"]'); await p.waitForTimeout(20); }
  return seen;
}

(async () => {
  const b = await chromium.launch();
  const [S1, S2, S3, S4] = schoolDays(4);
  const dias = k => fill(TX.rachaDias, { n: k });

  // ==================== A. the racha ====================
  let p = await student(b, [{ fin: at(S3) }, { fin: at(S2) }, { fin: at(S1) }, { fin: now() }]);
  ok(`racha: today and the 3 school days before (weekends skipped) = «${dias(4)}» with the flame`, (await racha(p)) === dias(4) && (await p.locator('.hracha use').getAttribute('href')) === '#i-RACHA' && (await msg(p)) === null);
  await p.context().close();
  p = await student(b, [{ fin: at(S2) }, { fin: at(S1) }]);
  ok(`racha: no Prueba yet today, the days before still stand = «${dias(2)}»`, (await racha(p)) === dias(2));
  await p.context().close();
  p = await student(b, [{ fin: at(S3) }, { fin: at(S2) }]);
  ok('racha: a missed school day breaks it; no racha line, a personal message instead', (await racha(p)) === null && (await msg(p)) !== null);
  await p.context().close();
  p = await student(b, [{ fin: at(S1) }, { fin: at(S1, '15:00') }, { fin: at(S1, '18:00') }]);
  ok('racha: three Pruebas on one day are 1 day: no racha line («never call a single day a racha»)', (await racha(p)) === null);
  await p.context().close();
  // a Prueba at 23:30 in Caracas is 03:30 UTC the next day: it counts on the Caracas day
  p = await student(b, [{ fin: at(S2) }, { fin: at(S1, '23:30') }]);
  ok(`racha: days in Venezuela time (a Prueba at 23:30 counts that day) = «${dias(2)}»`, (await racha(p)) === dias(2));
  await p.context().close();
  // a weekend Prueba adds a day
  const sat = (() => { let k = add(today, -1); while (new Date(k + 'T00:00:00Z').getUTCDay() !== 6) k = add(k, -1); return k; })();
  const beforeSat = add(sat, -1), afterSat = add(sat, 2);   // Friday and Monday around that Saturday
  // Friday, Saturday and Monday (Sunday skipped) = 3 days; checked when that Monday is today or the last school day
  if (afterSat === today || afterSat === S1) {
    p = await student(b, [{ fin: at(beforeSat) }, { fin: at(sat) }, { fin: afterSat === today ? now() : at(afterSat) }]);
    ok(`racha: a Saturday Prueba adds a day (Friday, Saturday, Monday) = «${dias(3)}»`, (await racha(p)) === dias(3), [`got ${await racha(p)}`]);
    await p.context().close();
  }

  // ==================== B. the personal message ====================
  p = await student(b, []);
  ok('message: none with 0 Pruebas (the invitation is enough)', (await msg(p)) === null && (await racha(p)) === null);
  await p.context().close();
  p = await student(b, [{ fin: at(S1) }]);
  ok('message: one Prueba → a line of «mensaje.primera»', groupHas('primera', await msg(p)));
  await p.context().close();
  p = await student(b, [{ fin: at(S4) }, { fin: at(S1) }]);
  let seen = await visits(p, 8);
  ok('message: 2 Pruebas, recent, other weeks → only «mensaje.pruebas» with {n}=2', seen.every(x => groupHas('pruebas', x, { n: 2 })), seen);
  await p.context().close();
  const old = Array.from({ length: 6 }, (_, i) => ({ fin: at(add(today, -10 - i * 3)) }));
  p = await student(b, old);
  seen = await visits(p, 14);
  ok('message: last Prueba 10 days ago → «mensaje.regreso» appears (never says how many days)', seen.some(x => groupHas('regreso', x)) && seen.every(x => !/\d+ días/.test(x)), seen);
  ok('message: «mensaje.semana» never appears when this week has fewer Pruebas', !seen.some(x => groupHas('semana', x, {}) || /La semana pasada/.test(x)));
  ok('message: never the same line twice in a row', seen.every((x, i) => !i || x !== seen[i - 1]), seen);
  await p.context().close();
  // more than last week: 3 Pruebas today (racha 1, so no racha line) and 1 last week
  const lastWeek = add(today, -7);
  p = await student(b, [{ fin: at(lastWeek) }, { fin: now() }, { fin: now() }, { fin: now() }]);
  seen = await visits(p, 14);
  ok('message: 3 this week vs 1 last week → «mensaje.semana» appears, with 3 and 1', seen.some(x => groupHas('semana', x, { n: 3, m: 1 })), seen);
  await p.context().close();
  // progress by Materia: 10 answers in each Materia; Lengua furthest, Matemáticas least
  p = await student(b, [{ fin: at(S4), m: 'CIE', right: 5 }, { fin: at(S4, '13:00'), m: 'LEN', right: 9 }, { fin: at(S4, '14:00'), m: 'MAT', right: 1 }, { fin: at(S4, '15:00'), m: 'SOC', right: 4 }]);
  seen = await visits(p, 16);
  const av = seen.filter(x => TX.mensaje.avance.some(l => fill(l.texto, { materiaAvance: 'Lengua', materiaDescubrir: 'Matemáticas' }) === x));
  ok('message: progress by Materia names Lengua (furthest) and Matemáticas (most to discover)', av.length > 0, seen);
  await p.context().close();
  p = await student(b, [{ fin: at(S4), m: 'CIE' }, { fin: at(S4, '13:00'), m: 'LEN' }, { fin: at(S4, '14:00'), m: 'MAT' }]);
  seen = await visits(p, 14);
  ok('message: no progress line until every Materia has 10 answers', !seen.some(x => /avanzado|descubrir|buen camino/.test(x)), seen);
  await p.context().close();

  // ==================== C. points by scope and the bonuses ====================
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
    const tag = `${w}x${h}`, small = [], low = [], wide = [];
    const sweep = async name => {
      if (OUT) await q.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: w === 390 });
      (await smallTargets(q)).forEach(x => small.push(`${name}: ${x}`));
      (await lowContrast(q)).forEach(x => low.push(`${name}: ${x}`));
      if (await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) wide.push(name);
    };
    // 4 school days before today with a Ciencias Tema 1 Prueba each (6 of 10 right: 60 points)
    const q = await student(b, [{ fin: at(S4) }, { fin: at(S3) }, { fin: at(S2) }, { fin: at(S1) }], w, h);
    const chip = async () => ({ n: (await q.locator('#ptsbtn .n').innerText()).trim(), label: await q.getAttribute('#ptsbtn', 'aria-label'), icon: await q.locator('#ptsbtn .sc use').getAttribute('href') });
    let c = await chip();
    ok(`${tag} main page: racha «${dias(4)}», chip = grade total with the four-colour “+”`, (await racha(q)) === dias(4) && c.n === '240 puntos' && c.icon === '#i-ALL' && c.label === fill(TX.verTabla, { p: 240 }));
    await sweep('r1-pruebas-racha');
    await q.click('[data-m="CIE"]'); await q.waitForTimeout(80);
    c = await chip();
    ok(`${tag} Materia screen: chip = Ciencias points with its icon, label «… Ver la tabla de Ciencias»`, c.n === '240 puntos' && c.icon === '#i-CIE' && c.label === fill(TX.verTablaMateria, { p: 240, materia: 'Ciencias' }));
    ok(`${tag} Materia screen: Tema 1 tile «240 puntos», no badge at 0`, (await q.locator('[data-t="T01"] .tpts').innerText()) === '240 puntos' && (await q.locator('.ttile .tpts').count()) === 1);
    await sweep('r2-materia-puntos');
    await q.click('[data-t="T01"]'); await q.waitForTimeout(350);
    ok(`${tag} intro: «${fill(TX.introTotalTema, { n: 240 })}»`, (await q.locator('.gtot').innerText()).trim() === fill(TX.introTotalTema, { n: 240 }));
    await q.click('#start'); await q.waitForTimeout(80);
    c = await chip();
    ok(`${tag} question: chip = the Tema points with the Tema icon, label «… en este tema»`, c.icon === '#i-CIE-T01' && c.label === fill(TX.chipTema, { p: 240 }));
    const pops = [];
    for (let i = 0; i < 10; i++) {
      const qq = byStem[(await q.locator('.qstem').innerText()).replace(/\s+/g, ' ').trim()];
      await q.click(`.qo[data-o="${qq.correct}"]`); await q.waitForTimeout(40);
      pops.push((await q.getAttribute('#ptsbtn', 'class')).includes('big'));
      await q.waitForTimeout(720); await q.click('#next'); await q.waitForTimeout(40);
    }
    ok(`${tag} question: the bigger pop from the ${AJ.aciertosSeguidosDesde}th correct answer in a row only`, pops.join() === pops.map((_, i) => i + 1 >= AJ.aciertosSeguidosDesde).join(), [pops.join()]);
    await q.waitForTimeout(600);
    const gain = 10 * AJ.puntosPorCorrecta + (10 - AJ.aciertosSeguidosDesde + 1) * AJ.bonoAciertoSeguido;   // 140
    const lines = (await q.locator('.rline').allInnerTexts()).map(x => x.replace(/^✓\s*/, '').trim());
    ok(`${tag} result: 10 de 10, «+${gain} puntos» (a perfect Prueba = 140)`, (await q.locator('.sbig').innerText()) === '10 de 10' && (await q.locator('.score3 .gchip').innerText()) === `+${gain} puntos` && gain === 140);
    ok(`${tag} result: «+40 por aciertos seguidos» and «${fill(TX.resultadoTotalTema, { n: 240 + gain })}»`, lines[0] === fill(TX.resultadoAciertos, { p: 40 }) && lines.includes(fill(TX.resultadoTotalTema, { n: 240 + gain })), lines);
    ok(`${tag} result: the racha sticker «+50 por tu racha de 5 días», and no racha line with it`, (await q.getAttribute('.stk', 'aria-label')) === fill(TX.stickerRacha, { p: AJ.bonoRacha, n: 5 })
      && !lines.some(x => x.startsWith(fill(TX.resultadoRacha, { n: '' }).trim().split(':')[0])));
    ok(`${tag} result: «de 5 días» kept together on the sticker`, await q.evaluate(() => /de 5 días$/.test(document.querySelector('.stk-t').textContent)));
    c = await chip();
    ok(`${tag} result: chip = grade total with the racha bonus (${240 + gain + AJ.bonoRacha})`, c.n === `${240 + gain + AJ.bonoRacha} puntos` && c.icon === '#i-ALL');
    await sweep('r3-resultado-sticker');
    const saved = await q.evaluate(() => { const d = JSON.parse(localStorage.getItem('mock.db')), pr = d.pruebas[d.pruebas.length - 1];
      return { puntos: pr.puntos, racha: pr.bono_racha, bonos: d.answers.filter(a => a.prueba_id === pr.id).sort((a, b) => a.posicion - b.posicion).map(a => a.bono).join() }; });
    ok(`${tag} saved as shown: 100 points, racha bonus 50, aciertos 0×6 then 10×4`, saved.puntos === 100 && saved.racha === 50 && saved.bonos === '0,0,0,0,0,0,10,10,10,10', [JSON.stringify(saved)]);
    // a second Prueba the same day: no new day, no racha line, no sticker
    await q.click('#again'); await q.waitForTimeout(350); await q.click('#start'); await q.waitForTimeout(80);
    for (let i = 0; i < 10; i++) { const qq = byStem[(await q.locator('.qstem').innerText()).replace(/\s+/g, ' ').trim()]; await q.click(`.qo[data-o="${(qq.correct + (i % 2)) % qq.options.length}"]`); await q.waitForTimeout(30); await q.click('#next'); await q.waitForTimeout(30); }
    await q.waitForTimeout(500);
    ok(`${tag} second Prueba the same day: no sticker, no racha line, no aciertos line`, (await q.locator('.stk').count()) === 0 && (await q.locator('.rline').count()) === 1);
    // the Materia chip opens the Tabla filtered to that Materia
    await q.click('[data-rail="home"]'); await q.click('[data-m="CIE"]'); await q.click('#ptsbtn'); await q.waitForTimeout(150);
    ok(`${tag} the Materia chip opens the Tabla filtered to Ciencias`, w < 960 ? (await q.locator('#tfbtn').innerText()).includes('Ciencias') : (await q.getAttribute('[data-tm="CIE"]', 'aria-pressed')) === 'true');
    ok(`${tag} new screens: no horizontal scroll`, wide.length === 0, wide);
    ok(`${tag} new screens: touch areas ≥ 56 px`, small.length === 0, small);
    ok(`${tag} new screens: text contrast passes WCAG`, low.length === 0, low);
    ok(`${tag} no page errors`, q.errs.length === 0, q.errs);
    await q.context().close();
  }

  await b.close();
  for (const [r, nm] of res) console.log(r, nm);
  const f = res.filter(r => r[0] === 'FAIL').length;
  console.log(`${res.length - f} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})();
