import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import * as neo4j from  'neo4j-driver';
import { getNeo4jConfig } from './neo4jConfig';

const { uri, user, password } = getNeo4jConfig();
const driver = neo4j.driver(
  uri,
  neo4j.auth.basic(user, password),
  {
    //encrypted: process.env.NEO4J_ENCRYPTED ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
    //encrypted: process.env.NEO4J_ENCRYPTED = 'ENCRYPTION_ON',
  }
)

ReactDOM.render(
  <React.StrictMode>
    <App driver={driver}/>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
