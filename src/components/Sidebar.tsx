import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Chat } from "@/lib/chat-service";
import { cn } from "@/lib/utils";

interface SidebarProps {
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  isOpen: boolean; // Add responsive prop later if needed
}

export function Sidebar({ chats, currentChatId, onSelectChat, onNewChat, onDeleteChat }: SidebarProps) {
  return (
    <div className="w-64 border-r border-border h-full bg-zinc-50 dark:bg-zinc-900 flex flex-col">
      <div className="p-4">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 bg-white dark:bg-zinc-800 border hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors p-3 rounded-xl text-sm font-medium shadow-sm"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 custom-scrollbar">
        {chats.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">
            No saved chats yet
          </div>
        )}
        
        {chats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={cn(
              "group flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-colors",
              currentChatId === chat.id
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
          >
            <MessageSquare size={16} />
            <div className="flex-1 truncate">
              {chat.title || "New Chat"}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded transition-all"
            >
                <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
