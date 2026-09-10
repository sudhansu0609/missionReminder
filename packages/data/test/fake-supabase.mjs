// An in-memory stand-in for the bits of the Supabase client @mission/data uses.
// Enough of postgrest to prove the sync rules, and able to be told to fail so
// "offline" is something the tests can actually exercise.

export function fakeClient() {
  const tables = { missions: [], goals: [], blocks: [], sessions: [] };
  let failing = false;
  /** Every write that reached the server, in order. */
  const writes = [];

  const match = (row, filters) => filters.every(([col, val]) => row[col] === val);

  function from(name) {
    const rows = tables[name] ?? (tables[name] = []);
    const filters = [];
    let mode = 'select';
    let payload = null;
    let single = false;

    const builder = {
      select() { mode = 'select'; return builder; },
      eq(col, val) { filters.push([col, val]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() { single = true; return builder; },
      upsert(row, opts) {
        mode = 'upsert';
        payload = { row, onConflict: opts?.onConflict };
        return builder;
      },
      update(patch) { mode = 'update'; payload = patch; return builder; },
      delete() { mode = 'delete'; return builder; },

      then(resolve, reject) {
        return Promise.resolve()
          .then(() => run())
          .then(resolve, reject);
      },
    };

    function run() {
      if (failing) return { data: null, error: { message: 'network down' } };
      if (mode === 'select') {
        const found = rows.filter((r) => match(r, filters));
        return { data: single ? (found[0] ?? null) : found, error: null };
      }
      if (mode === 'upsert') {
        const { row, onConflict } = payload;
        writes.push({ table: name, op: 'upsert', id: row.id });
        const key = onConflict ?? 'id';
        const i = rows.findIndex((r) => r[key] === row[key]);
        if (i === -1) rows.push({ ...row });
        else rows[i] = { ...rows[i], ...row };
        return { data: null, error: null };
      }
      if (mode === 'update') {
        const hit = rows.filter((r) => match(r, filters));
        writes.push({ table: name, op: 'update', id: hit[0]?.id });
        for (const r of hit) Object.assign(r, payload);
        return { data: null, error: null };
      }
      // delete
      const keep = rows.filter((r) => !match(r, filters));
      writes.push({ table: name, op: 'delete' });
      rows.length = 0;
      rows.push(...keep);
      return { data: null, error: null };
    }

    return builder;
  }

  return {
    tables,
    writes,
    setFailing(v) { failing = v; },
    isFailing() { return failing; },
    from,
    channel() {
      const ch = { on() { return ch; }, subscribe() { return ch; } };
      return ch;
    },
    removeChannel() {},
  };
}
