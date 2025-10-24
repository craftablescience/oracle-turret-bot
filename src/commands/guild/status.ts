// noinspection JSUnusedGlobalSymbols

import { CommandInteraction, EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/interaction';
import { LogLevelColor } from '../../utils/log';
import { getModChannel } from '../../utils/mod_channel';
import { PermissionLevel } from '../../utils/permissions';

const Status: Command = {
	permissionLevel: PermissionLevel.BAN_MEMBERS,

	data: new SlashCommandBuilder()
		.setName('status')
		.setDescription('Check the status of the current server.')
		.setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', ephemeral: true });
		}

		const modChannel = await getModChannel(interaction.client, interaction.guild);

		// We're assuming that the setup command has ran, otherwise we wouldn't get called
		const embed = new EmbedBuilder()
			.setTitle('Status')
			.setColor(LogLevelColor.INFO)
			.addFields(
				{ name: 'Required:', value: `- Moderation channel is accessible: ${modChannel ? '✅' : '❌'}` },
				{ name: 'Optional:', value: `- Has \`Ban Members\` permission: ${interaction.guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers) ? '✅' : '❌'}` })
			.setTimestamp();

		return interaction.reply({ embeds: [embed], ephemeral: true });
	}
};
export default Status;
