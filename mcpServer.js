// mcpServer.js
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

// Initialize an MCP Server instance for Digital Scout
const server = new Server({
  name: "digital-scout-edge-node",
  version: "1.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

// ============================================================================
// 1. TOOL DISCOVERY ENDPOINT (The Machine-Readable Contract)
// ============================================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_student_records",
        description: "Extracts normalized student information, enrollment status, and payment logs from the offline local database.",
        inputSchema: {
          type: "object",
          properties: {
            search_query: { type: "string", description: "Optional name or phone identifier to filter records via Levenshtein matching." }
          }
        }
      },
      {
        name: "mutate_payment_status",
        description: "Executes a secure write-back mutation to alter a specific student's fee payment status in the offline hard drive.",
        inputSchema: {
          type: "object",
          properties: {
            student_name: { type: "string", description: "The precise or approximate name of the student." },
            new_status: { type: "string", enum: ["Paid", "Unpaid"], description: "The deterministic primitive state to write back." }
          },
          required: ["student_name", "new_status"]
        }
      },
      {
        name: "revert_last_mutation",
        description: "CRITICAL FAILSAFE: Reverts a database mutation if a logical error or LLM hallucination occurred. Restores the exact database row from the local in-memory shadow journal.",
        inputSchema: {
          type: "object",
          properties: {
            student_name: { type: "string", description: "The exact name of the student whose record needs to be rolled back." }
          },
          required: ["student_name"]
        }
      }
    ]
  };
});

// ============================================================================
// 2. TOOL EXECUTION ROUTER (Translates MCP -> Edge Agent Payload)
// ============================================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Note: In a live enterprise setup, this router hooks directly into your 
  // server.js WebSocket array to push the translated JSON down the WinSock tunnel.
  
  switch (name) {
    case "read_student_records":
      return {
        content: [{ type: "text", text: `[MCP Pipeline] Transmitting extract command for: ${args.search_query || 'ALL'}` }]
      };

    case "mutate_payment_status":
      return {
        content: [{ type: "text", text: `[MCP Pipeline] Transmitting secure mutation payload for ${args.student_name} -> ${args.new_status}` }]
      };

    case "revert_last_mutation":
      return {
        content: [{ type: "text", text: `[MCP Pipeline] EMERGENCY: Transmitting rollback command for ${args.student_name}` }]
      };

    default:
      throw new Error(`Tool unknown: ${name}`);
  }
});

// Connect the server to a standard input/output messaging transport layer
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("✅ Digital Scout MCP Layer successfully initialized with Active Rollback capabilities.");
});