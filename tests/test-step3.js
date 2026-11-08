// v0.3 step 3 (8 Nov 2026): Materia screen, Prueba intro (game card), question (feedback below), result card (back of
// the card), «Mis respuestas»; at 1180 × 820, 820 × 1180 and 390 × 844. Also: the longest question plus its feedback
// fits at 1180 × 820, and a Tema reaching «Dominado» for the first time shows «nivel5» with the «Festejo» pose.
// Usage: python3 -m http.server 8765 & node tests/test-step3.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
const TEXTOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const OUT = process.argv[2] || null;
const URL = 'http://localhost:8765/';
const res = []; const ok = (n, c) => res.push([c ? 'PASS' : 'FAIL', n]);
const byStem = {}; for (const q of BANK.questions) byStem[q.stem.replace(/\s+/g, ' ').trim()] = q;

async function open(b, w, h, bank) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  if (bank) await p.route('**/questions.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(bank) }));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.click('#swap'); await p.fill('#email', 'a@x.com'); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', 'Ana'); await p.click('#go'); await p.waitForTimeout(150);
  return p;
}
const noScrollX = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
// The question on screen and the index (data-o) of its correct option
async function current(p) {
  const stem = (await p.locator('.qstem').innerText()).replace(/\s+/g, ' ').trim();
  const q = byStem[stem]; return { q, correct: q ? q.correct : 0 };
}
async function answer(p, right) {
  const { q, correct } = await current(p);
  const o = right ? correct : (correct + 1) % q.options.length;
  await p.click(`.qo[data-o="${o}"]`); await p.waitForTimeout(40);
  return q;
}
async function playAll(p, right) {
  let n = 0;
  while (await p.locator('.qo').count() && n < 15) { await answer(p, right); await p.click('#next'); await p.waitForTimeout(40); n++; }
  await p.waitForTimeout(120); return n;
}

(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
    const p = await open(b, w, h), tag = `${w}`;
    const shot = async n => { if (OUT) await p.screenshot({ path: `${OUT}/${n}-${w}.png` }); ok(`${tag} ${n}: no horizontal scroll`, await noScrollX(p)); };

    // Materia screen
    await p.click('[data-m="CIE"]'); await p.waitForTimeout(80);
    ok(`${tag} Materia: deep Ciencias background`, (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(10, 78, 112)');
    ok(`${tag} Materia: title, grade pill, Volver`, (await p.locator('#top h1').innerText()) === 'Ciencias' && (await p.locator('#top .gpill').count()) === 1 && (await p.locator('#top #back').count()) === 1);
    ok(`${tag} Materia: rail item Pruebas selected`, (await p.getAttribute('[data-rail="home"]', 'aria-current')) === 'page');
    ok(`${tag} Materia: line and «Todo Ciencias» tile`, (await p.locator('.mhead3 p').innerText()) === TEXTOS.materiaSub && (await p.locator('#all').innerText()) === 'Todo Ciencias');
    ok(`${tag} Ciencias: 12 Tema tiles with icons, «Tema N» under the name`, (await p.locator('.ttile[data-t] .tslot svg').count()) === 12 && (await p.locator('.ttile[data-t="T01"] .tno').innerText()) === 'Tema 1');
    const boxes = await p.$$eval('.ttile, #all', els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    let clash = false; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, c] = [boxes[i], boxes[j]]; if (a[0] < c[2] - 1 && c[0] < a[2] - 1 && a[1] < c[3] - 1 && c[1] < a[3] - 1) clash = true; }
    ok(`${tag} Materia: tiles do not overlap`, !clash);
    if (w !== 390) ok(`${tag} Materia: all 12 Tema tiles visible without scrolling`, Math.max(...boxes.map(x => x[3])) <= h);
    await shot('1-materia');
    await p.click('#back'); await p.click('[data-m="LEN"]'); await p.waitForTimeout(60);
    ok(`${tag} Lengua: every Tema tile has its Tema icon (8 Nov 2026), no number`, (await p.locator('.ttile[data-t] .tslot .ic').count()) === 12 && (await p.locator('.ttile .tnum').count()) === 0
      && (await p.locator('.ttile[data-t="T03"] use').getAttribute('href')) === '#i-LEN-T03');
    await p.click('#back'); await p.click('[data-m="SOC"]'); await p.waitForTimeout(60);
    ok(`${tag} Matemáticas: every Tema tile has its Tema icon`, await (async () => { await p.click('#back'); await p.click('[data-m="MAT"]'); await p.waitForTimeout(60);
      return (await p.locator('.ttile[data-t] .tslot .ic').count()) === 12 && (await p.locator('.ttile[data-t="T12"] use').getAttribute('href')) === '#i-MAT-T12'; })());
    await p.click('#back'); await p.click('[data-m="SOC"]'); await p.waitForTimeout(60);
    ok(`${tag} Sociales: 11 active with their Tema icons`, (await p.locator('.ttile[data-t] .tslot .ic').count()) === 11 && (await p.locator('.ttile[data-t="T11"] use').getAttribute('href')) === '#i-SOC-T11');
    ok(`${tag} Sociales: 11 active, «Tema 12» faint and not a button`, (await p.locator('.ttile[data-t]').count()) === 11 && (await p.locator('div.ttile.off').innerText()) === 'Tema 12');
    await p.click('#back');

    // Intro: the game card
    await p.click('[data-m="CIE"]'); await p.click('[data-t="T01"]'); await p.waitForTimeout(80);
    const T01 = BANK.materias.find(m => m.id === 'CIE').temas.find(x => x.id === 'T01').name;
    ok(`${tag} Intro: label, title, chips, instruction`, (await p.locator('.glbl').innerText()) === 'CIENCIAS · TEMA 1' && (await p.locator('.gcard h2').innerText()) === T01
      && (await p.locator('.gchip').allInnerTexts()).join('|') === '10 preguntas|+10 por acierto' && (await p.locator('.ginst').innerText()) === TEXTOS.introInstruccion);
    ok(`${tag} Intro: the Tema icon on the band, the card dealt in`, (await p.locator('.gband use').getAttribute('href')) === '#i-CIE-T01' && (await p.locator('.gcard.deal').count()) === 1);
    ok(`${tag} Intro: no mascot`, (await p.locator('#app img').count()) === 0);
    await p.waitForTimeout(350); await shot('2-intro');
    await p.click('#back'); ok(`${tag} Intro: Volver returns to the Materia`, (await p.locator('#all').count()) === 1);
    await p.click('[data-rail="home"]'); await p.click('#c-grado'); await p.waitForTimeout(60);
    ok(`${tag} Intro Todo 5to: yellow band with the four-colour +`, (await p.locator('.gband').evaluate(e => getComputedStyle(e).backgroundColor)) === 'rgb(255, 201, 60)' && (await p.locator('.gband use').getAttribute('href')) === '#i-ALL');
    await p.click('#back'); await p.click('[data-m="CIE"]'); await p.click('[data-t="T01"]'); await p.click('#start'); await p.waitForTimeout(80);

    // Question
    ok(`${tag} Question: rail hidden, reading tint`, (await p.evaluate(() => document.getElementById('rail').hidden && document.body.classList.contains('s-read'))));
    ok(`${tag} Question: 10 dots, first ringed; chip «Tema 1» with the Tema icon`, (await p.locator('.dots3 .dt').count()) === 10 && (await p.locator('.dots3 .dt.cur').count()) === 1
      && (await p.locator('.pchip').innerText()) === 'Tema 1' && (await p.locator('.pchip use').getAttribute('href')) === '#i-CIE-T01');
    ok(`${tag} Question: band with the Tema icon and «Ciencias · Tema», no feedback before answering, no watermark`, (await p.locator('.qloc').innerText()) === 'Ciencias · ' + T01 && (await p.locator('.qband > .ic use').getAttribute('href')) === '#i-CIE-T01' && (await p.locator('#fb').count()) === 0 && (await p.locator('.wmp').count()) === 0);
    const tops = await p.locator('.qo').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    ok(`${tag} Question: 2 × 2 options (one column on phones)`, tops.length === 4 && (w === 390 ? new Set(tops).size === 4 : tops[0] === tops[1] && tops[2] === tops[3] && tops[2] > tops[0]));
    await shot('3-pregunta');
    await p.click('.vote3[data-v="1"]'); ok(`${tag} Question: thumb up on`, (await p.getAttribute('.vote3[data-v="1"]', 'aria-pressed')) === 'true'); await p.click('.vote3[data-v="1"]');
    const before = await p.locator('.qo').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY)]; }).flat());
    const pts0 = parseInt(await p.locator('#ptsbtn').innerText());
    await answer(p, true); await p.waitForTimeout(600);
    const after = await p.locator('.qo').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY)]; }).flat());
    ok(`${tag} Question: the options do not move when the feedback appears`, before.every((v, i) => Math.abs(v - after[i]) <= 1)); if (!before.every((v, i) => Math.abs(v - after[i]) <= 1)) console.log(before, after);
    ok(`${tag} Question: correct verdict, +10, Explicación, Continuar`, (await p.locator('.qverd').innerText()).includes('✓ ¡Correcto!') && (await p.locator('.plus3').innerText()) === '+10'
      && (await p.locator('.qfb .qlbl').innerText()).toUpperCase() === 'EXPLICACIÓN' && (await p.locator('#next').innerText()) === 'Continuar' && (await p.locator('.qo.right').count()) === 1);
    ok(`${tag} Question: points grow in the information area`, parseInt(await p.locator('#ptsbtn').innerText()) === pts0 + 10);
    ok(`${tag} Question: first dot green`, (await p.locator('.dots3 .dt').first().getAttribute('class')).includes('ok'));
    ok(`${tag} Question: the feedback is on screen`, (await p.locator('#fb').evaluate(e => e.getBoundingClientRect().bottom)) <= h + 1);
    await shot('4-correcta');
    await p.mouse.click(Math.round(w / 2), 30 + (w === 390 ? 60 : 0)); await p.waitForTimeout(450);   // tap anywhere (the information area, off its buttons)
    if (await p.locator('#fb').count()) { await p.click('#next'); await p.waitForTimeout(60); }
    ok(`${tag} Question: moved on to question 2`, (await p.locator('.dots3').getAttribute('aria-label')) === 'Pregunta 2 de 10');
    await answer(p, false); await p.waitForTimeout(80);
    ok(`${tag} Question: wrong verdict, no +10, red and green`, (await p.locator('.qverd').innerText()).includes('✗ No es esa. La correcta está en verde.') && (await p.locator('.plus3').count()) === 0
      && (await p.locator('.qo.wrong').count()) === 1 && (await p.locator('.qo.right').count()) === 1);
    await shot('5-incorrecta');
    await p.click('#quit'); await p.waitForTimeout(60);
    ok(`${tag} Salir: confirmation`, (await p.locator('.qconfirm').innerText()).includes('no se guardarán'));
    await shot('6-salir');
    await p.click('#quit-no'); await p.click('#ptsbtn'); await p.waitForTimeout(60);
    ok(`${tag} Points chip during a Prueba: the same confirmation`, (await p.locator('.qconfirm').count()) === 1);
    await p.click('#quit-no'); await p.click('#next'); await p.waitForTimeout(40);
    // finish: questions 3 to 10 all correct → 9 of 10 = 90% → Festejo, top band
    while (await p.locator('.qo').count()) { await answer(p, true); await p.click('#next'); await p.waitForTimeout(40); }
    await p.waitForTimeout(150);
    ok(`${tag} Result: the back of the card (flip), label, title, score, points`, (await p.locator('.gcard.flip').count()) === 1 && (await p.locator('.glbl').innerText()) === ('CIENCIAS · TEMA 1 · ' + T01).toUpperCase()
      && (await p.locator('.gcard h2').innerText()) === '¡Terminaste la prueba!' && (await p.locator('.sbig').innerText()) === '9 de 10' && (await p.locator('.score3 .gchip').innerText()) === '+90 puntos');
    const msg = await p.locator('.smsg').innerText();
    ok(`${tag} Result: message from the top band (90%), no label`, (TEXTOS.resumen.feliz.some(x => x.texto === msg)) && (await p.locator('.resumen, .rpage h3').count()) === 0);
    ok(`${tag} Result: chivo «Festejo» (hidden on phones)`, (await p.locator('.rchivo').getAttribute('src')) === 'img/chivo-festejo.svg' && (await p.locator('.rchivo').isVisible()) === (w !== 390));
    ok(`${tag} Result: «Mis respuestas» and «Otra prueba»; rail back`, (await p.locator('.gacts .b').allInnerTexts()).join('|') === 'Mis respuestas|Otra prueba' && !(await p.evaluate(() => document.getElementById('rail').hidden)));
    await p.waitForTimeout(350); await shot('7-resultado');

    // Mis respuestas
    await p.click('#mis'); await p.waitForTimeout(80);
    ok(`${tag} Mis respuestas: title, 10 closed rows, rail visible, reading tint`, (await p.locator('#top h1').innerText()) === 'Mis respuestas' && (await p.locator('.rrow').count()) === 10
      && (await p.locator('.rrow[aria-expanded="true"]').count()) === 0 && !(await p.evaluate(() => document.getElementById('rail').hidden)) && (await p.evaluate(() => document.body.classList.contains('s-read'))));
    ok(`${tag} Mis respuestas: one Tema → no location line; ✗ on row 2 only`, (await p.locator('.rloc').count()) === 0 && (await p.locator('.rrow .mk.no2').count()) === 1 && (await p.locator('.rrow').nth(1).locator('.mk.no2').count()) === 1);
    await p.click('.rrow >> nth=1');
    ok(`${tag} Mis respuestas: open row shows the correct answer and the explanation, not «Tu respuesta»`, (await p.locator('#ar-1').isVisible()) && (await p.locator('#ar-1').innerText()).toUpperCase().includes('RESPUESTA CORRECTA') && (await p.locator('#ar-1').innerText()).toUpperCase().includes('EXPLICACIÓN') && !(await p.locator('#app').innerText()).includes('Tu respuesta'));
    await shot('8-respuestas');
    await p.click('.rrow >> nth=4');
    ok(`${tag} Mis respuestas: one row open at a time`, (await p.locator('.rrow[aria-expanded="true"]').count()) === 1 && !(await p.locator('#ar-1').isVisible()) && (await p.locator('#ar-4').isVisible()));
    await p.click('.rrow >> nth=0'); ok(`${tag} Mis respuestas: a correct row also shows the correct answer`, (await p.locator('#ar-0 .rans').count()) === 1);
    await p.click('#back'); await p.waitForTimeout(60);
    ok(`${tag} Volver: same result and message, no second flip`, (await p.locator('.smsg').innerText()) === msg && (await p.locator('.gcard.flip').count()) === 0);
    await p.click('#again'); await p.waitForTimeout(60);
    ok(`${tag} Otra prueba: the same Tema intro`, (await p.locator('.gcard h2').innerText()) === T01);

    // Todo Ciencias, all wrong → below 50%: Saludo, low band; location line «Tema N · Tema»
    await p.click('#back'); await p.click('#all'); await p.click('#start'); await p.waitForTimeout(60);
    ok(`${tag} Todo Ciencias: chip «Todo Ciencias»`, (await p.locator('.pchip').innerText()) === 'Todo Ciencias');
    await playAll(p, false);
    ok(`${tag} Result below 50%: Saludo pose, low band`, (await p.locator('.rchivo').getAttribute('src')) === 'img/chivo-saludo.svg' && TEXTOS.resumen.bajo.map(x => x.texto).includes(await p.locator('.smsg').innerText()));
    ok(`${tag} Result Todo Ciencias: label`, (await p.locator('.glbl').innerText()) === 'TODO CIENCIAS');
    await p.click('#mis'); await p.waitForTimeout(60);
    ok(`${tag} Mis respuestas Todo Ciencias: «Tema N · Tema» on every row`, (await p.locator('.rloc').count()) === 10 && /^Tema \d+ · /.test(await p.locator('.rloc').first().innerText()));

    // Todo 5to: chip and location line with the Materia
    await p.click('[data-rail="home"]'); await p.click('#c-grado'); await p.click('#start'); await p.waitForTimeout(60);
    ok(`${tag} Todo 5to: chip «Todo 5to» with the four-colour +`, (await p.locator('.pchip').innerText()) === 'Todo 5to' && (await p.locator('.pchip use').getAttribute('href')) === '#i-ALL');
    ok(`${tag} Todo 5to: the band shows the icon of the question's own Tema`, await p.evaluate(() => { const loc = document.querySelector('.qloc').textContent, h = document.querySelector('.qband > .ic use').getAttribute('href');
      return /^#i-(CIE|LEN|MAT|SOC)-T\d\d$/.test(h) && !!document.getElementById(h.slice(1)); }));
    await shot('9-todo5to');
    await playAll(p, true);
    await shot('10-resultado-todo');
    await p.click('#mis'); await p.waitForTimeout(60);
    ok(`${tag} Mis respuestas Todo 5to: Materia icon, name › Tema`, (await p.locator('.rloc').count()) === 10 && (await p.locator('.rloc svg').count()) === 10 && / › /.test(await p.locator('.rloc').first().innerText()));
    ok(`${tag} no page errors`, p.errs.length === 0); if (p.errs.length) console.log(p.errs);
    await p.context().close();
  }

  // The longest question plus its feedback fits at 1180 × 820 (How aPrueba works, NOT-07): a made-up worst case
  // (longest stem, the four longest options, longest feedback) and the three longest real questions.
  const len = q => q.stem.length + q.feedback.length + q.options.reduce((a, o) => a + o.length, 0);
  const longest = BANK.questions.slice().sort((a, c) => len(c) - len(a)).slice(0, 3);
  const maxBy = f => BANK.questions.reduce((a, q) => f(q) > f(a) ? q : a);
  const opts = BANK.questions.flatMap(q => q.options).sort((a, c) => c.length - a.length).slice(0, 4);
  const worst = { ...longest[0], id: 'CIE5-T01-S01-999', stem: maxBy(q => q.stem.length).stem, feedback: maxBy(q => q.feedback.length).feedback, options: opts, correct: 0, codes: ['K', 'D1', 'D2', 'D3'], order: 'Fixed' };
  const cases = [['worst case', worst], ...longest.map(q => [q.id, q])];
  console.log('Longest: stem ' + worst.stem.length + ', feedback ' + worst.feedback.length + ', options ' + opts.map(o => o.length).join('/') + ' characters');
  for (const [name, q] of cases) {
    const bank = JSON.parse(JSON.stringify(BANK));
    const one = { ...q, materia: 'CIE', tema: 'T01', subtema: 'S01', cluster: null };
    bank.questions = bank.questions.filter(x => !(x.materia === 'CIE' && x.tema === 'T01')).concat([one]);
    const p = await open(b, 1180, 820, bank);
    await p.click('[data-m="CIE"]'); await p.click('[data-t="T01"]'); await p.click('#start'); await p.waitForTimeout(60);
    await p.click(`.qo[data-o="${one.correct}"]`); await p.waitForTimeout(80);
    const fit = await p.evaluate(() => ({ next: document.getElementById('next').getBoundingClientRect().bottom, sh: document.documentElement.scrollHeight }));
    ok(`fit at 1180 × 820, ${name}: «Continuar» on screen without scrolling (bottom ${Math.round(fit.next)} px)`, fit.next <= 820 && fit.sh <= 821);
    if (OUT && name === 'worst case') await p.screenshot({ path: `${OUT}/11-fit-worst-1180.png` });
    if (name === 'worst case') {   // one question in the Tema, answered right: the Tema reaches «Dominado» for the first time
      await p.click('#next'); await p.waitForTimeout(120);
      ok('first «Dominado»: nivel5 message and the Festejo pose', (await p.locator('.smsg').innerText()) === TEXTOS.nivel5.replace('{tema}', bank.materias.find(m => m.id === 'CIE').temas.find(x => x.id === 'T01').name) && (await p.locator('.rchivo').getAttribute('src')) === 'img/chivo-festejo.svg');
      if (OUT) await p.screenshot({ path: `${OUT}/12-nivel5-1180.png` });
    }
    ok(`fit ${name}: no page errors`, p.errs.length === 0); if (p.errs.length) console.log(p.errs);
    await p.context().close();
  }
  await b.close();
  for (const r of res) if (r[0] === 'FAIL') console.log(r.join('  '));
  console.log(res.filter(r => r[0] === 'PASS').length + ' passed, ' + res.filter(r => r[0] === 'FAIL').length + ' failed');
})();
