// Stand-in for the Supabase client, for local tests only (served instead of the CDN file).
// Keeps accounts and the students table in localStorage so sessions survive a reload.
(function () {
  const L = { get: k => JSON.parse(localStorage.getItem(k) || 'null'), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  const db = () => L.get('mock.db') || { users: [{ id: 'u-other', email: 'otra@x.com', pass: 'secreto1', nickname: 'Sofía' }] };
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sess = u => ({ user: { id: u.id, email: u.email }, access_token: 't' });
  window.supabase = { createClient: () => ({
    auth: {
      async getSession() { const id = L.get('mock.session'); const u = id && db().users.find(x => x.id === id); return { data: { session: u ? sess(u) : null }, error: null }; },
      async signUp({ email, password, options }) {
        const d = db(); if (d.users.some(u => u.email === email)) return { data: {}, error: { code: 'user_already_exists', message: 'User already registered', status: 422 } };
        if (password.length < 6) return { data: {}, error: { code: 'weak_password', message: 'Password should be at least 6 characters.', status: 422 } };
        const u = { id: 'u-' + Date.now(), email, pass: password, nickname: null, adult: options.data.adult_confirmed };
        d.users.push(u); L.set('mock.db', d); L.set('mock.session', u.id); return { data: { user: sess(u).user, session: sess(u) }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = db().users.find(x => x.email === email && x.pass === password);
        if (!u) return { data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
        L.set('mock.session', u.id); return { data: { user: sess(u).user, session: sess(u) }, error: null };
      },
      async signOut() { localStorage.removeItem('mock.session'); return { error: null }; }
    },
    from(table) {
      const q = { _id: null, _upd: null };
      q.select = () => q; q.update = v => { q._upd = v; return q; }; q.eq = (k, v) => { q._id = v; return q; };
      q.maybeSingle = async () => { const u = db().users.find(x => x.id === q._id); return { data: u ? { nickname: u.nickname } : null, error: null }; };
      q.single = async () => {
        const d = db(), u = d.users.find(x => x.id === q._id);
        if (q._upd) {
          const k = norm(q._upd.nickname.trim());
          if (d.users.some(x => x.id !== q._id && x.nickname && norm(x.nickname) === k)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          u.nickname = q._upd.nickname.trim(); L.set('mock.db', d);
        }
        return { data: { nickname: u.nickname }, error: null };
      };
      return q;
    }
  }) };
})();
