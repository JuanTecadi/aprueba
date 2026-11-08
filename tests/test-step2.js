// v0.3 step 2 (8 Nov 2026): login, sign-up, nickname (board switch saved with the nickname), Pruebas, Ayuda, Configuración
// at 1180 × 820, 820 × 1180 and 390 × 844. Usage: python3 -m http.server 8765 & node tests/test-step2.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs');
const MOCK = fs.readFileSync(require('path').join(__dirname, 'mock-supabase.js'), 'utf8');
const OUT = process.argv[2] || null;   // optional folder for screenshots
const res = []; const ok = (n, c) => res.push([c ? 'PASS' : 'FAIL', n]);
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
    await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
    const over = async n => ok(`${w} ${n}: no horizontal scroll`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    const shot = async n => { if (OUT) await p.screenshot({ path: `${OUT}/${n}-${w}.png` }); await over(n); };
    await shot('1-login');
    ok(`${w} login: no rail, no info area`, await p.evaluate(() => document.getElementById('rail').hidden && document.getElementById('top').hidden));
    await p.fill('#email', 'mama@x.com'); await p.click('#swap');
    ok(`${w} sign-up keeps the email`, (await p.inputValue('#email')) === 'mama@x.com');
    ok(`${w} sign-up shows the board notice`, (await p.locator('#app').innerText()).includes('aparecerá en la tabla'));
    await shot('2-crear');
    await p.fill('#pass', 'clave123'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${w} sign-up without the tick box: error`, (await p.locator('#err').innerText()).includes('Marca la casilla'));
    await p.check('#adulto'); await p.click('#go'); await p.waitForTimeout(200);
    ok(`${w} nickname switch starts on`, (await p.getAttribute('#swt', 'aria-checked')) === 'true');
    await shot('3-apodo');
    await p.fill('#nick', 'JuanCreador'); await p.click('#swt');
    ok(`${w} switch off keeps the typed nickname`, (await p.getAttribute('#swt', 'aria-checked')) === 'false' && (await p.inputValue('#nick')) === 'JuanCreador');
    await p.click('#swt'); await p.click('#go'); await p.waitForTimeout(200);
    const u = await p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')).users.find(x => x.nickname === 'JuanCreador'));
    ok(`${w} nickname and leaderboard saved together`, u.nickname === 'JuanCreador' && u.leaderboard === true);
    ok(`${w} main page: greeting in the information area`, (await p.locator('#top').innerText()).includes('¡Hola, JuanCreador!'));
    ok(`${w} main page: rail item Pruebas selected`, (await p.getAttribute('[data-rail="home"]', 'aria-current')) === 'page');
    await shot('4-pruebas');
    // tiles do not overlap
    const boxes = await p.$$eval('.mtile, .gtile', els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    let clash = false; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, c] = [boxes[i], boxes[j]]; if (a[0] < c[2] - 1 && c[0] < a[2] - 1 && a[1] < c[3] - 1 && c[1] < a[3] - 1) clash = true; }
    ok(`${w} main page: tiles do not overlap`, !clash);
    await p.click('[data-rail="ayuda"]'); await p.waitForTimeout(80);
    ok(`${w} Ayuda: five lines, numbers from the settings`, (await p.locator('.alist li').count()) === 5 && (await p.locator('.alist').innerText()).includes('responde 10 preguntas') && (await p.locator('.alist').innerText()).includes('suma 10 puntos'));
    ok(`${w} Ayuda: rail item selected`, (await p.getAttribute('[data-rail="ayuda"]', 'aria-current')) === 'page');
    await shot('5-ayuda');
    await p.click('[data-rail="config"]'); await p.waitForTimeout(80);
    await shot('6-config');
    await p.click('#swsnd'); ok(`${w} Config: sound switch off`, (await p.getAttribute('#swsnd', 'aria-checked')) === 'false' && (await p.getAttribute('#snd', 'aria-pressed')) === 'false');
    await p.click('#swsnd');
    await p.click('#swtab'); await p.waitForTimeout(80);
    ok(`${w} Config: board switch off saved`, (await p.getAttribute('#swtab', 'aria-checked')) === 'false' && (await p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')).users.find(x => x.nickname === 'JuanCreador').leaderboard)) === false);
    await p.fill('#nick', 'Juan2'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${w} Config: nickname saved`, (await p.locator('#ok').innerText()) === 'Listo, guardado.');
    await p.click('#salir'); await p.waitForTimeout(100);
    ok(`${w} Cerrar sesión goes to login`, (await p.locator('.lcard h1').innerText()) === '¡Qué bueno verte!');
    await p.fill('#email', 'mama@x.com'); await p.fill('#pass', 'clave123'); await p.click('#go'); await p.waitForTimeout(250);
    ok(`${w} login again: main page`, (await p.locator('#top').innerText()).includes('¡Hola, Juan2!'));
    ok(`${w} no page errors`, p.errs.length === 0); if (p.errs.length) console.log(p.errs);
    await ctx.close();
  }
  await b.close();
  for (const r of res) if (r[0] === 'FAIL') console.log(r.join('  '));
  console.log(res.filter(r => r[0] === 'PASS').length + ' passed, ' + res.filter(r => r[0] === 'FAIL').length + ' failed');
})();
