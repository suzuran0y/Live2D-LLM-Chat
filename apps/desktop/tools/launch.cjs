'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
let electron;
try { electron = require('electron'); }
catch { process.stderr.write('Electron runtime is missing. Run pnpm setup:desktop first.\n'); process.exit(1); }
const smoke = process.argv.includes('--smoke');
const avatarSmoke = process.argv.includes('--avatar-smoke');
const speechSmoke = process.argv.includes('--speech-smoke');
const cosyvoiceSmoke = process.argv.includes('--cosyvoice-smoke');
const maintenanceSmoke = process.argv.includes('--maintenance-smoke');
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
const entry = path.resolve(__dirname, maintenanceSmoke ? '../test/maintenance-smoke-main.cjs' : cosyvoiceSmoke ? '../test/cosyvoice-smoke-main.cjs' : speechSmoke ? '../test/speech-smoke-main.cjs' : avatarSmoke ? '../test/avatar-smoke-main.cjs' : smoke ? '../test/smoke-main.cjs' : '..');
const child = spawn(electron, [entry], { env: environment, windowsHide: true, stdio: 'inherit' });
child.once('error', () => { process.stderr.write('Electron could not start.\n'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
