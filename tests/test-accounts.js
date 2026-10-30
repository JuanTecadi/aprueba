// Local test of v0.2 accounts (Playwright). Serves the repository on :8765 and replaces the Supabase CDN file with mock-supabase.js.
// Usage: (from the repository) python3 -m http.server 8765 & node tests/test-accounts.js [screenshot-folder]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const SHOTS = process.argv[2];
const URL = 'http://localhost:8765/';
const results = []; const ok = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); };

async function page(b, w, h, dark, offline) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' });
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => offline ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  return p;
}
const text = p => p.locator('#app').innerText();
const hscroll = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };

(async () => {
  const b = await chromium.launch();
  for (const [w, h, dark] of [[1180, 820, false], [820, 1180, false], [390, 844, true]]) {
    const tag = `${w}x${h}${dark ? ' dark' : ''}`;
    const p = await page(b, w, h, dark);
    await p.goto(URL, { waitUntil: 'networkidle' });
    ok(`${tag} login shows with two tabs`, (await p.locator('.ltab').count()) === 2 && (await text(p)).includes('¡Te damos la bienvenida'));
    ok(`${tag} top bar hidden on login`, await p.locator('#top').isHidden());
    await shot(p, `login-${w}`);
    // Sign-up
    await p.click('#tab-crear');
    ok(`${tag} sign-up tab texts`, (await text(p)).includes('Crea la cuenta de tu hijo o hija') && (await text(p)).includes('Esta parte la hace una persona adulta.'));
    await shot(p, `crear-${w}`);
    await p.fill('#email', `papa${w}@x.com`); await p.fill('#pass', '123'); await p.click('#go');
    ok(`${tag} short password refused`, (await p.locator('#err').innerText()).includes('al menos 6 caracteres'));
    await p.fill('#pass', 'clave123'); await p.click('#go');
    ok(`${tag} tick box required`, (await p.locator('#err').innerText()) === 'Marca la casilla para continuar.');
    await p.check('#adulto'); await p.click('#go'); await p.waitForTimeout(200);
    ok(`${tag} after sign-up: nickname screen`, (await text(p)).includes('¿cómo quieres que te llame?') && await p.locator('#top').isHidden());
    await shot(p, `apodo-${w}`);
    const adult = await p.evaluate(() => JSON.parse(localStorage.getItem('mock.db')).users.slice(-1)[0].adult);
    ok(`${tag} tick box sent as adult_confirmed`, adult === true);
    // Nickname
    await p.fill('#nick', 'S'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} 1-character nickname refused`, (await p.locator('#err').innerText()).includes('Entre 2 y 20'));
    await p.fill('#nick', 'sofia'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} taken nickname refused (Sofía = sofia)`, (await p.locator('#err').innerText()).includes('ya lo tiene otra persona'));
    await p.fill('#nick', `Luis${w}`); await p.click('#go'); await p.waitForTimeout(200);
    ok(`${tag} home after nickname`, (await text(p)).includes(`¡Hola, Luis${w}!`) && (await p.locator('#top').innerText()).includes(`Luis${w}`));
    ok(`${tag} Configuración link on home, no Cambiar de usuario`, (await p.locator('#config').count()) === 1 && !(await text(p)).includes('Cambiar de usuario'));
    await shot(p, `home-${w}`);
    // Session remembered
    await p.reload({ waitUntil: 'networkidle' });
    ok(`${tag} reload goes straight to home`, (await text(p)).includes(`¡Hola, Luis${w}!`));
    // Configuración
    await p.click('#config');
    const ct = await text(p);
    ok(`${tag} Configuración shows nickname, sound, email`, ct.includes('Configuración') && ct.includes('Sonido') && ct.includes(`papa${w}@x.com`) && (await p.inputValue('#nick')) === `Luis${w}`);
    await shot(p, `config-${w}`);
    await p.fill('#nick', 'Sofia '); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} Configuración refuses taken nickname`, (await p.locator('#err').innerText()).includes('ya lo tiene otra persona'));
    await p.fill('#nick', `Lucho${w}`); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} Configuración saves nickname and updates top bar`, (await p.locator('#ok').innerText()) === 'Listo, guardado.' && (await p.locator('#top').innerText()).includes(`Lucho${w}`));
    const s1 = await p.getAttribute('#sndbtn', 'aria-pressed'); await p.click('#sndbtn');
    const s2 = await p.getAttribute('#sndbtn', 'aria-pressed');
    ok(`${tag} sound toggles in Configuración and top bar`, s1 !== s2 && (await p.getAttribute('#snd', 'aria-pressed')) === s2);
    ok(`${tag} no horizontal scroll on Configuración`, !(await hscroll(p)));
    // Play one Prueba
    await p.click('#back'); await p.click('#c-grado'); await p.locator('.btn-main').first().click();
    let n = 0; while (await p.locator('.qscreen .opt').count() && n < 15) { await p.locator('.qscreen .opt').first().click(); await p.waitForTimeout(80); await p.locator('.side .btn-main').click(); await p.waitForTimeout(80); n++; }
    ok(`${tag} a Prueba plays to the end`, n === 10 && (await text(p)).includes('¡Terminaste la prueba!'));
    const ptsTop = await p.locator('.pts').innerText();
    await p.click('#home'); await p.click('#config'); await p.click('#salir'); await p.waitForTimeout(150);
    ok(`${tag} Cerrar sesión goes to login`, (await p.locator('.ltab').count()) === 2 && await p.locator('#top').isHidden());
    // Login
    await p.fill('#email', `papa${w}@x.com`); await p.fill('#pass', 'mala'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} wrong password message`, (await p.locator('#err').innerText()) === 'El correo o la contraseña no coinciden.');
    await p.fill('#pass', 'clave123'); await p.click('#go'); await p.waitForTimeout(200);
    ok(`${tag} login goes to home, progress kept for this account`, (await text(p)).includes(`¡Hola, Lucho${w}!`) && (await p.locator('.pts').innerText()) === ptsTop);
    // Existing email on sign-up
    await p.click('#config'); await p.click('#salir'); await p.click('#tab-crear');
    await p.fill('#email', 'otra@x.com'); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go'); await p.waitForTimeout(100);
    ok(`${tag} existing email message`, (await p.locator('#err').innerText()).startsWith('Ya existe una cuenta'));
    ok(`${tag} no horizontal scroll on login`, !(await hscroll(p)));
    ok(`${tag} no page errors`, p.errs.length === 0);
    if (p.errs.length) console.log(p.errs);
    await p.close();
  }
  // No connection: the Supabase library cannot load
  const p = await page(b, 1180, 820, false, true);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.fill('#email', 'a@x.com'); await p.fill('#pass', 'clave123'); await p.click('#go'); await p.waitForTimeout(100);
  ok('offline: connection message on login', (await p.locator('#err').innerText()).startsWith('No hay conexión'));
  await p.close(); await b.close();
  for (const r of results) console.log(r.join('  '));
  const f = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - f} passed, ${f} failed`); process.exit(f ? 1 : 0);
})();
