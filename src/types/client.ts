import { ButtonInteraction, Client, ClientOptions, Collection, InteractionResponse, Message, ModalSubmitInteraction } from 'discord.js';
import { CommandBase } from './interaction';

type ButtonCallback = (interaction: ButtonInteraction) => Promise<void | Message | InteractionResponse>;
type ModalCallback = (interaction: ModalSubmitInteraction) => void;

export class Callbacks {
	#buttonCallbacks: Map<string, ButtonCallback>;
	#modalCallbacks: Map<string, ModalCallback>;

	constructor() {
		this.#buttonCallbacks = new Map<string, ButtonCallback>();
		this.#modalCallbacks = new Map<string, ModalCallback>();
	}

	addButtonCallback(buttonID: string, callback: ButtonCallback) {
		if (!this.#buttonCallbacks.has(buttonID)) {
			this.#buttonCallbacks.set(buttonID, callback);
		}
	}

	addModalCallback(modalID: string, callback: ModalCallback) {
		if (!this.#modalCallbacks.has(modalID)) {
			this.#modalCallbacks.set(modalID, callback);
		}
	}

	async runButtonCallback(buttonID: string, interaction: ButtonInteraction) {
		return this.#buttonCallbacks.get(buttonID)?.(interaction);
	}

	async runModalCallback(modalID: string, interaction: ModalSubmitInteraction) {
		return this.#modalCallbacks.get(modalID)?.(interaction);
	}

	removeButtonCallback(buttonID: string) {
		this.#buttonCallbacks.delete(buttonID);
	}

	removeModalCallback(modalID: string) {
		this.#modalCallbacks.delete(modalID);
	}
}

export class OracleTurretClient extends Client {
	commands: Collection<string, CommandBase>;
	callbacks: Callbacks;

	constructor(options: ClientOptions) {
		super(options);
		this.commands = new Collection<string, CommandBase>();
		this.callbacks = new Callbacks();
	}
}
