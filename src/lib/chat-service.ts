const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export interface Chat {
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    createdAt: string;
}

export interface ChatDetail extends Chat {
    messages: Message[];
}

export const chatService = {
    async getChats(): Promise<Chat[]> {
        const res = await fetch(`${API_URL}/chats`);
        if (!res.ok) throw new Error('Failed to fetch chats');
        return res.json();
    },

    async getChat(id: string): Promise<ChatDetail> {
        const res = await fetch(`${API_URL}/chats/${id}`);
        if (!res.ok) throw new Error('Failed to fetch chat');
        return res.json();
    },

    async createChat(title?: string): Promise<Chat> {
        const res = await fetch(`${API_URL}/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error('Failed to create chat');
        return res.json();
    },

    async addMessage(chatId: string, role: string, content: string): Promise<Message> {
        const res = await fetch(`${API_URL}/chats/${chatId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, content }),
        });
        if (!res.ok) throw new Error('Failed to add message');
        return res.json();
    },

    async updateChatTitle(id: string, title: string): Promise<Chat> {
        // Assuming backend supports PATCH. If not, we can implement it or skip for now.
        // Based on controller, it is PATCH but I just added it.
        const res = await fetch(`${API_URL}/chats/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        if (!res.ok) throw new Error('Failed to update chat');
        return res.json();
    },

    async deleteChat(id: string): Promise<void> {
        const res = await fetch(`${API_URL}/chats/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete chat');
    }
};
