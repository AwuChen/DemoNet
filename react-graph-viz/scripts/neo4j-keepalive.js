const neo4j = require('neo4j-driver');

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE;

if (!uri || !user || !password) {
  console.error('Missing NEO4J_URI, NEO4J_USER, or NEO4J_PASSWORD');
  process.exit(1);
}

async function main() {
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = database
    ? driver.session({ database })
    : driver.session();
  try {
    const result = await session.run(
      'RETURN 1 AS keepAlive, datetime() AS at'
    );
    const record = result.records[0];
    console.log(
      'Neo4j keep-alive ok',
      record.get('keepAlive').toString(),
      record.get('at').toString()
    );
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
