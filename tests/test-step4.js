// v0.3 step 4 (8 Nov 2026): Progreso (map Todo 5to and map of one Materia, with the Materia colour scale) and Tabla
// («Posiciones» with medals, filters in one row and the switch card; «Mi práctica»); at 1180 × 820, 820 × 1180 and 390 × 844.
// Progress and Pruebas are seeded in the stand-in database: Ciencias Tema 12 and Matemáticas Tema 1 fully right
// («Dominado»), Ciencias Tema 1 about half, Ciencias Tema 3 answered but all wrong, one Prueba last week.
// Usage: python3 -m http.server 8765 & node tests/test-step4.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
const TX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const OUT = process.argv[2] || null;
const URL = 'http://localhost:8765/';
const res = []; const ok = (n, c) => res.push([c ? 'PASS' : 'FAIL', n]);
const qs = (m, t) => BANK.questions.filter(q => q.materia === m && q.tema === t);
const temaName = (m, t) => BANK.materias.find(x => x.id === m).temas.find(x => x.id === t).name;
const DAY = 864e5;

// Ten other students on the board (all ahead of Ana, so her own row comes after the top 8 with «⋮»)
const OTHERS = ['Pana_Andrés', 'LunaVerde', 'Tigre21', 'Sofi.R', 'Capi10', 'Mariposa', 'ElRayo', 'Kiki', 'Zeta', 'Nube']
  .map((n, i) => ({ id: 'u-o' + i, email: `o${i}@x.com`, pass: 'x', nickname: n, leaderboard: true, puntos: { ALL: 5000 - i * 100, CIE: i < 3 ? 900 - i * 100 : 0 } }));

function seedPruebas(uid) {
  const pr = [], an = [];
  const add = (m, t, list, rightN, when) => {
    const id = 'p-' + pr.length;
    list.forEach((q, i) => an.push({ prueba_id: id, question_id: q.id, posicion: i + 1, opcion: i < rightN ? 'K' : 'D1', correcta: i < rightN, tiempo_ms: 4000 }));
    const fin = new Date(when).toISOString();
    pr.push({ id, student_id: uid, tipo: 'tema', materia: m, tema: t, started_at: fin, finished_at: fin, duracion_seg: 60, n_correctas: rightN, n_preguntas: list.length, puntos: rightN * 10 });
  };
  const now = Date.now();
  add('CIE', 'T12', qs('CIE', 'T12'), qs('CIE', 'T12').length, now - 7 * DAY);   // last week
  add('MAT', 'T01', qs('MAT', 'T01'), qs('MAT', 'T01').length, now - 60000);
  const t1 = qs('CIE', 'T01'); add('CIE', 'T01', t1, Math.floor(t1.length / 2), now - 50000);
  add('CIE', 'T03', qs('CIE', 'T03').slice(0, 5), 0, now - 40000);
  return { pr, an };
}

async function open(b, w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.click('#swap'); await p.fill('#email', 'a@x.com'); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', 'Ana'); await p.click('#go'); await p.waitForTimeout(150);
  await p.evaluate(({ others, seed }) => {
    const d = JSON.parse(localStorage.getItem('mock.db')), uid = JSON.parse(localStorage.getItem('mock.session'));
    seed.pr.forEach(x => { x.student_id = uid; });
    d.users.push(...others); d.pruebas.push(...seed.pr); d.answers.push(...seed.an);
    localStorage.setItem('mock.db', JSON.stringify(d));
  }, { others: OTHERS, seed: seedPruebas('UID') });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(200);
  return p;
}
const noScrollX = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const css = (p, sel, prop) => p.locator(sel).first().evaluate((e, pr) => getComputedStyle(e)[pr], prop);
// WCAG contrast between an element's text colour and its background colour
const contrast = (p, sel) => p.locator(sel).first().evaluate(e => {
  const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const L = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  let el = e, bg = getComputedStyle(el).backgroundColor; while (/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && el.parentElement) { el = el.parentElement; bg = getComputedStyle(el).backgroundColor; }
  const a = L(rgb(getComputedStyle(e).color)), b = L(rgb(bg)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
});

(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
    const p = await open(b, w, h), tag = `${w}`;
    const shot = async n => { if (OUT) await p.screenshot({ path: `${OUT}/${n}-${w}.png`, fullPage: w === 390 }); ok(`${tag} ${n}: no horizontal scroll`, await noScrollX(p)); };

    // ---------- Map: Todo 5to ----------
    await p.click('[data-rail="progreso"]'); await p.waitForTimeout(80);
    ok(`${tag} Todo map: title, grade pill, rail Progreso selected, no back link`, (await p.locator('#top h1').innerText()) === TX.mapaTodoTitulo
      && (await p.locator('#top .gpill').count()) === 1 && (await p.getAttribute('[data-rail="progreso"]', 'aria-current')) === 'page' && (await p.locator('#top .b-back').count()) === 0);
    ok(`${tag} Todo map: tabs Todo 5to + 4 Materias, Todo pressed`, (await p.locator('[data-mat]').count()) === 5 && (await p.getAttribute('[data-mat="ALL"]', 'aria-pressed')) === 'true'
      && (await p.locator('[data-mat="ALL"]').innerText()) === 'Todo 5to');
    ok(`${tag} Todo map: four columns, 48 named rows`, (await p.locator('.mcol').count()) === 4 && (await p.locator('.mtr').count()) === 48);
    const row = (m, n) => `.mcol:nth-child(${['CIE', 'LEN', 'MAT', 'SOC'].indexOf(m) + 1}) .mtr:nth-child(${n})`;
    ok(`${tag} Todo map: Ciencias Tema 12 «Dominado» in the text tone, white text`, (await p.locator(row('CIE', 12)).getAttribute('class')).includes('lv5')
      && (await css(p, row('CIE', 12), 'backgroundColor')) === 'rgb(10, 110, 156)' && (await css(p, row('CIE', 12), 'color')) === 'rgb(255, 255, 255)');
    ok(`${tag} Todo map: Matemáticas Tema 1 «Dominado» (#3236B0)`, (await css(p, row('MAT', 1), 'backgroundColor')) === 'rgb(50, 54, 176)');
    ok(`${tag} Todo map: Ciencias Tema 1 half right = level 3 tint`, (await p.locator(row('CIE', 1)).getAttribute('class')).includes('lv3') && (await css(p, row('CIE', 1), 'backgroundColor')) === 'rgb(153, 198, 219)');
    ok(`${tag} Todo map: Tema answered all wrong = level 1 (started, not «Aún no»)`, (await p.locator(row('CIE', 3)).getAttribute('class')).includes('lv1'));
    ok(`${tag} Todo map: not started = white with a dashed outline`, (await css(p, row('CIE', 5), 'borderTopStyle')) === 'dashed' && (await css(p, row('CIE', 5), 'backgroundColor')) === 'rgb(255, 255, 255)');
    ok(`${tag} Todo map: Sociales «Tema 12» not active`, (await p.locator(row('SOC', 12)).getAttribute('class')).includes('off') && (await p.locator(row('SOC', 12)).innerText()).includes('Tema 12'));
    ok(`${tag} Todo map: rows show the Tema names`, (await p.locator(row('LEN', 1)).innerText()).includes(temaName('LEN', 'T01')));
    ok(`${tag} Todo map: key «Aún no», «Por practicar», five steps, «Dominado»`, (await p.locator('.mkey').innerText()).replace(/\s+/g, ' ').trim() === `${TX.mapaAunNo} ${TX.mapaPorPracticar} ${TX.mapaDominado}` && (await p.locator('.mkey .sw4').count()) === 6);
    ok(`${tag} Todo map: no points, no mascot`, !/puntos/i.test(await p.locator('#app').innerText()) && (await p.locator('#app img').count()) === 0);
    if (w === 1180) ok(`${tag} Todo map: all 48 rows and the key fit on screen`, (await p.locator('.mkey').evaluate(e => e.getBoundingClientRect().bottom)) <= h);
    ok(`${tag} Todo map: navy text on every level passes 4.5:1`, Math.min(await contrast(p, row('MAT', 2)), await contrast(p, row('CIE', 1)), await contrast(p, row('CIE', 12)), await contrast(p, row('MAT', 1))) >= 4.5);
    await shot('1-mapa-todo');

    // ---------- Map: one Materia ----------
    await p.click('.mcol:first-child .mch'); await p.waitForTimeout(80);
    ok(`${tag} Ciencias map: title, deep Ciencias background, Ciencias tab pressed`, (await p.locator('#top h1').innerText()) === 'Mapa · Ciencias'
      && (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(10, 78, 112)' && (await p.getAttribute('[data-mat="CIE"]', 'aria-pressed')) === 'true');
    ok(`${tag} Ciencias map: 12 Tema cards with the Tema icon and «TEMA N»`, (await p.locator('.tc4').count()) === 12 && (await p.locator('.tc4 .tch .ic').count()) === 12
      && (await p.locator('.tc4:nth-child(1) .tch').innerText()).trim() === 'TEMA 1');
    ok(`${tag} Ciencias map: Tema 12 «✓ Dominado», full bar, 100 %`, (await p.locator('.tc4:nth-child(12) .dom').count()) === 1 && (await p.locator('.tc4:nth-child(12) .tcb b').innerText()) === '100 %'
      && (await css(p, '.tc4:nth-child(12)', 'backgroundColor')) === 'rgb(10, 110, 156)');
    const t1 = qs('CIE', 'T01').length, pc1 = Math.floor(Math.floor(t1 / 2) / t1 * 100);
    ok(`${tag} Ciencias map: Tema 1 bar and number = ${pc1} %`, (await p.locator('.tc4:nth-child(1) .tcb b').innerText()) === `${pc1} %`
      && (await p.locator('.tc4:nth-child(1) .trk i').getAttribute('style')).includes(`width:${pc1}%`));
    ok(`${tag} Ciencias map: Tema 3 answered all wrong shows 0 %`, (await p.locator('.tc4:nth-child(3) .tcb b').innerText()) === '0 %');
    ok(`${tag} Ciencias map: not started = dashed card «Aún no»`, (await p.locator('.tc4:nth-child(5) .tcno').innerText()) === TX.mapaAunNo && (await css(p, '.tc4:nth-child(5)', 'borderTopStyle')) === 'dashed');
    ok(`${tag} Ciencias map: the note under the map with 80`, (await p.locator('.mnote').innerText()) === TX.mapaNota.replace('{p}', '80'));
    const cr = [await contrast(p, '.tc4:nth-child(1) .tch span'), await contrast(p, '.tc4:nth-child(1) .tcn'), await contrast(p, '.tc4:nth-child(12) .tcn'), await contrast(p, '.tc4:nth-child(5) .tcno'), await contrast(p, '.tc4:nth-child(12) .dom')];
    ok(`${tag} Ciencias map: card texts pass 4.5:1 (${cr.map(x => x.toFixed(1)).join(', ')})`, Math.min(...cr) >= 4.5);
    if (w === 1180) ok(`${tag} Ciencias map: 12 cards and the note fit on screen`, (await p.locator('.mnote').evaluate(e => e.getBoundingClientRect().bottom)) <= h);
    await shot('2-mapa-ciencias');
    await p.click('[data-mat="LEN"]'); await p.waitForTimeout(60);
    ok(`${tag} Lengua map: no Tema icons yet, «TEMA N» only, deep Lengua background`, (await p.locator('.tc4 .tch .ic').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(129, 27, 78)');
    await p.click('[data-mat="SOC"]'); await p.waitForTimeout(60);
    ok(`${tag} Sociales map: 11 cards and «Tema 12» not active`, (await p.locator('.tc4:not(.off)').count()) === 11 && (await p.locator('.tc4.off').innerText()) === 'TEMA 12');
    await p.click('[data-mat="MAT"]'); await p.waitForTimeout(60);
    ok(`${tag} Matemáticas map: Tema 1 Dominado, level 4 card passes`, (await p.locator('.tc4:nth-child(1) .dom').count()) === 1);
    await shot('3-mapa-matematicas');
    await p.click('[data-rail="home"]'); await p.click('[data-rail="progreso"]'); await p.waitForTimeout(60);
    ok(`${tag} Progreso opens on Todo 5to again`, (await p.getAttribute('[data-mat="ALL"]', 'aria-pressed')) === 'true');

    // ---------- Tabla: Posiciones ----------
    await p.click('[data-rail="tabla"]'); await p.waitForTimeout(150);
    ok(`${tag} Tabla: title, pill, «Posiciones» pressed`, (await p.locator('#top h1').innerText()) === TX.tablaTitulo && (await p.getAttribute('[data-tv="pos"]', 'aria-pressed')) === 'true');
    ok(`${tag} Tabla: filters, «Esta semana» and «Todo 5to» pressed`, (await p.locator('[data-per]').count()) === 3 && (await p.locator('[data-tm]').count()) === 5
      && (await p.getAttribute('[data-per="semana"]', 'aria-pressed')) === 'true' && (await p.getAttribute('[data-tm="ALL"]', 'aria-pressed')) === 'true');
    if (w === 1180) ok(`${tag} Tabla: the two filters sit in one row`, await p.evaluate(() => { const [a, b] = [...document.querySelectorAll('.frow4 .seg')].map(e => e.getBoundingClientRect()); return Math.abs(a.top - b.top) < 1 && b.right <= innerWidth; }));
    const rows = await p.locator('.brd4 li:not(.gap)').allInnerTexts();
    ok(`${tag} Tabla: top 8, «⋮», own row «Ana (tú)» below`, rows.length === 9 && (await p.locator('.brd4 li.gap').count()) === 1 && rows[8].includes('Ana (tú)') && (await p.locator('.brd4 li.me').count()) === 1);
    ok(`${tag} Tabla: points as «N puntos»`, rows[0].includes('5000 puntos') && rows[0].includes('Pana_Andrés'));
    ok(`${tag} Tabla: medal circles for ranks 1 to 3 only`, (await css(p, '.brd4 li:nth-child(1) .rk4', 'backgroundColor')) === 'rgb(255, 201, 60)' && (await p.locator('.rk4.md2').count()) === 1
      && (await p.locator('.rk4.md3').count()) === 1 && (await p.locator('.rk4[class*="md"]').count()) === 3);
    ok(`${tag} Tabla: own row in yellow`, (await css(p, '.brd4 li.me', 'backgroundColor')) === 'rgb(255, 243, 204)');
    ok(`${tag} Tabla: «La tabla empieza de cero cada lunes» on Esta semana`, (await p.locator('.pcard4').first().innerText()).includes(TX.tablaReinicio));
    ok(`${tag} Tabla: switch card on, with its note`, (await p.getAttribute('#swt4', 'aria-checked')) === 'true' && (await p.locator('.swcard').innerText()).includes(TX.tablaDentroNota) && (await p.locator('.swcard').innerText()).includes(TX.tablaSwitch));
    ok(`${tag} Tabla: no mascot`, (await p.locator('#app img').count()) === 0);
    await shot('4-tabla-posiciones');
    await p.click('[data-per="mes"]'); await p.waitForTimeout(120);
    ok(`${tag} Tabla: «Este mes» hides the Monday line`, (await p.getAttribute('[data-per="mes"]', 'aria-pressed')) === 'true' && !(await p.locator('#app').innerText()).includes(TX.tablaReinicio));
    await p.click('[data-tm="SOC"]'); await p.waitForTimeout(120);
    ok(`${tag} Tabla: nobody in Sociales → «Todavía nadie…» and own row with «–»`, (await p.locator('#app').innerText()).includes(TX.tablaVacia) && (await p.locator('.brd4 li.me .rk4').innerText()) === '–');
    await p.click('[data-tm="ALL"]'); await p.click('#swt4'); await p.waitForTimeout(150);
    ok(`${tag} Tabla: switch off → note changes, own row leaves the board`, (await p.getAttribute('#swt4', 'aria-checked')) === 'false' && (await p.locator('.swcard').innerText()).includes(TX.tablaFueraNota) && (await p.locator('.brd4 li.me').count()) === 0);
    await p.click('#swt4'); await p.waitForTimeout(150);
    ok(`${tag} Tabla: switch on again → own row back`, (await p.locator('.brd4 li.me').count()) === 1);

    // ---------- Tabla: Mi práctica ----------
    await p.click('[data-tv="prac"]'); await p.waitForTimeout(80);
    const nums = await p.locator('.pnum b').allInnerTexts();
    const ciePts = qs('CIE', 'T12').length * 10, now = qs('MAT', 'T01').length * 10 + Math.floor(t1 / 2) * 10;
    ok(`${tag} Mi práctica: this week ${now} and last week ${ciePts}`, nums[0] === String(now) && nums[1] === String(ciePts));
    ok(`${tag} Mi práctica: 8 weeks, current in yellow, «N pruebas» under each`, (await p.locator('.wk4').count()) === 8 && (await css(p, '.wk4.cur .bt4 i', 'backgroundColor')) === 'rgb(255, 201, 60)'
      && (await p.locator('.wk4.cur .wn').innerText()) === '3 pruebas' && (await p.locator('.wk4.cur .wd b').innerText()) === TX.progresoSemanaActual);
    ok(`${tag} Mi práctica: one Prueba last week says «1 prueba», empty weeks «0 pruebas»`, (await p.locator('.wk4:nth-child(7) .wn').innerText()) === '1 prueba' && (await p.locator('.wk4:nth-child(1) .wn').innerText()) === '0 pruebas');
    ok(`${tag} Mi práctica: title and «Solo tú ves esta página.»`, (await p.locator('.chart4 h2').innerText()) === TX.progresoTitulo && (await p.locator('.chart4').innerText()).includes(TX.progresoNota));
    ok(`${tag} Mi práctica: the tallest bar is the best week`, await p.evaluate(() => { const hs = [...document.querySelectorAll('.bt4 i')].map(i => i.getBoundingClientRect().height); return hs[7] === Math.max(...hs) && hs[6] > 6; }));
    ok(`${tag} Mi práctica: week labels stay inside their column`, await p.evaluate(() => [...document.querySelectorAll('.wk4')].every(c => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('.wn, .wd')].every(e => e.scrollWidth <= Math.ceil(r.width) + 1); })));
    if (w === 1180) ok(`${tag} Mi práctica: fits on screen`, (await p.locator('.chart4').evaluate(e => e.getBoundingClientRect().bottom)) <= h);
    await shot('5-tabla-practica');
    await p.click('[data-rail="home"]'); await p.click('#ptsbtn'); await p.waitForTimeout(120);
    ok(`${tag} Points chip opens the Tabla on «Posiciones»`, (await p.getAttribute('[data-tv="pos"]', 'aria-pressed')) === 'true');
    ok(`${tag} no page errors`, p.errs.length === 0);
    if (p.errs.length) console.log(p.errs);
    await p.context().close();
  }
  await b.close();
  const fail = res.filter(r => r[0] === 'FAIL');
  for (const r of res) if (r[0] === 'FAIL' || process.env.V) console.log(r[0], r[1]);
  console.log(`${res.length - fail.length}/${res.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
})();
