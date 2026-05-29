import { db, type CustomRole } from './db';
import { liveQuery } from 'dexie';
import { ROLE_PROMPTS, type AgentRole } from './agents';

class RoleStore {
	customRoles = $state<CustomRole[]>([]);
	isLoaded = $state(false);

	constructor() {
		if (typeof window !== 'undefined') {
			liveQuery(() => db.customRoles.toArray()).subscribe((roles) => {
				this.customRoles = roles || [];
				this.isLoaded = true;
			});
		}
	}

	get allRoles() {
		const staticRoles = Object.entries(ROLE_PROMPTS).map(([id, role]) => ({
			id,
			...role,
			isCustom: false,
			keywords: ''
		}));
		const dynamicRoles = this.customRoles.map((role) => ({
			id: role.id,
			name: role.name,
			prompt: role.prompt,
			icon: role.icon,
			desc: role.desc,
			keywords: role.keywords,
			isCustom: true
		}));
		return [...staticRoles, ...dynamicRoles];
	}

	getRole(id: string) {
		const staticRole = ROLE_PROMPTS[id as AgentRole];
		if (staticRole) return staticRole;
		const custom = this.customRoles.find((r) => r.id === id);
		if (custom) {
			return {
				name: custom.name,
				prompt: custom.prompt,
				icon: custom.icon,
				desc: custom.desc
			};
		}
		return null;
	}
}

export const roleStore = new RoleStore();
