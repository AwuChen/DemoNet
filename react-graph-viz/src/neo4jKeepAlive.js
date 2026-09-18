import { getNeo4jConfig } from './neo4jConfig';

const INTERVAL_MS = 30 * 60 * 1000;
const QUERY = 'RETURN 1 AS keepAlive, datetime() AS at';

/**
 * Ping Aura while a graph tab is open so a long session does not look idle.
 * This does not replace the GitHub Actions cron (quiet nights / weekends).
 */
export function startNeo4jKeepAlive(driver) {
  if (!driver) return () => {};

  let stopped = false;

  const ping = async () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    const { database } = getNeo4jConfig();
    const session = database
      ? driver.session({ database })
      : driver.session();
    try {
      await session.run(QUERY);
    } catch (err) {
      console.warn('Neo4j keep-alive ping failed', err);
    } finally {
      session.close();
    }
  };

  ping();
  const id = setInterval(ping, INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
