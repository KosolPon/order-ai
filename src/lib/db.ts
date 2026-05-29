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

export interface CustomRole {
	id: string;
	name: string;
	prompt: string;
	icon: string;
	desc: string;
	keywords: string;
	createdAt: number;
}

class OrderAIDatabase extends Dexie {
	canvasFiles!: Table<CanvasFile, [string, string]>; // Composite key: [chatId, name]
	aiMemories!: Table<AIMemory, number>;
	conversations!: Table<Conversation, string>;
	projects!: Table<Project, string>;
	customRoles!: Table<CustomRole, string>;

	constructor() {
		super('OrderAIDatabase');
		this.version(2).stores({
			// Primary key is [chatId+name] to ensure unique filenames per chat
			canvasFiles: '[chatId+name], chatId, name, type, updatedAt',
			aiMemories: '++id, chatId, projectId, createdAt',
			conversations: 'id, projectId, createdAt',
			projects: 'id, createdAt'
		});
		this.version(3).stores({
			canvasFiles: '[chatId+name], chatId, name, type, updatedAt',
			aiMemories: '++id, chatId, projectId, createdAt',
			conversations: 'id, projectId, createdAt',
			projects: 'id, createdAt',
			customRoles: 'id, createdAt'
		});
		this.version(4).stores({
			canvasFiles: '[chatId+name], chatId, name, type, updatedAt',
			aiMemories: '++id, chatId, projectId, createdAt',
			conversations: 'id, projectId, createdAt',
			projects: 'id, createdAt',
			customRoles: 'id, createdAt'
		});
	}
}

export const db = new OrderAIDatabase();
