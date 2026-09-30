/** A persistent, without-replacement animal deck. No browser/storage dependency.
 * Drawing is transactional: a failed spawn can release its ticket without
 * consuming the creature. Only commit changes the exported play history. */
const text = value => typeof value === 'string' ? value.trim() : '';
const randomUnit = random => {
  const value = Number(random());
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
};
const shuffled = (values, random) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomUnit(random) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const identityTokens = animal => [
  text(animal.assetHash) && `asset:${text(animal.assetHash).toLowerCase()}`,
  text(animal.visualKey) && `visual:${text(animal.visualKey)}`,
  text(animal.dedupeKey) && `dedupe:${text(animal.dedupeKey)}`,
  `id:${animal.id}`,
].filter(Boolean);

/** Union aliases sharing either a visual identity or an exact asset hash.
 * Including id tokens lets old snapshots survive a corrected identity field. */
function catalogGroups(animals) {
  const definitions = [...new Map((Array.isArray(animals) ? animals : [])
    .filter(animal => animal && text(animal.id))
    .map(animal => [text(animal.id), {...animal, id:text(animal.id)}])).values()];
  const parents = definitions.map((_, i) => i), owners = new Map();
  const root = i => {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  };
  definitions.forEach((animal, i) => identityTokens(animal).forEach(token => {
    if (owners.has(token)) parents[root(i)] = root(owners.get(token));
    else owners.set(token, i);
  }));
  const groups = new Map();
  definitions.forEach((animal, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(animal);
  });
  return {catalogSize:definitions.length, groups:[...groups.values()].map(members => {
    const tokens = [...new Set(members.flatMap(identityTokens))].sort();
    const key = tokens.find(token => token.startsWith('asset:'))
      || tokens.find(token => token.startsWith('visual:'))
      || tokens.find(token => token.startsWith('dedupe:')) || tokens[0];
    return {key, members, tokens, id:members[0].id};
  })};
}

function parsedState(state) {
  if (typeof state === 'string') { try { state = JSON.parse(state); } catch { return null; } }
  if (!state || typeof state !== 'object' || state.version !== 1
    || !Array.isArray(state.remaining) || !Array.isArray(state.consumed)) return null;
  return state;
}

export function createAnimalDeck(animals, {random = Math.random, state = null} = {}) {
  if (typeof random !== 'function') random = Math.random;
  const catalog = catalogGroups(animals), groups = new Map(catalog.groups.map(group => [group.key, group]));
  const lookup = new Map(catalog.groups.flatMap(group => group.tokens.map(token => [token, group.key])));
  const allKeys = [...groups.keys()];
  const resolve = entry => {
    if (typeof entry === 'string') return lookup.get(entry) || lookup.get(`id:${entry}`) || null;
    if (!entry || typeof entry !== 'object') return null;
    return lookup.get(entry.key) || lookup.get(`id:${entry.id}`)
      || (Array.isArray(entry.identities) ? entry.identities.map(token => lookup.get(token)).find(Boolean) : null) || null;
  };
  const clean = entries => [...new Set(entries.map(resolve).filter(Boolean))];
  const saved = parsedState(state);
  let cycle = saved && Number.isSafeInteger(saved.cycle) && saved.cycle > 0 ? saved.cycle : 1;
  let consumed = saved ? clean(saved.consumed) : [];
  const consumedSet = new Set(consumed);
  let remaining = saved ? clean(saved.remaining).filter(key => !consumedSet.has(key)) : [];
  const known = new Set([...consumed, ...remaining]);
  // New catalog entries join this round; already seen entries stay consumed.
  const added = shuffled(allKeys.filter(key => !known.has(key)), random);
  for (const key of added) {
    const at = saved ? Math.floor(randomUnit(random) * (remaining.length + 1)) : remaining.length;
    remaining.splice(at, 0, key);
  }
  let lastKey = saved ? resolve(saved.last) : null;
  let pending = null, staged = null, serial = 0;
  const row = key => {
    const group = groups.get(key);
    return {key, id:group.id, identities:group.tokens.filter(token => token !== key && token !== `id:${group.id}`)};
  };
  const excludedKeys = options => {
    const ids = Array.isArray(options?.excludeIds) ? options.excludeIds : [];
    const keys = Array.isArray(options?.excludeKeys) ? options.excludeKeys : [];
    return new Set([...ids, ...keys].map(resolve).filter(Boolean));
  };
  const available = options => {
    const exclusions = excludedKeys(options);
    const rollover = remaining.length === 0 && allKeys.length > 0;
    if (rollover && !staged) staged = shuffled(allKeys, random);
    const order = rollover ? staged : remaining;
    const eligible=order.filter(key => !exclusions.has(key)
      && !(rollover && allKeys.length > 1 && key === lastKey));
    // A region may prefer compatible creatures, but it cannot create a second
    // pool or reset history. Exhaust preferred unseen images, then continue
    // through every other unseen image in the same persisted round.
    const preferred=new Set((Array.isArray(options?.preferIds)?options.preferIds:[]).map(resolve).filter(Boolean));
    const ranked=preferred.size?[...eligible.filter(key=>preferred.has(key)),...eligible.filter(key=>!preferred.has(key))]:eligible;
    return {rollover, order, eligible:ranked};
  };
  const deck = {
    catalogSize:catalog.catalogSize,
    uniqueCount:allKeys.length,
    identityFor(id) { return resolve(id); },
    /** The same uncommitted candidate is returned until committed or released. */
    peek(options = {}) {
      const exclusions = excludedKeys(options);
      if (pending && !exclusions.has(pending.ticket.key)) return pending.ticket;
      pending = null;
      const next = available(options), key = next.eligible[0];
      if (!key) return null;
      const ticket = Object.freeze({token:++serial, id:groups.get(key).id, key,
        cycle:cycle + (next.rollover ? 1 : 0)});
      pending = {ticket, rollover:next.rollover, order:next.order};
      return ticket;
    },
    /** Commit once, after collision/placement succeeds. Returns false for a
     * stale, released or forged ticket; it never silently draws another animal. */
    commit(ticket) {
      if (!pending || ticket !== pending.ticket) return false;
      if (pending.rollover) { cycle++; remaining = [...pending.order]; consumed = []; }
      const index = remaining.indexOf(ticket.key);
      if (index < 0) return false;
      remaining.splice(index, 1); consumed.push(ticket.key); lastKey = ticket.key;
      pending = null; staged = null;
      return true;
    },
    release(ticket) {
      if (!pending || ticket !== pending.ticket) return false;
      pending = null; return true;
    },
    preview(count = 6, options = {}) {
      const size = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 6;
      return available(options).eligible.slice(0, size).map(key => groups.get(key).id);
    },
    snapshot() {
      return {version:1, cycle, remaining:remaining.map(row), consumed:consumed.map(row),
        last:lastKey ? row(lastKey) : null};
    },
    stats() { return {catalogSize:catalog.catalogSize, uniqueCount:allKeys.length,
      cycle, remaining:remaining.length, consumed:consumed.length}; },
  };
  return Object.freeze(deck);
}
