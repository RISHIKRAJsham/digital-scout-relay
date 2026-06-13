const WebSocket = require('ws');
const readline = require('readline');
const sessionManager = require('./sessionManager');
const cacheService = require('./cacheService');
const clientsDatabase = require('./clients.json'); 

// ============================================================================
// 🧠 SECURITY KEYS & ENVIRONMENT SETUP
// ============================================================================
const API_KEY = "AIzaSyCo4dMg9oHn5U-roqeia_joEEloPOhtOF0"; 
const EXTERNAL_AI_TOKEN = "Bearer mcp_sk_live_9988776655";  

const AUTHORIZED_AI_IPS = new Set(["::1", "127.0.0.1", "192.168.1.100"]); 

const PORT = process.env.PORT || 8081;
const wss = new WebSocket.Server({ port: PORT });

let activeAgent = null;
let activeClientToken = null; 
let dashboardClients = []; 
let pendingQuestion = ""; 

const pendingMCPRequests = new Map(); 
const stagedMutations = new Map(); 
const verifiedPayments = new Set(); 

// 👇 NEW: Dynamic Schema Variables
let schemaReady = false;
let dynamicTools = [];
let databaseSchema = {};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("==================================================");
console.log(" ☁️  DIGITAL SCOUT: ENTERPRISE UI ONLINE ");
console.log(` 🚀 SERVER RUNNING ON PORT: ${PORT}`);
console.log("==================================================");

// ============================================================================
// ⏱️ THE MULTI-FACTOR RATE LIMITER
// ============================================================================
const rateLimits = new Map();
function checkRateLimit(clientIp) {
    const now = Date.now();
    if (!rateLimits.has(clientIp)) { rateLimits.set(clientIp, [now]); return true; }
    const validTimestamps = rateLimits.get(clientIp).filter(ts => now - ts < 60000);
    if (validTimestamps.length >= 5) { rateLimits.set(clientIp, validTimestamps); return false; }
    validTimestamps.push(now);
    rateLimits.set(clientIp, validTimestamps);
    return true; 
}

function broadcastToUI(type, message, data = null) {
    dashboardClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type, message, data }));
    });
}

// ============================================================================
// 🔌 THE WEBSOCKET ENGINE
// ============================================================================
wss.on('connection', function connection(ws, req) {
  
  const clientIp = req.socket.remoteAddress;

  if (req.url === '/agent-tunnel' || req.url === '/') {
      activeAgent = ws; 
  }

  ws.on('message', async function incoming(message) {
    let payload;
    try {
        payload = JSON.parse(message.toString());
    } catch (e) {
        return; // Ignore malformed JSON
    }

    // 🚀 NEW: CATCH THE SCHEMA BROADCAST FROM C++
    if (payload.type === "schema_broadcast") {
        console.log("\n📥 [SCHEMA RECEIVED] Building dynamic MCP tools...");
        databaseSchema = payload.schema;
        dynamicTools = []; 

        // Auto-generate a read tool for every table found!
        for (const tableName of Object.keys(payload.schema)) {
            dynamicTools.push({
                name: `read_${tableName}`,
                description: `Reads data from the ${tableName} table.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        query_condition: { 
                            type: "string", 
                            description: "Optional SQL WHERE clause (e.g., \"Status = 'Paid'\")" 
                        }
                    }
                }
            });
        }

        // Inject the two global agent orientation tools
        dynamicTools.push({
            name: "get_schema",
            description: "Returns the full database schema (tables and columns) so the AI understands the data structure.",
            inputSchema: { type: "object", properties: {} }
        });

        dynamicTools.push({
            name: "execute_local_sql_query",
            description: "Execute a custom read-only SELECT statement directly on the local database.",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "A valid SQL SELECT query." }
                },
                required: ["query"]
            }
        });

        schemaReady = true;
        console.log(`✅ [MCP READY] Dynamically mapped ${Object.keys(payload.schema).length} tables into tools.`);
        
        broadcastToUI("system", `Database Schema Locked: ${Object.keys(payload.schema).length} Tables Found.`);
        return;
    }

    if (payload.role === "dashboard_approval") {
        const lockId = payload.lock_id;
        if (stagedMutations.has(lockId) && activeAgent) {
            console.log(`✅ [HUMAN OVERRIDE]: Admin approved mutation for Lock ID: ${lockId}`);
            const approvedCommand = stagedMutations.get(lockId);
            activeAgent.send(JSON.stringify({ 
                action: approvedCommand.action_type || "update_data", 
                auth_token: activeClientToken, 
                payload: approvedCommand.payload, 
                mcp_request_id: approvedCommand.mcp_request_id 
            }));
            stagedMutations.delete(lockId); 
            broadcastToUI("system_success", "Mutation lock released. Hardware executing write command.");
        }
        return;
    }

    if (payload.role === "dashboard") {
        console.log("🖥️  [UI DETECTED]: Live Web Dashboard connected.");
        dashboardClients.push(ws);
        return;
    }

    // Since Zero-Touch doesn't send auth_token immediately, we bypass this check for the new scanner temporarily
    const isLocalEdge = true; // Temporary bypass for Phase 2 zero-touch integration test
    const isExternalAgent = (payload.headers && payload.headers.Authorization === EXTERNAL_AI_TOKEN);

    if (isExternalAgent) {
        if (!AUTHORIZED_AI_IPS.has(clientIp)) {
            console.log(`🚨 [SECURITY BREACH DETECTED]: Valid token used from unauthorized IP: ${clientIp}`);
            ws.send(JSON.stringify({ error: "Unauthorized Origin IP." })); 
            ws.close(); 
            return;
        }
        if (!checkRateLimit(clientIp)) { 
            ws.send(JSON.stringify({ error: "Rate limit exceeded for this IP." })); 
            return; 
        }
    }

    // ========================================================================
    // 🌐 DYNAMIC MCP PROTOCOL ROUTER
    // ========================================================================
    if (payload.jsonrpc === "2.0") {
        
        if (payload.method === "tools/list") {
            // 🛡️ The Demo-Saver: Block AI until schema is mapped
            if (!schemaReady) {
                ws.send(JSON.stringify({ 
                    jsonrpc: "2.0", id: payload.id, 
                    error: { code: -32000, message: "Node initializing database adapter. Retry in 2 seconds." } 
                }));
                return;
            }

            // Return the dynamically generated tools!
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { tools: dynamicTools } }));
            return;
        }

        if (payload.method === "tools/call") {
            console.log(`\n⚙️ [MCP PROTOCOL]: External Agent executed tool -> [${payload.params.name}]`);
            
            // Handle the new get_schema tool natively in the cloud
            if (payload.params.name === "get_schema") {
                ws.send(JSON.stringify({
                    jsonrpc: "2.0", id: payload.id,
                    result: { content: [{ type: "text", text: JSON.stringify(databaseSchema) }] }
                }));
                return;
            }

            // Pass all dynamic read queries down to the edge node
            if (payload.params.name.startsWith("read_") || payload.params.name === "execute_local_sql_query") {
                if (activeAgent) {
                    pendingMCPRequests.set(payload.id, { ws: ws });
                    activeAgent.send(JSON.stringify({ 
                        action: "execute_dynamic_query", 
                        tool: payload.params.name,
                        params: payload.params.arguments,
                        mcp_request_id: payload.id 
                    }));
                } else {
                    ws.send(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: "Edge Node Offline." } }));
                }
            } 
            return;
        }
    }

    // ========================================================================
    // 💾 C++ HARDWARE RESPONSES
    // ========================================================================
    if (payload.status === "success" && payload.mcp_request_id) {
        // Route dynamic tool responses back to Claude
        if (pendingMCPRequests.has(payload.mcp_request_id)) {
            const aiRequest = pendingMCPRequests.get(payload.mcp_request_id);
            aiRequest.ws.send(JSON.stringify({ 
                jsonrpc: "2.0", id: payload.mcp_request_id, 
                result: { content: [{ type: "text", text: JSON.stringify(payload.data) }] } 
            }));
            pendingMCPRequests.delete(payload.mcp_request_id);
            broadcastToUI("database", "Edge AI intercepted local database.", payload.data);
            return; 
        }
    }
  });

  ws.on('close', () => { activeAgent = null; });
});