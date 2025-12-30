"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Bot, User as UserIcon, Plug, AlertCircle, Menu } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getGeminiModel } from "@/lib/gemini-client";
import { mcpClient } from "@/lib/mcp-client";
import { Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatService, Chat, ChatDetail } from "@/lib/chat-service";
import { Sidebar } from "./Sidebar";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"normal" | "mcp">("normal");
  const [mcpStatus, setMcpStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Ref to scroll to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Ref to track if we are creating a new chat to prevent race condition
  const isNewChatRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load Chats on Mount
  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
      try {
          const loadedChats = await chatService.getChats();
          setChats(loadedChats);
      } catch (e) {
          console.error("Failed to load chats", e);
      }
  };

  // Load Messages when Chat Selected
  useEffect(() => {
    if (currentChatId) {
        // If this is the chat we just created, don't reload (to preserve optimistic state)
        if (isNewChatRef.current === currentChatId) {
            isNewChatRef.current = null; // Reset
            return;
        }
        loadMessages(currentChatId);
    } else {
        setMessages([]);
    }
  }, [currentChatId]);

  const loadMessages = async (chatId: string) => {
      try {
          setMessages([]);
          const chatDetail = await chatService.getChat(chatId);
          // Map backend messages to frontend format
          const formattedMessages: Message[] = chatDetail.messages.map(m => ({
              id: m.id,
              role: m.role as "user" | "model",
              text: m.content,
              timestamp: new Date(m.createdAt).getTime()
          }));
          setMessages(formattedMessages);
      } catch (e) {
          console.error("Failed to load messages", e);
      }
  };

  // Handle MCP Connection when switching to MCP mode
  useEffect(() => {
    if (mode === "mcp" && mcpStatus === "disconnected") {
      setMcpStatus("connecting");
      mcpClient.connect()
        .then(() => setMcpStatus("connected"))
        .catch(() => setMcpStatus("error"));
    }
  }, [mode, mcpStatus]);

  const handleNewChat = () => {
      setCurrentChatId(null);
      setMessages([]);
      setInputValue("");
      if (window.innerWidth < 768) setIsSidebarOpen(false); // Auto close on mobile
  };

  const handleDeleteChat = async (id: string) => {
      if (!confirm("Are you sure you want to delete this chat?")) return;
      try {
          await chatService.deleteChat(id);
          setChats(prev => prev.filter(c => c.id !== id));
          if (currentChatId === id) {
              handleNewChat();
          }
      } catch (e) {
          console.error("Failed to delete chat", e);
      }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    //Optimistic Update
    const tempId = Date.now().toString();
    const userMsg: Message = {
      id: tempId,
      role: "user",
      text: inputValue,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    let activeChatId = currentChatId;

    try {
      // 1. Create chat if doesn't exist
      if (!activeChatId) {
          const newChat = await chatService.createChat(inputValue.substring(0, 30) + "...");
          activeChatId = newChat.id;
          
          // Mark this as a new chat to prevent useEffect from clearing messages
          isNewChatRef.current = newChat.id;
          
          setCurrentChatId(newChat.id);
          setChats(prev => [newChat, ...prev]);
      }
      
      // 2. Persist User Message
      await chatService.addMessage(activeChatId, 'user', userMsg.text);

      // 3. Generate Response
      const client = getGeminiModel();
      // ... (Gemini config logic same as before)
      const currentHistory = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      // MCP Mode Logic
      let toolsConfig = undefined;
      if (mode === "mcp" && mcpStatus === "connected") {
        try {
            const tools = await mcpClient.listTools();
            const geminiTools = tools.map((t: any) => ({
                name: t.name,
                description: t.description,
                parameters: t.inputSchema 
            }));
            
            if (geminiTools.length > 0) {
                 toolsConfig = [{ functionDeclarations: geminiTools }];
            }
        } catch (e) {
            console.error("Failed to fetch tools", e);
        }
      }

      const parts = [{ text: userMsg.text }];
      
      const generationConfig: any = {};
      if (toolsConfig) {
          generationConfig.tools = toolsConfig;
      }
      
      const systemInstruction = {
        parts: [{ text: `You are an expert OAP Application Assistant. You help users complete applications purely via chat.

**Your Goal:** simplify the application process.

**STRICT TOOL USAGE RULES:**
1. **NEVER** call \`save_student_details\` before collecting ALL mandatory fields returned by the config tool.
2. **ALWAYS** use \`start_new_application\` to begin.

**APPLICATION FLOW ALGORITHM (Follow Exactly):**

**PHASE 1: STARTUP**
- Listen for "Start application", "Apply to [OAP]" or similar.
- Call \`start_new_application(oap)\`. If OAP name is missing, ask for it first.
- This tool returns the **BASIC_INFO** / **STUDENT_INFO** section schema.

**PHASE 2: EXECUTION (For the returned section)**
1. **Analyze Fields**: Look at \`fieldData\` in the response.
2. **Ask Questions**:
   - Ask for data for all **mandatory** fields (where \`required: true\`).
   - Use the \`displayName\` and \`placeholder\` for friendly questions.
   - **WAIT** for user response. Do NOT fabricate data.
3. **Validate**: Ensure answers match field types (e.g., valid email pattern).
4. **Save**:
   - ONLY when you have all mandatory data for this section:
   - Call \`save_student_details\`.
   - Payload must be the OAP Detail object constructed from user answers. Keys must match \`fieldName\`.
   - Pass \`oapName\` and \`mode\`.

**PHASE 3: DYNAMIC APPLICATION FORM**
- Triggers AFTER Basic Info is saved.
1. **Initialize**: 
   - **DO NOT** call \`get_application_form_config\` immediately.
   - **USE** the \`nextFormConfig\` returned by the \`save_student_details\` tool.
   - If (and only if) that is missing, call \`get_application_form_config(oap, mode)\`.
2. **READ The Map**: 
   - Look at \`formDetails.section\` array (from \`nextFormConfig\` or tool result). **THIS IS THE SOURCE OF TRUTH.**
   - Sort sections by \`displayOrder\`.
3. **Execution Loop (Iterate through the sorted sections)**:
   - Identify the next target section (e.g., the first one, or the one after the last completed section).
   - **Fetch**: Call \`get_oap_section_details\` using \`sectionName\` from the list.
   - **Process**:
     - Ask questions for mandatory fields.
     - Validate inputs.
     - **Save**: 
       - Call \`save_application_progress(oapName, email, applicationId, sectionData, currentSectionName)\`.
       - **IMPORTANT**: \`currentSectionName\` MUST be the \`section\` KEY (e.g., "PROGRAM_INFO"), NOT the \`displayName\`.
       - **IMPORTANT**: Ensure \`applicationId\` is the REAL ID returned from previous steps, NOT a placeholder.
   - **Transition**:
     - The save tool returns \`nextSectionDetails\` automatically.
     - **IMMEDIATELY** use this data to start the next section questions.
     - **DO NOT** ask "What do you want to do?". 
     - Say: "Saved. Moving to [Next Section Name]..." and ask the first question.
     - REPEAT loop using the returned details.

**PHASE 4: STOP**
- If no more sections, congrats!

**Format**: Use Markdown tables. Be professional.` }]
      };

      let result = await client.models.generateContent({
          model: "gemini-2.5-flash", 
          systemInstruction,
          contents: [...currentHistory, { role: "user", parts }],
          config: generationConfig, 
      });

      let responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let functionCalls = result.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);

      while (functionCalls && functionCalls.length > 0) {
         const currentTurnParts = result.candidates[0].content.parts;
         const call = functionCalls[0].functionCall;
         console.log("Calling Tool:", call.name);
         
         let toolResultString = "";
         try {
             const mcpResult = await mcpClient.callTool(call.name, call.args) as any;
             toolResultString = JSON.stringify(mcpResult);
             if (mcpResult.content && Array.isArray(mcpResult.content) && mcpResult.content[0]?.text) {
                 toolResultString = mcpResult.content[0].text;
             }
         } catch (e: any) {
             toolResultString = `Error executing tool: ${e.message}`;
         }
         
         const newHistory = [
             ...currentHistory,
             { role: "user", parts },
             { role: "model", parts: currentTurnParts },
             { 
                 role: "function", 
                 parts: [{
                     functionResponse: {
                         name: call.name,
                         response: { name: call.name, content: toolResultString } 
                     }
                 }]
             }
         ];
         
         // Re-generate
         result = await client.models.generateContent({
             model: "gemini-2.5-flash",
             systemInstruction,
             contents: newHistory,
             config: generationConfig
         });
         
         responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
         functionCalls = result.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: responseText || "No response text",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      
      // 4. Persist AI Message
      await chatService.addMessage(activeChatId, 'model', aiMsg.text);

    } catch (error) {
      console.error("Chat Error:", error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: "model",
        text: "Sorry, I encountered an error processing your request.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950">
        {/* Sidebar */}
        <div className={cn(
            "fixed inset-y-0 left-0 z-50 transition-transform duration-300 transform md:relative md:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
           <Sidebar 
               chats={chats} 
               currentChatId={currentChatId} 
               onSelectChat={(id) => {
                   setCurrentChatId(id);
                   if (window.innerWidth < 768) setIsSidebarOpen(false);
               }}
               onNewChat={handleNewChat}
               onDeleteChat={handleDeleteChat}
               isOpen={isSidebarOpen}
           />
        </div>

        {/* Overlay for mobile */}
        {isSidebarOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full w-full max-w-7xl mx-auto"> 
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-border bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
            <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 hover:bg-zinc-100 rounded-lg">
                    <Menu size={20} />
                </button>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Bot size={24} />
                </div>
                <div>
                    <h1 className="text-xl font-bold">OAP Chatbot</h1>
                    <p className="text-sm text-muted-foreground">Powered by Gemini {mode === 'mcp' && '& MCP'}</p>
                </div>
            </div>

            <div className="flex items-center gap-4 bg-muted/50 p-1.5 rounded-lg border">
                <button
                    onClick={() => setMode("normal")}
                    className={cn(
                        "px-4 py-2 rounded-md text-sm font-medium transition-all",
                        mode === "normal" ? "bg-white shadow-sm text-black" : "text-muted-foreground hover:bg-white/50"
                    )}
                >
                    Normal
                </button>
                <button
                    onClick={() => setMode("mcp")}
                    className={cn(
                        "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                        mode === "mcp" ? "bg-white shadow-sm text-black" : "text-muted-foreground hover:bg-white/50"
                    )}
                >
                    <Plug size={16} />
                    MCP
                    {mode === 'mcp' && (
                        <span className={cn("w-2 h-2 rounded-full", 
                            mcpStatus === 'connected' ? "bg-green-500" : 
                            mcpStatus === 'connecting' ? "bg-yellow-500" : "bg-red-500"
                        )} />
                    )}
                </button>
            </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                    <Bot size={48} className="mb-4" />
                    <p>Start a conversation...</p>
                </div>
            )}
            
            {messages.map((msg) => (
            <div
                key={msg.id}
                className={cn(
                "flex w-full",
                msg.role === "user" ? "justify-end" : "justify-start"
                )}
            >
                <div
                className={cn(
                    "max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3.5 text-sm/6 shadow-sm prose dark:prose-invert max-w-none break-words",
                    msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none prose-p:text-white prose-headings:text-white prose-strong:text-white"
                    : "bg-white dark:bg-zinc-900 border text-foreground rounded-bl-none"
                )}
                >
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                        a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="underline font-medium hover:opacity-80 break-all" />,
                        table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50"><table {...props} className="w-full text-left text-xs" /></div>,
                        th: ({node, ...props}) => <th {...props} className="bg-zinc-100 dark:bg-zinc-800 p-2 font-semibold border-b border-zinc-200 dark:border-zinc-700" />,
                        td: ({node, ...props}) => <td {...props} className="p-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0" />,
                        ul: ({node, ...props}) => <ul {...props} className="list-disc pl-4 space-y-1 my-2" />,
                        ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-4 space-y-1 my-2" />
                    }}
                >
                    {msg.text}
                </ReactMarkdown>
                </div>
            </div>
            ))}
            
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-muted/50 rounded-2xl px-4 py-3 rounded-bl-none flex items-center gap-2">
                        <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white dark:bg-zinc-950">
            <div className="relative max-w-4xl mx-auto">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage();
                    }}
                    className="flex gap-2"
                >
                    <input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={mode === 'mcp' && mcpStatus !== 'connected' ? "Connecting to MCP..." : "Type your message..."}
                        disabled={isLoading || (mode === 'mcp' && mcpStatus !== 'connected')}
                        className="flex-1 rounded-xl border bg-background px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isLoading || (mode === 'mcp' && mcpStatus !== 'connected')}
                        className="bg-blue-600 text-white p-3.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </form>
                {mode === 'mcp' && mcpStatus === 'error' && (
                    <div className="absolute -top-8 left-0 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} />
                        Failed to connect to MCP server at {process.env.NEXT_PUBLIC_MCP_SERVER_URL}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
