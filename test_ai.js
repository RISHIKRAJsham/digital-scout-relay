const WebSocket = require('ws');

console.log("==================================================");
console.log(" 🤖 SIMULATING CLAUDE/GEMINI MCP CONNECTION (LOCAL)");
console.log("==================================================");

// Connect to your LOCAL server using the secure AI token
// 🚨 FIX: Changed from wss:// Render URL to ws:// localhost URL
const ws = new WebSocket('ws://127.0.0.1:8081', {
    headers: { "Authorization": "Bearer mcp_sk_live_9988776655" }
});

ws.on('open', () => {
    console.log("✅ Secure connection established with Local Relay.");
    console.log("📥 Requesting dynamic tools via tools/list...");
    
    // Send the standard MCP protocol request
    ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
    }));
});

ws.on('message', (data) => {
    console.log("\n📦 [DYNAMIC MCP TOOLS RECEIVED]:\n");
    console.log(JSON.stringify(JSON.parse(data), null, 2));
    process.exit(0);
});

ws.on('error', (err) => {
    console.error("❌ Connection failed:", err.message);
    process.exit(1);
});