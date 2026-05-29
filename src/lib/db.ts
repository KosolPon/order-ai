import Dexie, { type Table } from 'dexie';
import type { Conversation, Project } from './types';

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
	conversations!: Table<Conversation, string>;
	projects!: Table<Project, string>;

	constructor() {
		super('OrderAIDatabase');
		this.version(2).stores({
			// Primary key is [chatId+name] to ensure unique filenames per chat
			canvasFiles: '[chatId+name], chatId, name, type, updatedAt',
			aiMemories: '++id, chatId, projectId, createdAt',
			conversations: 'id, projectId, createdAt',
			projects: 'id, createdAt'
		});
	}
}

export const db = new OrderAIDatabase();
