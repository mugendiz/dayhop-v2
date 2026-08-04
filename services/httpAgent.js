// services/httpAgent.js — shared keep-alive agents for every outbound call.
//
// Node's global agent keeps idle sockets for only ~5 s, so on a low-traffic
// instance nearly every external call (Google, x.ai, Viator, …) re-pays a
// TCP + TLS handshake (~100-250 ms). A cold /api/generate makes ~15 such
// calls. Mutating axios.defaults here covers both bare axios.get/post calls
// and every axios.create() client, provided this module is required BEFORE
// any service module — server.js requires it first thing.
const http = require('http');
const https = require('https');
const axios = require('axios');

const KEEP_ALIVE_OPTS = { keepAlive: true, keepAliveMsecs: 30000, maxSockets: 64 };

const httpAgent = new http.Agent(KEEP_ALIVE_OPTS);
const httpsAgent = new https.Agent(KEEP_ALIVE_OPTS);

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

module.exports = { httpAgent, httpsAgent };
