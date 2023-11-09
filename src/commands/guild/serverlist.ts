import { CommandInteraction, EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/interaction';
import { LogLevelColor } from '../../utils/log';
import { PermissionLevel } from '../../utils/permissions';

const ServerList: Command = {
	permissionLevel: PermissionLevel.BAN_MEMBERS,

	data: new SlashCommandBuilder()
		.setName('serverlist')
		.setDescription('View all servers that have this bot installed.')
		.setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

	async execute(interaction: CommandInteraction) {
		let list = '';

		await interaction.deferReply({ ephemeral: true });

		const guilds = await interaction.client.guilds.fetch();
		for (const guild of guilds.values()) {
			list += '\n' + `- ${guild.name} (\`${guild.id}\`): ${(await guild.fetch()).memberCount} members`;
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
