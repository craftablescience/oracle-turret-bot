import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/interaction';
import { PermissionLevel } from '../../utils/permissions';

import * as persist from '../../utils/persist';

const Request: Command = {
	permissionLevel: PermissionLevel.ADMINISTRATOR,

	data: new SlashCommandBuilder()
		.setName('request')
		.setDescription('Request all stored data relating to this guild.')
		.setDefaultMemberPermissions(PermissionLevel.ADMINISTRATOR)
		.addSubcommand(subcommand => subcommand
			.setName('db')
			.setDescription('Request this guild\'s database JSON file')),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', ephemeral: true });
		}

		switch (interaction.options.getSubcommand()) {
		case 'db': {
			return interaction.reply({ content: 'Full guild database file:', files: [{ attachment: persist.getDataFilepath(interaction.guild.id) }] });
		}
		}
	}
};
export default Request;
