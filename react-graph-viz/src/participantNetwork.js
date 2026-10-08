/** Load and summarize a phone owner's event network from Neo4j. */

function peerFromRecord(record) {
  return {
    name: record.get('name'),
    school: record.get('school') || '',
    role: record.get('role') || '',
    email: record.get('email') || '',
    website: record.get('website') || '',
    connectedAt: record.get('connectedAt'),
    via: record.get('via'),
  };
}

function viaLabel(via) {
  if (via === 'scanned_their_card') return 'You tapped their card';
  if (via === 'they_scanned_yours') return 'They tapped your card';
  return 'Connected at the event';
}

export function buildParticipantInsights(me, directPeers, extendedPeers) {
  const schoolCounts = {};
  const roleCounts = {};
  directPeers.forEach((p) => {
    if (p.school) schoolCounts[p.school] = (schoolCounts[p.school] || 0) + 1;
    if (p.role) roleCounts[p.role] = (roleCounts[p.role] || 0) + 1;
  });

  const mySchool = (me.school || '').trim();
  const myRole = (me.role || '').trim();
  const directNames = new Set(directPeers.map((p) => p.name.toLowerCase()));

  const suggestionMap = new Map();
  extendedPeers.forEach((row) => {
    const key = row.name.toLowerCase();
    if (directNames.has(key)) return;

    let entry = suggestionMap.get(key);
    if (!entry) {
      entry = {
        name: row.name,
        school: row.school || '',
        role: row.role || '',
        email: row.email || '',
        website: row.website || '',
        viaPeople: new Set(),
        score: 0,
        reasons: [],
      };
      suggestionMap.set(key, entry);
    }
    if (row.mutualDirect) entry.viaPeople.add(row.mutualDirect);

    if (mySchool && row.school === mySchool) entry.score += 2;
    if (myRole && row.role === myRole) entry.score += 1;
    if (row.school && directPeers.some((d) => d.school && d.school === row.school)) {
      entry.score += 1;
    }
  });

  const suggestions = Array.from(suggestionMap.values())
    .map((s) => {
      const viaList = Array.from(s.viaPeople);
      const reasons = [];
      if (mySchool && s.school === mySchool) reasons.push(`Same school (${s.school})`);
      if (myRole && s.role === myRole) reasons.push(`Similar role (${s.role})`);
      if (viaList.length) {
        reasons.push(
          viaList.length === 1
            ? `Knows ${viaList[0]}`
            : `Knows ${viaList.slice(0, 2).join(', ')}${viaList.length > 2 ? ` +${viaList.length - 2}` : ''}`
        );
      }
      if (!reasons.length) reasons.push('In your extended event network');
      return {
        name: s.name,
        school: s.school,
        role: s.role,
        email: s.email,
        website: s.website,
        viaPeople: viaList,
        score: s.score + viaList.length,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const uniqueExtended = new Set(extendedPeers.map((r) => r.name.toLowerCase())).size;

  let summaryLine = '';
  if (directPeers.length === 0) {
    summaryLine =
      'You have not recorded any NFC connections yet. Tap cards during the event or open the graph to explore the roster.';
  } else {
    const topSchool = Object.entries(schoolCounts).sort((a, b) => b[1] - a[1])[0];
    const topRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0];
    summaryLine = `You made ${directPeers.length} direct connection${directPeers.length === 1 ? '' : 's'}`;
    if (topSchool) summaryLine += `, mostly across ${topSchool[0]} (${topSchool[1]})`;
    if (topRole) summaryLine += `; common roles include ${topRole[0]}`;
    summaryLine += `. Your connections link you to about ${uniqueExtended} other participant${uniqueExtended === 1 ? '' : 's'} you have not met yet.`;
  }

  return {
    me,
    directPeers: directPeers.map((p) => ({ ...p, viaLabel: viaLabel(p.via) })),
    schoolCounts,
    roleCounts,
    extendedCount: uniqueExtended,
    suggestions,
    summaryLine,
  };
}

export async function loadParticipantNetworkInsights(driver, database, viewerName) {
  if (!driver || !viewerName) {
    return { error: 'no_viewer' };
  }

  const session = driver.session({ database });
  try {
    const meResult = await session.run(
      `MATCH (me:User)
       WHERE toLower(me.name) = toLower($name)
       RETURN me.name AS name, me.school AS school, me.role AS role, me.email AS email
       LIMIT 1`,
      { name: viewerName }
    );
    if (!meResult.records.length) {
      return { error: 'profile_not_found', viewerName };
    }
    const rec = meResult.records[0];
    const me = {
      name: rec.get('name'),
      school: rec.get('school') || '',
      role: rec.get('role') || '',
      email: rec.get('email') || '',
    };

    const scanned = await session.run(
      `MATCH (me:User) WHERE toLower(me.name) = toLower($name)
       MATCH (peer:User)-[r:CONNECTED_TO]->(me)
       RETURN peer.name AS name, peer.school AS school, peer.role AS role,
              peer.email AS email, peer.website AS website,
              r.createdAt AS connectedAt, 'scanned_their_card' AS via
       ORDER BY connectedAt DESC`,
      { name: me.name }
    );

    const scannedYou = await session.run(
      `MATCH (me:User) WHERE toLower(me.name) = toLower($name)
       MATCH (me)-[r:CONNECTED_TO]->(peer:User)
       RETURN peer.name AS name, peer.school AS school, peer.role AS role,
              peer.email AS email, peer.website AS website,
              r.createdAt AS connectedAt, 'they_scanned_yours' AS via
       ORDER BY connectedAt DESC`,
      { name: me.name }
    );

    const byName = new Map();
    [...scanned.records, ...scannedYou.records].forEach((record) => {
      const p = peerFromRecord(record);
      const key = p.name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, p);
      }
    });
    const directPeers = Array.from(byName.values()).sort(
      (a, b) => (b.connectedAt || 0) - (a.connectedAt || 0)
    );

    const extended = await session.run(
      `MATCH (me:User) WHERE toLower(me.name) = toLower($name)
       MATCH (direct:User)
       WHERE (direct)-[:CONNECTED_TO]->(me) OR (me)-[:CONNECTED_TO]->(direct)
       MATCH (direct)-[:CONNECTED_TO]-(ext:User)
       WHERE ext <> me AND ext <> direct
         AND NOT (ext)-[:CONNECTED_TO]->(me)
         AND NOT (me)-[:CONNECTED_TO]->(ext)
       RETURN DISTINCT ext.name AS name, ext.school AS school, ext.role AS role,
              ext.email AS email, ext.website AS website, direct.name AS mutualDirect`,
      { name: me.name }
    );
    const extendedPeers = extended.records.map((r) => ({
      name: r.get('name'),
      school: r.get('school') || '',
      role: r.get('role') || '',
      email: r.get('email') || '',
      website: r.get('website') || '',
      mutualDirect: r.get('mutualDirect'),
    }));

    return buildParticipantInsights(me, directPeers, extendedPeers);
  } finally {
    await session.close();
  }
}
