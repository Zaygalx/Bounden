// Local CONNECT relay: Chromium -> 127.0.0.1:8899 -> egress proxy -> out.
// Exists because the headless shell cannot tunnel through the egress
// proxy directly (ERR_TUNNEL_CONNECTION_FAILED) while Node can.
import http from "node:http";
import net from "node:net";

const up = new URL(process.env.HTTPS_PROXY || process.env.https_proxy);
const AUTH = "Basic " + Buffer.from(decodeURIComponent(up.username) + ":" + decodeURIComponent(up.password)).toString("base64");
const UP_HOST = up.hostname;
const UP_PORT = Number(up.port);

const server = http.createServer((req, res) => {
  // Plain-HTTP forwarding (absolute URI), rarely needed.
  try {
    const target = new URL(req.url);
    const s = net.connect(UP_PORT, UP_HOST, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`, `Host: ${target.host}`, `Proxy-Authorization: ${AUTH}`, "Proxy-Connection: close", ""];
      s.write(lines.join("\r\n") + "\r\n");
      req.pipe(s, { end: true });
      s.pipe(res.socket, { end: true });
    });
    s.on("error", () => { res.writeHead(502); res.end(); });
  } catch { res.writeHead(400); res.end(); }
});

server.on("connect", (req, clientSocket, head) => {
  const upstream = net.connect(UP_PORT, UP_HOST, () => {
    upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${AUTH}\r\nProxy-Connection: keep-alive\r\n\r\n`);
  });
  let buf = Buffer.alloc(0);
  const onData = (d) => {
    buf = Buffer.concat([buf, d]);
    const idx = buf.indexOf("\r\n\r\n");
    if (idx === -1) return;
    const statusLine = buf.slice(0, buf.indexOf("\r\n")).toString();
    upstream.off("data", onData);
    if (/ 200 /.test(statusLine)) {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const rest = buf.slice(idx + 4);
      if (rest.length) clientSocket.write(rest);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    } else {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.end();
      upstream.end();
    }
  };
  upstream.on("data", onData);
  upstream.on("error", () => clientSocket.end());
  clientSocket.on("error", () => upstream.end());
  if (head?.length) upstream.write(head);
});

server.listen(8899, "127.0.0.1", () => console.log("relay on 127.0.0.1:8899"));
