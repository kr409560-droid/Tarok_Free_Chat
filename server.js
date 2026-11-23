const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const file = req.url === '/manifest.json' ? 'manifest.json' : 'index.html';
  const type = file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';
  fs.readFile(path.join(__dirname, 'public', file), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function broadcastCount(room) {
  if (!room) return;
  let count = 0;
  wss.clients.forEach(c => { if (c.readyState === 1 && c.room === room) count++; });
  const msg = Buffer.concat([Buffer.from([4]), Buffer.from(String(count))]);
  wss.clients.forEach(c => { if (c.readyState === 1 && c.room === room) c.send(msg); });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    const buf = Buffer.from(data);
    if (buf.length < 2) return;
    const type = buf[0];

    if (type === 1) {
      const oldRoom = ws.room;
      ws.room = buf.slice(1).toString('utf8').slice(0, 32);
      if (oldRoom) broadcastCount(oldRoom);
      broadcastCount(ws.room);
      return;
    }

    if ((type === 2 || type === 3) && ws.room) {
      wss.clients.forEach(c => {
        if (c !== ws && c.readyState === 1 && c.room === ws.room) {
          c.send(buf);
        }
      });
    }
  });

  ws.on('close', () => broadcastCount(ws.room));
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => console.log(`LiteChat running at http://localhost:${PORT}`));
