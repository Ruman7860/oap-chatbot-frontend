export type Role = "user" | "model";

export interface MessagePart {
  text?: string;
  type?: "text" | "tool_use" | "tool_result";
  // specific fields for tool use/result if needed
}

export interface Message {
  role: Role;
  text: string; // Simplified for UI
  parts?: any[]; // Full parts if needed for API
  id: string;
  timestamp: number;
}
