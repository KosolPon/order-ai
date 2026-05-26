import Dexie, { type Table } from 'dexie';

export interface CanvasFile {
	chatId: string;
	name: string;
	type: 'html' | 'markdown' | 'code' | 'text';
	content: string;
	updatedAt: number;
}

export interface AIMemory {
	id?: number;
	chatId?: string;
	projectId?: string;
	content: string;
	vector?: number[];
	createdAt: number;
}

class OrderAIDatabase extends Dexie {
	canvasFiles!: Table<CanvasFile, [string, string]>; // Composite key: [chatId, name]
	aiMemories!: Table<AIMemory, number>;

	constructor() {
		super('OrderAIDatabase');
		this.version(1).stores({
			// Primary key is [chatId+name] to ensure unique filenames per chat
			canvasFiles: '[chatId+name], chatId, name, type, updatedAt',
			aiMemories: '++id, chatId, projectId, createdAt'
		});
	}
}

export const db = new OrderAIDatabase();
