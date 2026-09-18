# DemoNet

Live networking graph for in-person events: React + Neo4j Aura + [react-force-graph](https://github.com/vasturiano/react-force-graph).

This repo is a **GitHub template**. Use it to spin up a new event network with its own Aura instance and GitHub Pages site, without the recommendation engine.

Live site: [https://awuchen.github.io/DemoNet](https://awuchen.github.io/DemoNet)

## What is included

- NFC / URL card tap: first tap of your own card registers the phone (`Yes, this is me`)
- Later taps of someone else's card create a `CONNECTED_TO` relationship
- Force-directed graph, node profiles (name, role/company, LinkedIn, email)
- Timeline view and natural-language search

## Create a new event from this template

1. On GitHub, click **Use this template** → create a new repo (for example `MyEventNet`).
2. Create a Neo4j Aura instance and copy URI, username, password, database name.
3. Update:
   - `react-graph-viz/src/neo4jConfig.js`
   - `Cred/` (replace the sample Aura file)
   - `react-graph-viz/src/appConfig.js` (`APP_NAME`, `BASE_PATH`)
   - `react-graph-viz/package.json` (`homepage` and `deploy` repo URL)
   - `react-graph-viz/public/index.html` and `manifest.json` titles
4. `cd react-graph-viz && npm install && npm run deploy`
5. In the new repo: **Settings → Pages** → source `gh-pages`.
6. Optionally import guests: `python3 scripts/import_guests.py guests.csv`

## Neo4j

Connection defaults are in `react-graph-viz/src/neo4jConfig.js` (Aura **c6db593c**). Override with `REACT_APP_NEO4J_URI`, `REACT_APP_NEO4J_USERNAME`, `REACT_APP_NEO4J_PASSWORD`, `REACT_APP_NEO4J_DATABASE` in `react-graph-viz/.env` before `npm run build` / deploy.

**Authentication failure:** reset the Aura password, paste it into `neo4jConfig.js` (and Cred), then rebuild.

The main app lives in `react-graph-viz/`. Use `npm install` and `npm start` there for local development.
