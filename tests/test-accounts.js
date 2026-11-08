// Accounts on the v0.3 screens (rewritten 8 Nov 2026, v0.3 step 5; v0.2 version 30 Oct 2026): sign-up rules, the parent's
// tick box sent as adult_confirmed, nickname rules (length, unique ignoring capitals and accents), session remembered,
// nickname change in Configuración, Cerrar sesión, wrong password, progress kept after login, existing email, no connection.
// Screens themselves are checked in test-step2.js. At 1180 × 820, 820 × 1180 and 390 × 844. Playwright + mock-supabase.js.
// Usage: (from the repository) python3 -m http.server 8765 & node tests/test-accounts.js [screenshot folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const TX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'textos.json'), 'utf8')).textos;
const SHOTS = process.argv[2] || null;
const URL = 'http://localhost:8765/';
const results = []; const ok = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); };

async function page(b, w, h, offline) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => offline ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  return p;
}
const err = p => p.locator('#err').innerText();
const greeting = p => p.locator('#top h1').innerText();
const points = p => p.locator('#ptsbtn .n').innerText();
const hscroll = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };

(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
    const tag = `${w}x${h}`;
    const p = await page(b, w, h);
    await p.goto(URL, { waitUntil: 'networkidle' });
    ok(`${tag} login form, no rail, no information area`, (await p.locator('.lcard h1').innerText()) === TX.loginTitulo && await p.locator('#top').isHidden() && await p.locator('#rail').isHidden());
    // Sign-up
    await p.click('#swap');
    ok(`${tag} sign-up form addressed to the parent`, (await p.locator('.lcard h1').innerText()) === TX.crearTitulo && (await p.locator('.lcard').innerText()).includes(TX.crearNota));
    await p.fill('#email', `papa${w}@x.com`); await p.fill('#pass', '123'); await p.click('#go');
    ok(`${tag} short password refused`, (await err(p)).includes('al menos 6 caracteres'));
    await p.fill('#pass', 'clave123'); await p.click('#go');
    ok(`${tag} tick box required`, (await err(p)) === TX.errorAdulto);
    await p.check('#adulto'); await p.click('#go'); await p.waitForTimeout(200);
    ok(`${tag} after sign-up: nickname screen, no rail, no information area`, (await p.locator('.ncard h1').innerText()) === TX.apodoTitulo && await p.locator('#top').isHidden() && await p.locator('#rail').isHidden());
    const adult = await p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')).users.slice(-1)[0].adult);
    ok(`${tag} tick box sent as adult_confirmed`, adult === true);
    // Nickname
    await p.fill('#nick', 'S'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} 1-character nickname refused`, (await err(p)).includes('Entre 2 y 20'));
    await p.fill('#nick', 'sofia'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} taken nickname refused (Sofía = sofia)`, (await err(p)) === TX.apodoOcupado);
    await p.fill('#nick', `Luis${w}`); await p.click('#go'); await p.waitForTimeout(200);
    ok(`${tag} main page after the nickname`, (await greeting(p)) === `¡Hola, Luis${w}!` && (await p.getAttribute('[data-rail="home"]', 'aria-current')) === 'page');
    // Session remembered
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(150);
    ok(`${tag} reload goes straight to the main page`, (await greeting(p)) === `¡Hola, Luis${w}!`);
    // Configuración: nickname rules again, then a change shown in the greeting
    await p.click('[data-rail="config"]'); await p.waitForTimeout(80);
    ok(`${tag} Configuración shows the nickname and the email`, (await p.inputValue('#nick')) === `Luis${w}` && (await p.locator('.cfgcard .email').innerText()) === `papa${w}@x.com`);
    await p.fill('#nick', 'Sofia '); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} Configuración refuses a taken nickname`, (await err(p)) === TX.apodoOcupado);
    await p.fill('#nick', 'x'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} Configuración refuses a 1-character nickname`, (await err(p)).includes('Entre 2 y 20'));
    await p.fill('#nick', `Lucho${w}`); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} Configuración saves the nickname`, (await p.locator('#ok').innerText()) === TX.guardado);
    await p.click('[data-rail="home"]'); await p.waitForTimeout(80);
    ok(`${tag} new nickname in the greeting`, (await greeting(p)) === `¡Hola, Lucho${w}!`);
    // Play one Prueba so the account has points
    await p.click('#c-grado'); await p.click('#start');
    let n = 0; while (await p.locator('.qo').count() && n < 15) { await p.locator('.qo').first().click(); await p.waitForTimeout(40); await p.click('#next'); await p.waitForTimeout(40); n++; }
    await p.waitForTimeout(150);
    ok(`${tag} a Prueba plays to the end`, n === 10 && (await p.locator('#app').innerText()).includes(TX.resultadoTitulo));
    const ptsTop = await points(p);
    // Cerrar sesión
    await p.click('[data-rail="config"]'); await p.click('#salir'); await p.waitForTimeout(150);
    ok(`${tag} Cerrar sesión goes to login`, (await p.locator('.lcard h1').innerText()) === TX.loginTitulo && await p.locator('#top').isHidden());
    // Login
    await p.fill('#email', `papa${w}@x.com`); await p.fill('#pass', 'mala'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} wrong password message`, (await err(p)) === TX.errorDatos);
    await p.fill('#pass', 'clave123'); await p.click('#go'); await p.waitForTimeout(250);
    ok(`${tag} login goes to the main page, points kept for this account`, (await greeting(p)) === `¡Hola, Lucho${w}!` && (await points(p)) === ptsTop);
    await shot(p, `cuentas-inicio-${w}`);
    // Existing email on sign-up
    await p.click('[data-rail="config"]'); await p.click('#salir'); await p.waitForTimeout(100); await p.click('#swap');
    await p.fill('#email', 'otra@x.com'); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} existing email message`, (await err(p)) === TX.errorExiste);
    await shot(p, `cuentas-existe-${w}`);
    ok(`${tag} no horizontal scroll on login`, !(await hscroll(p)));
    ok(`${tag} no page errors`, p.errs.length === 0);
    if (p.errs.length) console.log(p.errs);
    await p.context().close();
  }
  // No connection: the Supabase library cannot load
  const p = await page(b, 1180, 820, true);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.fill('#email', 'a@x.com'); await p.fill('#pass', 'clave123'); await p.click('#go'); await p.waitForTimeout(100);
  ok('offline: connection message on login', (await err(p)) === TX.errorConexion);
  await p.context().close(); await b.close();
  for (const r of results) console.log(r.join('  '));
  const f = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - f} passed, ${f} failed`); process.exit(f ? 1 : 0);
})();
