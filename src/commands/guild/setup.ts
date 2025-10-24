// noinspection JSUnusedGlobalSymbols

import { ChannelType, CommandInteraction, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
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
			.setRequired(true))
		.addBooleanOption(option => option
			.setName('allow_bans_from_anyone')
			.setDescription('Allow members without the "Ban User" permission to interact with the ban report system')),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', ephemeral: true });
		}

		await interaction.deferReply({ ephemeral: true });

		const modChannel = interaction.options.getChannel('mod_channel', true, [ChannelType.GuildText]);
		if (!modChannel.permissionsFor(interaction.client.user)?.has(PermissionsBitField.Flags.ViewChannel) ||
			!modChannel.permissionsFor(interaction.client.user)?.has(PermissionsBitField.Flags.SendMessages)) {
			return interaction.editReply(`This bot cannot send messages in the channel ${modChannel}! Please give this bot the \`View Channel\` and \`Send Messages\` permissions in ${modChannel}, or choose a different channel.`);
		}

		const data = persist.data(interaction.guild.id);
		const firstRun = !data.first_time_setup;
		data.mod_channel = modChannel.id;
		data.first_time_setup = true;
		data.allow_bans_from_anyone = !!interaction.options.getBoolean('allow_bans_from_anyone');
		persist.saveData(interaction.guild.id);

		await updateCommandsForGuild(interaction.guild.id);

		if (firstRun) {
			return interaction.editReply('Your server is set up!\n\nBefore you go, please consider giving this bot the `Ban Members` permission: it allows the "Ban User" button on ban reports to work, and allows the bot to check if a reported user is already banned before sending a ban report in this server. This permission is not and will never be required for core functionality.');
		}
		return interaction.editReply('Configuration has been updated!');
	}
};
export default Setup;
