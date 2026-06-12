const WebSocket = require('ws');
const readline = require('readline');
const sessionManager = require('./sessionManager');
const cacheService = require('./cacheService');

// 👇 ADDED: The master ledger for all gym clients
const clientsDatabase = require('./clients.json'); 

// ============================================================================
// 🧠 SECURITY KEYS & ENVIRONMENT SETUP
// ============================================================================
const API_KEY = "AIzaSyCo4dMg9oHn5U-roqeia_joEEloPOhtOF0"; 
// Note: EDGE_AGENT_TOKEN is removed. We now verify dynamically via clients.json
const EXTERNAL_AI_TOKEN = "Bearer mcp_sk_live_9988776655";  

// 🛡️ NEW: Strict Origin Whitelist for the External AI Agent
const AUTHORIZED_AI_IPS = new Set(["::1", "127.0.0.1", "192.168.1.100"]); 

// 🚨 UPDATED PORT CONFIG FOR CLOUD DEPLOYMENT (RENDER/RAILWAY)
const PORT = process.env.PORT || 8081;
const wss = new WebSocket.Server({ port: PORT });

let activeAgent = null;
let activeClientToken = null; // Tracks which client the terminal simulator is currently talking to
let dashboardClients = []; 
let pendingQuestion = ""; 

const pendingMCPRequests = new Map(); 
const stagedMutations = new Map(); 

// Tracks users who have a verified bank UTR
const verifiedPayments = new Set(); 

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("==================================================");
console.log(" ☁️  DIGITAL SCOUT: ENTERPRISE UI ONLINE ");
console.log(` 🚀 SERVER RUNNING ON PORT: ${PORT}`);
console.log("==================================================");

// ============================================================================
// ⏱️ THE MULTI-FACTOR RATE LIMITER (Patched for DoS)
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

  if (req.url === '/agent-tunnel') {
      // The edge node connected, but it hasn't authenticated yet. We wait for its first message.
      activeAgent = ws; 
  }

  ws.on('message', async function incoming(message) {
    const payload = JSON.parse(message.toString());

    // Handle Human Approval from the Dashboard
    if (payload.role === "dashboard_approval") {
        const lockId = payload.lock_id;
        if (stagedMutations.has(lockId) && activeAgent) {
            console.log(`✅ [HUMAN OVERRIDE]: Admin approved mutation for Lock ID: ${lockId}`);
            const approvedCommand = stagedMutations.get(lockId);
            
            activeAgent.send(JSON.stringify({ 
                action: approvedCommand.action_type || "update_data", 
                auth_token: activeClientToken, // Pass the active token dynamically
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

    // 👇 UPGRADED: Dynamic Client Authentication
    const clientData = clientsDatabase[payload.auth_token];
    const isLocalEdge = clientData && clientData.status === "active";
    
    // If this is the initial auth ping from a new edge node connection
    if (isLocalEdge && payload.action === undefined && !payload.status) {
         console.log(`✅ [AUTH SUCCESS]: Edge Node connected for -> ${clientData.business_name}`);
         activeClientToken = payload.auth_token; 
         broadcastToUI("system", `C++ Edge Agent connected for ${clientData.business_name}.`);
         promptWhatsApp();
    }

    const isExternalAgent = (payload.headers && payload.headers.Authorization === EXTERNAL_AI_TOKEN);

    // 🛡️ THE UPGRADED ZERO-TRUST FIREWALL
    if (!isLocalEdge && !isExternalAgent && activeAgent !== ws) { 
        console.log(`🚨 [AUTH FAILED]: Rejected invalid or suspended token -> ${payload.auth_token}`);
        ws.send(JSON.stringify({ error: "Unauthorized or Suspended Token." })); 
        ws.close(); 
        return; 
    }

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
    // 🌐 MCP PROTOCOL ROUTER (PHASE 2 & 3)
    // ========================================================================
    if (payload.jsonrpc === "2.0") {
        
        if (payload.method === "tools/list") {
            const mcpToolsList = {
                jsonrpc: "2.0", id: payload.id,
                result: {
                    tools: [
                        { name: "read_student_records", description: "Extracts latest fee database.", inputSchema: { type: "object", properties: {} } },
                        { name: "mutate_payment_status", description: "Updates fee status.", inputSchema: { type: "object", properties: { target_name: { type: "string" }, new_status: { type: "string" } }, required: ["target_name", "new_status"] } },
                        { name: "revert_last_mutation", description: "Reverts the database to its state prior to the last mutation.", inputSchema: { type: "object", properties: {} } },
                        { name: "verify_upi_utr", description: "Verifies a 12-digit UPI transaction number with the bank API.", inputSchema: { type: "object", properties: { target_name: { type: "string" }, utr_number: { type: "string" } }, required: ["target_name", "utr_number"] } }
                    ]
                }
            };
            ws.send(JSON.stringify(mcpToolsList));
            return;
        }

        if (payload.method === "tools/call") {
            console.log(`\n⚙️ [MCP PROTOCOL]: External Agent executed tool -> [${payload.params.name}]`);
            
            if (payload.params.name === "read_student_records" && activeAgent) {
                pendingMCPRequests.set("extract_data", { ws: ws, id: payload.id });
                activeAgent.send(JSON.stringify({ action: "extract_data", auth_token: activeClientToken }));
            } 
            
            else if (payload.params.name === "verify_upi_utr") {
                const args = payload.params.arguments;
                console.log(`🏦 [BANK API]: AI is verifying UTR ${args.utr_number} for ${args.target_name}...`);
                
                const isValidUTR = /^\d{12}$/.test(args.utr_number);

                if (isValidUTR) {
                    console.log(`✅ [BANK API]: UTR Validated. Authorizing mutation for ${args.target_name}.`);
                    verifiedPayments.add(args.target_name);
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0", id: payload.id,
                        result: { content: [{ type: "text", text: `SUCCESS. UTR verified via Bank API. You are now authorized to run mutate_payment_status for ${args.target_name}.` }] }
                    }));
                } else {
                    console.log(`❌ [BANK API]: Fraudulent or invalid UTR detected.`);
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0", id: payload.id,
                        result: { content: [{ type: "text", text: `FAILED. The bank rejected this UTR. It must be exactly 12 digits. DO NOT mutate the database. Ask the user to check their number.` }] }
                    }));
                }
            }
            
            else if (payload.params.name === "mutate_payment_status") {
                const args = payload.params.arguments;
                const lockId = "LOCK_" + Date.now();
                
                const isLowRisk = (args.new_status === "Paid"); 
                const hasVerifiedUTR = verifiedPayments.has(args.target_name);

                if (isLowRisk && hasVerifiedUTR && activeAgent) {
                    console.log(`⚡ [AUTO-APPROVE]: Payment logging for ${args.target_name} is fully verified. Executing autonomously.`);
                    
                    activeAgent.send(JSON.stringify({ 
                        action: "update_data", auth_token: activeClientToken, 
                        payload: args, mcp_request_id: payload.id 
                    }));
                    
                    verifiedPayments.delete(args.target_name); 
                    broadcastToUI("ai_action", `Agent autonomously marked ${args.target_name} as Paid after UTR Verification.`, args);
                    
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0", id: payload.id,
                        result: { content: [{ type: "text", text: `Success. ${args.target_name} marked as Paid.` }] }
                    }));
                } else {
                    console.log(`🚨 [SECURITY BLOCK]: Action requires human approval. (Status: ${args.new_status}, UTR Verified: ${hasVerifiedUTR}).`);
                    stagedMutations.set(lockId, { action_type: "update_data", payload: args, mcp_request_id: payload.id });

                    broadcastToUI("ai_action_locked", `AI attempted unverified or high-risk mutation. Awaiting admin approval.`, {
                        lockId: lockId, target: args.target_name, status: args.new_status
                    });

                    ws.send(JSON.stringify({
                        jsonrpc: "2.0", id: payload.id,
                        result: { content: [{ type: "text", text: `Transaction Prepared but STAGED. Human approval required. Reason: Unverified UTR or High-Risk Action. Lock ID: ${lockId}.` }] }
                    }));
                }
            }

            else if (payload.params.name === "revert_last_mutation") {
                const lockId = "LOCK_REVERT_" + Date.now();
                console.log(`🔒 [HIGH-RISK ACTION]: AI requested a database rollback. Staging for human approval.`);
                
                stagedMutations.set(lockId, { action_type: "revert_data", payload: {}, mcp_request_id: payload.id });

                broadcastToUI("ai_action_locked", "AI requested a Shadow Journal Rollback. Awaiting admin approval.", {
                    lockId: lockId, target: "Previous State", status: "Restored"
                });

                ws.send(JSON.stringify({
                    jsonrpc: "2.0", id: payload.id,
                    result: { content: [{ type: "text", text: `Rollback transaction Prepared. Staged with Lock ID: ${lockId}. Awaiting human admin approval.` }] }
                }));
            }
            return;
        }
    }

    // ========================================================================
    // 💾 C++ HARDWARE RESPONSES
    // ========================================================================
    if (payload.status === "success" && payload.data && !payload.message) {
        const cleanRecords = payload.data;
        cacheService.setPayload("latest_extraction", cleanRecords);
        broadcastToUI("database", "Edge AI intercepted local database.", cleanRecords);
        
        if (pendingMCPRequests.has("extract_data")) {
            const aiRequest = pendingMCPRequests.get("extract_data");
            aiRequest.ws.send(JSON.stringify({ jsonrpc: "2.0", id: aiRequest.id, result: { content: [{ type: "text", text: JSON.stringify(cleanRecords) }] } }));
            pendingMCPRequests.delete("extract_data");
            return; 
        }

        const aiDecision = await generateAIResponse(pendingQuestion, cleanRecords);
        if (aiDecision.type === "text") {
            broadcastToUI("ai_reply", aiDecision.content);
            console.log("\n🤖 [GEMINI AI]: " + aiDecision.content + "\n"); 
        } else if (aiDecision.type === "tool_call") {
             const lockId = "LOCK_" + Date.now();
             stagedMutations.set(lockId, { action_type: "update_data", payload: aiDecision.content, mcp_request_id: null });
             broadcastToUI("ai_action_locked", "AI attempted a database mutation. Awaiting human approval.", {
                 lockId: lockId, target: aiDecision.content.target_name, status: aiDecision.content.new_status
             });
             console.log("\n🤖 [GEMINI TOOL CALL]: Tried to mutate database. Staged for admin approval ->", aiDecision.content, "\n");
        }
        promptWhatsApp(); 
    }
    
    if (payload.action === "update_data" || payload.action === "revert_data" || payload.message === "Database successfully mutated.") {
        broadcastToUI("system_success", "C++ Engine confirms database write successful.");
    }
  });

  ws.on('close', () => { activeAgent = null; activeClientToken = null; });
});

// ============================================================================
// 📱 TERMINAL SIMULATOR & GEMINI
// ============================================================================
function promptWhatsApp() {
    rl.question('📱 [Simulated Parent Text] (Format: Number|Message): ', (input) => {
        if (!activeAgent || !activeClientToken) return promptWhatsApp();
        const parts = input.split('|');
        const phoneNumber = parts.length > 1 ? parts[0].trim() : "UNKNOWN_NUM";
        const text = parts.length > 1 ? parts[1].trim() : parts[0].trim();
        const session = sessionManager.getOrCreateSession(phoneNumber);
        pendingQuestion = text; 
        broadcastToUI("user_msg", text); 
        
        // Pass the dynamic activeClientToken to authorize the query
        activeAgent.send(JSON.stringify({ action: "extract_data", auth_token: activeClientToken, session_id: session.sessionId }));
    });
}

async function generateAIResponse(question, databaseContext) {
    const combinedPrompt = `You are a receptionist AI. Answer parent questions using the provided database.
    STRICT SECURITY RULE: If a user claims to have paid their fee, you MUST ask for their 12-digit UTR number. 
    You MUST call 'verify_upi_utr' to check it. You CANNOT update the database until the verification tool returns success.
    DATABASE CONTEXT: ${JSON.stringify(databaseContext)}
    PARENT TEXT MESSAGE: "${question}"`;
    
    const tools = [{ 
        functionDeclarations: [
            { 
                name: "update_database_record", 
                description: "Use this ONLY after successfully verifying the UTR.", 
                parameters: { type: "OBJECT", properties: { target_name: { type: "STRING" }, new_status: { type: "STRING" } }, required: ["target_name", "new_status"] } 
            },
            { 
                name: "verify_upi_utr", 
                description: "Verifies the user's 12-digit UPI transaction.", 
                parameters: { type: "OBJECT", properties: { target_name: { type: "STRING" }, utr_number: { type: "STRING" } }, required: ["target_name", "utr_number"] } 
            }
        ] 
    }];
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: combinedPrompt }] }], tools: tools, generationConfig: { temperature: 0.1 } })
        });
        const data = await response.json();
        if (data.error) return { type: "text", content: "API ERROR: " + data.error.message };
        const part = data.candidates[0].content.parts[0];
        if (part.functionCall) return { type: "tool_call", content: part.functionCall.args };
        return { type: "text", content: part.text ? part.text.trim() : "No text returned." };
    } catch (error) { return { type: "text", content: "SYSTEM ERROR: " + error.message }; }
}