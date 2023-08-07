import { ChannelType, CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/interaction';
import { PermissionLevel } from '../../utils/permissions';
import { updateCommandsForGuild } from '../../utils/update_commands';

import * as persist from '../../utils/persist';

const Setup: Command = {
	permissionLevel: PermissionLevel.BAN_MEMBERS,
	canBeExecutedWithoutPriorGuildSetup: true,

	data: new SlashCommandBuilder()
		.setName('setup')
		.setDescription('Set necessary configuration options for this guild.')
		.setDefaultMemberPermissions(PermissionLevel.BAN_MEMBERS)
		.addChannelOption(option => option
			.setName('mod_channel')
			.setDescription('The channel where user reports are sent. Please make sure moderators have it visible and unmuted')
			.addChannelTypes(ChannelType.GuildText)
			.setRequired(true)),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', ephemeral: true });
		}

		await interaction.deferReply({ ephemeral: true });

		const data = persist.data(interaction.guild.id);

		const firstRun = !data.first_time_setup;

		data.mod_channel = interaction.options.getChannel('mod_channel', true).id;
		data.first_time_setup = true;
		persist.saveData(interaction.guild.id);

		await updateCommandsForGuild(interaction.guild.id);

		if (firstRun) {
			return interaction.editReply('Your guild is set up! All commands are now available.');
		}
		return interaction.editReply('Configuration has been updated!');
	}
};
export default Setup;
