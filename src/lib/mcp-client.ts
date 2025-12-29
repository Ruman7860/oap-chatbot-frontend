import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class MCPClient {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private isConnected: boolean = false;

  constructor(serverUrl: string = "http://localhost:3000/sse") {
    this.client = new Client(
      {
        name: "oap-chatbot-frontend",
        version: "1.0.0",
      },
    );

    console.log("MCP Client initialized");

    // In a browser environment, we might handle transport differently if needed,
    // but the SDK's SSEClientTransport is designed for this.
    try {
      console.log("Initializing transport");
      this.transport = new SSEClientTransport(new URL(serverUrl));
      console.log("Transport initialized");
    } catch (e) {
      console.error("Invalid MCP Server URL", e);
    }
  }

  async connect() {
    if (this.isConnected) return;
    if (!this.transport) throw new Error("Transport not initialized");

    try {
      console.log("Connecting to MCP Server");
      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log("Connected to MCP Server");
    } catch (error) {
      console.error("Failed to connect to MCP Server:", error);
      throw error;
    }
  }

  async listTools() {
    if (!this.isConnected) {
      // Try connecting if not connected
      try {
        await this.connect();
      } catch {
        return [];
      }
    }
    return (await this.client.listTools()).tools;
  }

  async callTool(name: string, args: any) {
    if (!this.isConnected) throw new Error("Not connected to MCP Server");
    return await this.client.callTool({
      name,
      arguments: args,
    });
  }
}

export const mcpClient = new MCPClient(process.env.NEXT_PUBLIC_MCP_SERVER_URL);
