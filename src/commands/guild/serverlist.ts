// noinspection JSUnusedGlobalSymbols

import { CommandInteraction, EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/interaction';
import { LogLevelColor } from '../../utils/log';
import { getModChannel } from '../../utils/mod_channel';
import { PermissionLevel } from '../../utils/permissions';

import * as persist from '../../utils/persist';

const ServerList: Command = {
	permissionLevel: PermissionLevel.BAN_MEMBERS,

	data: new SlashCommandBuilder()
		.setName('serverlist')
		.setDescription('View all servers that have this bot installed.')
		.setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

	async execute(interaction: CommandInteraction) {
		let list = '';

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const guilds = await interaction.client.guilds.fetch();
		for (const oaGuild of guilds.values()) {
			const data = persist.data(oaGuild.id);
			const guild = await oaGuild.fetch();
			const modChannel = await getModChannel(interaction.client, guild);
			list += `\n- \`${!data.first_time_setup ? '—' : (modChannel ? '✔' : '✖')}\` ${guild.name} (\`${guild.id}\`): ${(await guild.fetch()).memberCount} members`;
		}
		list = list.substring(1);

		const embed = new EmbedBuilder()
			.setTitle('Server List')
			.setDescription(list)
			.setColor(LogLevelColor.INFO)
			.setTimestamp();

		return interaction.editReply({ embeds: [embed] });
	}
};
export default ServerList;
