#!/usr/bin/env node
/**
 * Server della console di piattaforma (ADR-0013, PLT-040).
 * Porta CONSOLE_PORT (predefinita 8443). Con CONSOLE_TLS_CERT_FILE e CONSOLE_TLS_KEY_FILE termina TLS da solo;
 * altrimenti ascolta in HTTP (dietro un reverse proxy che termina TLS).
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { parse } from 'node:url';
import next from 'next';

const port = Number(process.env.CONSOLE_PORT ?? 8443);
const hostname = process.env.CONSOLE_HOST ?? '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production' && process.env.CONSOLE_DEV === '1';
const certFile = process.env.CONSOLE_TLS_CERT_FILE;
const keyFile = process.env.CONSOLE_TLS_KEY_FILE;

const app = next({ dev, dir: new URL('.', import.meta.url).pathname, port, hostname });
const handle = app.getRequestHandler();
await app.prepare();

const listener = (req, res) => handle(req, res, parse(req.url ?? '/', true));
const server = certFile && keyFile ? https.createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile), minVersion: 'TLSv1.2' }, listener) : http.createServer(listener);
server.listen(port, hostname, () => {
  console.log(`[console] in ascolto su ${certFile && keyFile ? 'https' : 'http'}://${hostname}:${port}${certFile && keyFile ? '' : ' (TLS terminato altrove: imposta CONSOLE_TLS_CERT_FILE/KEY per il TLS nativo)'}`);
});
