/*
 * Tiny reverse proxy used ONLY inside the Emergent preview environment.
 *
 * The platform's ingress sends `/api/*` traffic to port 8001 (the Flask app)
 * and every other path to port 3000 (this process). To keep QuickShare a pure
 * Flask app, this process simply forwards ALL requests it receives on port
 * 3000 to the same Flask app running on 8001. That way the HTML pages,
 * /static assets and /download routes are all served by Flask.
 *
 * This file is NOT part of the QuickShare deliverable -- for the college demo
 * you just run `python app.py` and open http://<your-ip>:5000 directly.
 */
const http = require("http");
const httpProxy = require("http-proxy");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "3000", 10);
const TARGET = "http://127.0.0.1:8001";

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  if (res && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
  }
  if (res) res.end("QuickShare backend is starting, please refresh in a moment.");
});

const server = http.createServer((req, res) => proxy.web(req, res));
server.listen(PORT, HOST, () => {
  console.log(`QuickShare preview proxy: http://${HOST}:${PORT} -> ${TARGET}`);
});
