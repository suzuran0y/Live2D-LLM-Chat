'use strict';
const fs = require('node:fs'), path = require('node:path');
function auditRelease(root, source = false) {
  const entries = [];
  function visit(directory, relative = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? relative + '/' + item.name : item.name;
      if (item.isSymbolicLink() || /(^|\/)(\.git|\.venv[^/]*|venv|voice-profiles|__pycache__|test-results)(\/|$)/iu.test(name)
        || /(^|\/)(\.env(?:\..*)?|pyvenv\.cfg|v2\.local\.json|resource-settings\.json|model-settings\.json|conversation_history\.txt)$/iu.test(name)
        || /\.(sqlite|db|wav|mp3|flac|pem|key|pyc)$/iu.test(name) || source && name.split('/').includes('node_modules')
        || source && item.name === 'live2dcubismcore.min.js') throw Error('Excluded release content: ' + name);
      if (item.isDirectory()) visit(path.join(directory, item.name), name);
      else { entries.push(name); if (/\.(cjs|mjs|js|py|json|md|txt)$/iu.test(name) && fs.statSync(path.join(root, name)).size < 2 * 1024 * 1024) {
        if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/u.test(fs.readFileSync(path.join(root, name), 'utf8'))) throw Error('Possible secret in release text: ' + name);
      } }
    }
  }
  visit(root); return { passed: true, files: entries.length, source };
}
module.exports = { auditRelease };
