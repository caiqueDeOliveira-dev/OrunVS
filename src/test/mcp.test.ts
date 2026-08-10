import * as assert from 'assert';
import { describe, it, before, after } from 'mocha';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { MCPManager, normalizarConfigsMCP, blocoFerramentasMCP } from '../mcp';

const MOCK_SERVER = `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const respond = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\\n");
  switch (msg.method) {
    case "initialize":
      respond({ serverInfo: { name: "mock-mcp", version: "1.0.0" }, capabilities: {} });
      break;
    case "tools/list":
      respond({ tools: [
        { name: "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
        { name: "boom", description: "Always fails", inputSchema: { type: "object", properties: {} } },
      ] });
      break;
    case "tools/call":
      if (msg.params.name === "boom") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "mock failure" } }) + "\\n");
      } else {
        respond({ content: [{ type: "text", text: "echo:" + (msg.params.arguments?.text || "") }] });
      }
      break;
  }
});
`;

let tmp: string;
let manager: MCPManager;

before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-mcp-'));
    fs.writeFileSync(path.join(tmp, 'mock-mcp-server.cjs'), MOCK_SERVER);
    manager = new MCPManager();
});

after(() => {
    manager.stopAll();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
});

describe('mcp: normalizarConfigsMCP / blocoFerramentasMCP', () => {
    it('normaliza configs válidas e filtra itens inválidos', () => {
        const configs = normalizarConfigsMCP([
            { name: 'penpot', command: 'npx', args: ['-y', 'mcp-remote'], env: { A: '1' } },
            { name: '', command: 'x' },
            { command: 'sem-nome' },
            'lixo',
            null,
            { name: 'ok', command: '  node  ' },
        ]);
        assert.strictEqual(configs.length, 2);
        assert.strictEqual(configs[0].name, 'penpot');
        assert.deepStrictEqual(configs[0].args, ['-y', 'mcp-remote']);
        assert.deepStrictEqual(configs[0].env, { A: '1' });
        assert.strictEqual(configs[1].command, 'node');
    });

    it('normalizarConfigsMCP retorna lista vazia para entrada não-array', () => {
        assert.deepStrictEqual(normalizarConfigsMCP(undefined), []);
        assert.deepStrictEqual(normalizarConfigsMCP({}), []);
    });

    it('blocoFerramentasMCP lista as ferramentas e omite bloco vazio', () => {
        const bloco = blocoFerramentasMCP([
            { name: 'mock__echo', serverName: 'mock', toolName: 'echo', description: 'Echo text', inputSchema: {} },
        ]);
        assert.ok(bloco.includes('FERRAMENTAS MCP'));
        assert.ok(bloco.includes('mock__echo'));
        assert.strictEqual(blocoFerramentasMCP([]), '');
        assert.strictEqual(blocoFerramentasMCP(undefined as any), '');
    });
});

describe('mcp: addServer / getAllTools', () => {
    it('initializes a stdio MCP server and lists its tools', async () => {
        const tools = await manager.addServer({ name: 'mock', command: process.execPath, args: [path.join(tmp, 'mock-mcp-server.cjs')] });
        assert.strictEqual(tools.length, 2);
        assert.strictEqual(tools[0].name, 'mock__echo');
        assert.ok(tools[0].description.includes('[MCP:mock]'));
        assert.ok(tools[0].inputSchema);
    });

    it('getAllTools flattens tools with the double-underscore prefix', () => {
        const all = manager.getAllTools();
        assert.ok(all.some((t) => t.name === 'mock__echo'));
        assert.ok(all.some((t) => t.name === 'mock__boom'));
    });

    it('listServers reports ready state and tool count', () => {
        const servers = manager.listServers();
        const mock = servers.find((s) => s.name === 'mock');
        assert.ok(mock);
        assert.strictEqual(mock.ready, true);
        assert.strictEqual(mock.tools, 2);
    });
});

describe('mcp: callTool', () => {
    it('calls a tool and returns its text content', async () => {
        const res = await manager.callTool('mock__echo', { text: 'ola' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.text, 'echo:ola');
        assert.strictEqual(res.error, undefined);
    });

    it('returns an error object when the server returns a tool error', async () => {
        const res = await manager.callTool('mock__boom', {});
        assert.strictEqual(res.ok, false);
        assert.ok(res.error);
        assert.ok(res.error.includes('mock failure'));
    });

    it('rejects malformed tool names without a server prefix', async () => {
        const res = await manager.callTool('echo', {});
        assert.strictEqual(res.ok, false);
        assert.ok(res.error);
        assert.ok(res.error.includes('inválido'));
    });

    it('rejects calls to a server that does not exist', async () => {
        const res = await manager.callTool('ghost__echo', {});
        assert.strictEqual(res.ok, false);
        assert.ok(res.error);
        assert.ok(res.error.includes('não encontrado'));
    });
});

describe('mcp: removeServer', () => {
    it('removes a server and its tools from the registry', async () => {
        manager.removeServer('mock');
        const servers = manager.listServers();
        assert.strictEqual(servers.find((s) => s.name === 'mock'), undefined);
        const res = await manager.callTool('mock__echo', {});
        assert.strictEqual(res.ok, false);
        assert.ok(res.error);
        assert.ok(res.error.includes('não encontrado'));
    });
});
