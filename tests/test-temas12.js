// Check (3 Nov 2026): all 12 Ciencias, Lengua and Matemáticas Temas active, all 11 Sociales Temas active (its map has 11); Pruebas play. Run: python3 -m http.server 8765 & node tests/test-temas12.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const URL = 'http://localhost:8765/'; const res = []; const ok = (n, c) => res.push([c ? 'PASS' : 'FAIL', n]);
async function page(b, w, h, dark) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_FAILED/.test(m.text())) p.errs.push(m.text()); });
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.click('#swap'); await p.fill('#email', 'a@x.com'); await p.fill('#pass', 'clave123'); await p.check('#adulto'); await p.click('#go');
  await p.waitForTimeout(150); await p.fill('#nick', 'Ana'); await p.click('#go'); await p.waitForTimeout(150);
  return p;
}
async function play(p) { let n = 0; while (await p.locator('.qscreen .opt').count() && n < 30) { await p.locator('.qscreen .opt').nth(n % 4).click(); await p.waitForTimeout(40); await p.locator('.side .btn-main').click(); await p.waitForTimeout(40); n++; } return n; }
(async () => {
  const b = await chromium.launch();
  for (const [w, h, dark] of [[1180, 820, false], [820, 1180, false], [390, 844, true]]) {
    const p = await page(b, w, h, dark); const tag = `${w}x${h}${dark ? ' dark' : ''}`;
    for (const [m, act] of [['CIE', 12], ['LEN', 12], ['MAT', 12], ['SOC', 11]]) {
      await p.click(`[data-m="${m}"]`); await p.waitForTimeout(80);
      ok(`${tag} ${m}: ${act} active, ${12 - act} grey`, (await p.locator('.mt.tema').count()) === act && (await p.locator('.mt.inact').count()) === 12 - act);
      await p.click('#back'); await p.waitForTimeout(60);
    }
    if (w === 1180) {
      for (const t of ['T05', 'T10', 'T12']) {
        await p.click('[data-m="CIE"]'); await p.click(`[data-t="${t}"]`); await p.locator('.btn-main').first().click();
        const n = await play(p); ok(`CIE ${t} Prueba has 10 questions`, n === 10); await p.waitForTimeout(150);
        await p.click('text=/Inicio|inicio/').catch(() => {}); if (!(await p.locator('[data-m="CIE"]').count())) await p.goto(URL, { waitUntil: 'networkidle' });
      }
      await p.click('[data-m="CIE"]'); await p.click('#all'); await p.locator('.btn-main').first().click();
      ok('Todo Ciencias Prueba has 10 questions', (await play(p)) === 10);
      await p.goto(URL, { waitUntil: 'networkidle' });
      for (const t of ['T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12']) {
        await p.click('[data-m="LEN"]'); await p.click(`[data-t="${t}"]`); await p.locator('.btn-main').first().click();
        const n = await play(p); ok(`LEN ${t} Prueba has 10 questions`, n === 10); await p.waitForTimeout(150);
        await p.goto(URL, { waitUntil: 'networkidle' });
      }
      await p.click('[data-m="LEN"]'); await p.click('#all'); await p.locator('.btn-main').first().click();
      ok('Todo Lengua Prueba has 10 questions', (await play(p)) === 10);
      await p.goto(URL, { waitUntil: 'networkidle' });
      for (const t of ['T06', 'T07', 'T08', 'T09', 'T10', 'T11']) {
        await p.click('[data-m="SOC"]'); await p.click(`[data-t="${t}"]`); await p.locator('.btn-main').first().click();
        const n = await play(p); ok(`SOC ${t} Prueba has 10 questions`, n === 10); await p.waitForTimeout(150);
        await p.goto(URL, { waitUntil: 'networkidle' });
      }
      await p.click('[data-m="SOC"]'); await p.click('#all'); await p.locator('.btn-main').first().click();
      ok('Todo Sociales Prueba has 10 questions', (await play(p)) === 10);
      await p.goto(URL, { waitUntil: 'networkidle' });
      for (const t of ['T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12']) {
        await p.click('[data-m="MAT"]'); await p.click(`[data-t="${t}"]`); await p.locator('.btn-main').first().click();
        const n = await play(p); ok(`MAT ${t} Prueba has 10 questions`, n === 10); await p.waitForTimeout(150);
        await p.goto(URL, { waitUntil: 'networkidle' });
      }
      await p.click('[data-m="MAT"]'); await p.click('#all'); await p.locator('.btn-main').first().click();
      ok('Todo Matemáticas Prueba has 10 questions', (await play(p)) === 10);
    }
    await p.click('[data-rail="progreso"]').catch(async () => { await p.goto(URL); });
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok(`${tag} map: no horizontal scroll`, !over);
    ok(`${tag} no page errors`, p.errs.length === 0); if (p.errs.length) console.log(p.errs.slice(0, 3));
    await p.context().close();
  }
  await b.close();
  res.forEach(r => console.log(r.join('  '))); console.log(res.filter(r => r[0] === 'FAIL').length + ' failed of ' + res.length);
})();
