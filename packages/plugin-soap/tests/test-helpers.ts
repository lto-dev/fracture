// Test helpers for plugin-soap tests
import https from 'https';
import http from 'http';
import net from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { TLSSocket } from 'tls';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * HTTPS test server with optional client cert requirement
 */
export class TestHttpsServer {
  private server?: https.Server;
  private serverPort = 0;
  
  async start(options?: { requireClientCert?: boolean }): Promise<string> {
    return new Promise((resolve, reject) => {
      const serverOptions: https.ServerOptions = {
        key: readFileSync(join(__dirname, 'test-fixtures/server-key.pem')),
        cert: readFileSync(join(__dirname, 'test-fixtures/server-cert.pem')),
        requestCert: options?.requireClientCert ?? false,
        rejectUnauthorized: options?.requireClientCert ?? false
      };
      
      if (options?.requireClientCert === true) {
        serverOptions.ca = [readFileSync(join(__dirname, 'test-fixtures/client-cert.pem'))];
      }
      
      this.server = https.createServer(serverOptions, (req, res) => {
        const url = req.url ?? '/';
        
        if (url === '/test') {
          // Check if client cert was provided (socket has authorized property in TLS)
          const socket = req.socket as TLSSocket;
          const clientCertProvided = socket.authorized ?? false;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'HTTPS OK', clientCertProvided }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
      
      this.server.listen(0, 'localhost', () => {
        const addr = this.server?.address();
        if (addr !== null && typeof addr === 'object') {
          this.serverPort = addr.port;
          resolve(`https://localhost:${this.serverPort}`);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      
      this.server.on('error', reject);
    });
  }
  
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server !== undefined) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

/**
 * HTTP proxy server for testing proxy functionality
 */
export class TestProxyServer {
  private server?: http.Server;
  private proxyPort = 0;
  public requestLog: string[] = [];
  private authRequired: boolean = false;
  private authUsername?: string;
  private authPassword?: string;
  private activeSockets: Set<net.Socket> = new Set();
  
  async start(options?: {
    requireAuth?: boolean,
    username?: string,
    password?: string
  }): Promise<number> {
    this.authRequired = options?.requireAuth ?? false;
    this.authUsername = options?.username;
    this.authPassword = options?.password;
    this.requestLog = [];
    this.activeSockets = new Set();
    
    return new Promise((resolve, reject) => {
      this.server = http.createServer();
      
      // Track connections for clean shutdown
      this.server.on('connection', (socket) => {
        this.activeSockets.add(socket);
        socket.once('close', () => {
          this.activeSockets.delete(socket);
        });
      });
      
      // Handle CONNECT method for HTTPS tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        // Check auth if required
        if (this.authRequired === true) {
          const proxyAuth = req.headers['proxy-authorization'];
          if (proxyAuth === undefined || proxyAuth === null) {
            clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            clientSocket.end();
            return;
          }
          
          const expectedAuth = `Basic ${Buffer.from(`${this.authUsername ?? ''}:${this.authPassword ?? ''}`).toString('base64')}`;
          if (proxyAuth !== expectedAuth) {
            clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            clientSocket.end();
            return;
          }
        }
        
        // Log the connection
        this.requestLog.push(req.url ?? '');
        
        // Parse target host and port from URL
        const [targetHost, targetPortStr] = (req.url ?? '').split(':');
        const targetPort = parseInt(targetPortStr ?? '443');
        
        // Create connection to target server
        const serverSocket = net.connect(targetPort, targetHost, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          // Pipe data in both directions
          if (head.length > 0) {
            serverSocket.write(head);
          }
          serverSocket.pipe(clientSocket);
          clientSocket.pipe(serverSocket);
        });
        
        serverSocket.on('error', () => {
          clientSocket.destroy();
        });
        
        clientSocket.on('error', () => {
          serverSocket.destroy();
        });
      });
      
      // Handle regular HTTP requests (non-CONNECT)
      this.server.on('request', (req, res) => {
        // Check auth
        if (this.authRequired === true) {
          const proxyAuth = req.headers['proxy-authorization'];
          if (proxyAuth === undefined || proxyAuth === null) {
            res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Proxy"' });
            res.end();
            return;
          }
        }
        
        this.requestLog.push(req.url ?? '');
        
        // Forward or respond
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ proxied: true }));
      });
      
      this.server.listen(0, 'localhost', () => {
        const addr = this.server?.address();
        if (addr !== null && typeof addr === 'object') {
          this.proxyPort = addr.port;
          resolve(this.proxyPort);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      
      this.server.on('error', reject);
    });
  }
  
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server !== undefined) {
        // Destroy all active sockets first
        this.activeSockets.forEach(socket => socket.destroy());
        this.activeSockets.clear();
        
        // Close server with timeout
        const timeout = setTimeout(() => {
          resolve();
        }, 1000);
        
        this.server.close((err) => {
          clearTimeout(timeout);
          if (err !== undefined && err !== null) {
            reject(err);
          } else {
            resolve();
          }
        });
        this.server.closeAllConnections?.();
      } else {
        resolve();
      }
    });
  }
}
