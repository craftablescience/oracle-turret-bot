import { AutocompleteInteraction, CommandInteraction, InteractionResponse, Message, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { Callbacks } from './client';

export interface CommandBase {
	permissionLevel: bigint,
	canBeExecutedWithoutPriorGuildSetup?: boolean | undefined,
	data: unknown,
	execute(interaction: CommandInteraction, callbacks?: Callbacks): Promise<void | InteractionResponse<boolean> | Message<boolean>>,
	getAutocompleteOptions?(interaction: AutocompleteInteraction): { name: string, value: string }[],
}

export interface Command extends CommandBase {
	data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'> | SlashCommandSubcommandsOnlyBuilder,
}
