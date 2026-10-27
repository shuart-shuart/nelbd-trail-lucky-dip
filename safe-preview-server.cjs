const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'dist-safe-preview');const entry=path.join(root,'safe-preview.html');
if(!fs.existsSync(entry))throw Error('Safe preview not built. Run npm run build:safe-preview');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.otf':'font/otf','.ttf':'font/ttf'};
http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const requested=path.resolve(root,'.'+decodeURIComponent(pathname));const file=requested.startsWith(root+path.sep)&&fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:entry;
res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':file===entry?'no-store':'public, max-age=3600'});fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT||10000,'0.0.0.0',()=>console.log('NELBD safe React preview — network connections blocked'));
