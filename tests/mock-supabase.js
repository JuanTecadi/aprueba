// Stand-in for the Supabase client, for local tests only (served instead of the CDN file).
// Keeps accounts and tables in localStorage so sessions and data survive a reload and are shared by
// pages of the same browser context. Set localStorage 'mock.offline' = 'true' to make data calls fail.
(function () {
  const L = { get: k => JSON.parse(localStorage.getItem(k) || 'null'), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  const db = () => L.get('mock.db') || { users: [{ id: 'u-other', email: 'otra@x.com', pass: 'secreto1', nickname: 'Sofía' }], pruebas: [], answers: [], ratings: [], rpcCalls: 0 };
  const put = d => L.set('mock.db', d);
  const me = () => L.get('mock.session');
  const offline = () => localStorage.getItem('mock.offline') === 'true';
  const NET = { message: 'TypeError: Failed to fetch', status: 0 };
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sess = u => ({ user: { id: u.id, email: u.email }, access_token: 't' });

  function query(table) {
    const q = { filters: [], op: 'select', val: null, cols: '', ord: null };
    const chain = { };
    chain.select = cols => { q.cols = cols || ''; return chain; };
    chain.update = v => { q.op = 'update'; q.val = v; return chain; };
    chain.upsert = v => { q.op = 'upsert'; q.val = v; return chain; };
    chain.delete = () => { q.op = 'delete'; return chain; };
    chain.eq = (k, v) => { q.filters.push([k, v]); return chain; };
    chain.order = (k, o) => { q.ord = [k, o && o.ascending === false ? -1 : 1]; return chain; };
    const run = () => {
      if (offline()) return { data: null, error: NET };
      const d = db(), uid = me();
      if (table === 'students') {
        const u = d.users.find(x => x.id === (q.filters.find(f => f[0] === 'id') || [])[1]);
        if (q.op === 'update' && 'nickname' in q.val) {
          const k = norm(q.val.nickname.trim());
          if (d.users.some(x => x.id !== u.id && x.nickname && norm(x.nickname) === k)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          u.nickname = q.val.nickname.trim(); put(d);
        }
        if (q.op === 'update' && 'leaderboard' in q.val) { u.leaderboard = !!q.val.leaderboard; put(d); }   // 4 Nov 2026
        return { data: u ? [{ nickname: u.nickname, leaderboard: !!u.leaderboard }] : [], error: null };
      }
      if (table === 'pruebas') {
        let rows = d.pruebas.filter(p => p.student_id === uid);
        if (q.ord) rows = rows.slice().sort((a, b) => (a[q.ord[0]] < b[q.ord[0]] ? -1 : 1) * q.ord[1]);
        return { data: rows.map(p => ({ ...p, answers: d.answers.filter(a => a.prueba_id === p.id) })), error: null };
      }
      if (table === 'ratings') {
        if (q.op === 'upsert') { d.ratings = d.ratings.filter(r => !(r.student_id === uid && r.question_id === q.val.question_id)); d.ratings.push({ ...q.val, student_id: uid }); put(d); }
        if (q.op === 'delete') { const qid = (q.filters.find(f => f[0] === 'question_id') || [])[1]; d.ratings = d.ratings.filter(r => !(r.student_id === uid && r.question_id === qid)); put(d); }
        return { data: d.ratings.filter(r => r.student_id === uid), error: null };
      }
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => { const r = run(); return { data: r.data ? r.data[0] || null : null, error: r.error }; };
    chain.single = async () => { const r = run(); return { data: r.data ? r.data[0] : null, error: r.error }; };
    chain.then = (ok, ko) => Promise.resolve(run()).then(ok, ko);
    return chain;
  }

  // Leaderboard (4 Nov 2026), same rules as public.tabla_posiciones: opted-in students only; whole grade = saved
  // points of each Prueba, one Materia = correct answers of that Materia x points; 'siempre' ignores dates (the
  // stand-in does not work out weeks); top_n rows, ties share a rank, plus the caller's own row when further down.
  // Extra students for the board can be put in mock.db as users with fixed 'puntos' ({ ALL, CIE, ... }).
  function tabla({ p_periodo, p_materia, p_top_n }) {
    const d = db(), uid = me();
    const pts = d.users.filter(u => u.leaderboard && u.nickname).map(u => {
      let total;
      if (u.puntos) total = u.puntos[p_materia || 'ALL'] || 0;
      else if (!p_materia) total = d.pruebas.filter(p => p.student_id === u.id).reduce((a, p) => a + p.puntos, 0);
      else total = d.answers.filter(a => a.correcta && a.question_id.startsWith(p_materia) && d.pruebas.some(p => p.id === a.prueba_id && p.student_id === u.id)).length * 10;
      return { id: u.id, apodo: u.nickname, puntos: total };
    });
    const ranked = pts.filter(x => x.puntos > 0).sort((a, b) => b.puntos - a.puntos || a.apodo.localeCompare(b.apodo));
    ranked.forEach((x, i) => { x.rango = i && ranked[i - 1].puntos === x.puntos ? ranked[i - 1].rango : i + 1; x.rn = i + 1; });
    const out = ranked.filter(x => x.rn <= p_top_n).map(x => ({ rango: x.rango, apodo: x.apodo, puntos: x.puntos, soy_yo: x.id === uid }));
    const mine = ranked.find(x => x.id === uid && x.rn > p_top_n) || (pts.find(x => x.id === uid && x.puntos === 0) && { rango: null, ...pts.find(x => x.id === uid) });
    if (mine) out.push({ rango: mine.rango, apodo: mine.apodo, puntos: mine.puntos, soy_yo: true });
    d.tablaCalls = (d.tablaCalls || 0) + 1; put(d);
    return out;
  }

  window.supabase = { createClient: () => ({
    auth: {
      async getSession() { const id = me(); const u = id && db().users.find(x => x.id === id); return { data: { session: u ? sess(u) : null }, error: null }; },
      async signUp({ email, password, options }) {
        const d = db(); if (d.users.some(u => u.email === email)) return { data: {}, error: { code: 'user_already_exists', message: 'User already registered', status: 422 } };
        if (password.length < 6) return { data: {}, error: { code: 'weak_password', message: 'Password should be at least 6 characters.', status: 422 } };
        const u = { id: 'u-' + Date.now(), email, pass: password, nickname: null, adult: options.data.adult_confirmed };
        d.users.push(u); put(d); L.set('mock.session', u.id); return { data: { user: sess(u).user, session: sess(u) }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = db().users.find(x => x.email === email && x.pass === password);
        if (!u) return { data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
        L.set('mock.session', u.id); return { data: { user: sess(u).user, session: sess(u) }, error: null };
      },
      async signOut() { localStorage.removeItem('mock.session'); return { error: null }; }
    },
    from: query,
    async rpc(name, args) {
      if (offline()) return { data: null, error: NET };
      if (name === 'tabla_posiciones') return { data: tabla(args), error: null };
      const { p } = args;
      const d = db(); d.rpcCalls++;
      if (!d.pruebas.some(x => x.id === p.id)) {
        if (p.answers.length !== p.n_preguntas) return { data: null, error: { message: 'answers do not match n_preguntas' } };
        for (const a of p.answers) if (!['K', 'D1', 'D2', 'D3'].includes(a.opcion) || a.correcta !== (a.opcion === 'K')) return { data: null, error: { message: 'bad answer ' + JSON.stringify(a) } };
        const { answers, ...row } = p;
        d.pruebas.push({ ...row, student_id: me() });
        answers.forEach(a => d.answers.push({ ...a, prueba_id: p.id }));
      }
      put(d); return { data: p.id, error: null };
    }
  }) };
})();
