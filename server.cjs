const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
// The launcher passes the dist folder as argv[2]; fall back to the folder next to this script.
const dist = process.argv[2] || path.join(__dirname, 'dist');
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg' };
const server = http.createServer((req,res)=>{
  let rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
  let file = path.resolve(dist, rel);
  if (!file.startsWith(path.resolve(dist)) || !fs.existsSync(file)) file = path.join(dist,'index.html');
  try { const data = fs.readFileSync(file); res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'}); res.end(data); } catch { res.writeHead(500); res.end(); }
});
server.listen(0, '127.0.0.1', ()=>{
  const port = server.address().port;
  cp.exec(`start "" http://127.0.0.1:${port}/`, () => { /* browser open is best-effort */ });
});
