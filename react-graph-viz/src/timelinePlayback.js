/** Client-side timeline: filter cached events and grow the graph without re-simulating layout. */

export async function fetchTimelineEvents(driver, database) {
  const session = driver.session({ database });
  try {
    const nodeResult = await session.run(
      `MATCH (u:User)
       WHERE u.createdAt IS NOT NULL
       RETURN u.name AS name, u.role AS role, u.school AS school,
              u.website AS website, u.email AS email, u.links AS links,
              u.createdAt AS createdAt`
    );
    const linkResult = await session.run(
      `MATCH (a:User)-[r:CONNECTED_TO]->(b:User)
       WHERE r.createdAt IS NOT NULL
       RETURN a.name AS source, b.name AS target, r.createdAt AS createdAt`
    );

    const nodes = nodeResult.records.map((rec) => ({
      name: rec.get('name'),
      createdAt: Number(rec.get('createdAt')),
      role: rec.get('role') || '',
      school: rec.get('school') || '',
      website: rec.get('website') || '',
      email: rec.get('email') || '',
      links: rec.get('links') || '',
    }));

    const links = linkResult.records.map((rec) => ({
      source: rec.get('source'),
      target: rec.get('target'),
      createdAt: Number(rec.get('createdAt')),
    }));

    return { nodes, links };
  } finally {
    await session.close();
  }
}

function initialPosition(name, visibleLinks, layoutCache) {
  for (const link of visibleLinks) {
    const source = typeof link.source === 'string' ? link.source : link.source?.name;
    const target = typeof link.target === 'string' ? link.target : link.target?.name;
    if (source === name && layoutCache.has(target)) {
      const t = layoutCache.get(target);
      return { x: t.x + 28, y: t.y + 12 };
    }
    if (target === name && layoutCache.has(source)) {
      const s = layoutCache.get(source);
      return { x: s.x - 28, y: s.y + 12 };
    }
  }
  const n = layoutCache.size;
  const angle = n * 0.55;
  const radius = 40 + n * 4;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/**
 * Build graph visible at timestampMs. Preserves positions in layoutCache; pins nodes (fx/fy) for a static layout.
 */
export function buildTimelineGraphAt(events, timestampMs, layoutCache) {
  const visibleNodeRecords = events.nodes.filter((n) => n.createdAt <= timestampMs);
  const nameSet = new Set(visibleNodeRecords.map((n) => n.name));

  const visibleLinksRaw = events.links.filter(
    (l) =>
      l.createdAt <= timestampMs &&
      nameSet.has(l.source) &&
      nameSet.has(l.target)
  );

  // Place any new nodes before building link list (for neighbor-based placement)
  visibleNodeRecords.forEach((n) => {
    if (!layoutCache.has(n.name)) {
      layoutCache.set(n.name, initialPosition(n.name, visibleLinksRaw, layoutCache));
    }
  });

  const nodes = visibleNodeRecords.map((n) => {
    const pos = layoutCache.get(n.name);
    return {
      name: n.name,
      role: n.role,
      school: n.school,
      website: n.website,
      email: n.email,
      links: n.links,
      x: pos.x,
      y: pos.y,
      fx: pos.x,
      fy: pos.y,
    };
  });

  const links = visibleLinksRaw.map((l) => ({
    source: l.source,
    target: l.target,
  }));

  return { nodes, links };
}

/**
 * Same visible graph as buildTimelineGraphAt, but reuses node object references from nodeMap
 * so force-graph does less work on each playback tick (reduces canvas flicker).
 */
export function buildTimelineGraphAtStable(events, timestampMs, layoutCache, nodeMap) {
  const built = buildTimelineGraphAt(events, timestampMs, layoutCache);
  const visibleNames = new Set(built.nodes.map((n) => n.name));

  for (const name of nodeMap.keys()) {
    if (!visibleNames.has(name)) nodeMap.delete(name);
  }

  const nodes = built.nodes.map((n) => {
    let node = nodeMap.get(n.name);
    if (!node) {
      node = { ...n };
      nodeMap.set(n.name, node);
      return node;
    }
    node.role = n.role;
    node.school = n.school;
    node.website = n.website;
    node.email = n.email;
    node.links = n.links;
    node.x = n.x;
    node.y = n.y;
    node.fx = n.fx;
    node.fy = n.fy;
    return node;
  });

  return { nodes, links: built.links };
}
