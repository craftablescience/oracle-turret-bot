// noinspection JSUnusedGlobalSymbols

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteraction, EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { OracleTurretClient } from '../../types/client';
import { Command } from '../../types/interaction';
import { LogLevelColor } from '../../utils/log';
import { getModChannel } from '../../utils/mod_channel';
import { PermissionLevel } from '../../utils/permissions';
import { formatUserRaw } from '../../utils/utils';

import * as log from '../../utils/log';
import * as persist from '../../utils/persist';

const Notify: Command = {
	permissionLevel: PermissionLevel.BAN_MEMBERS,

	data: new SlashCommandBuilder()
		.setName('notify')
		.setDescription('Send a message to every server with this bot.')
		.setDefaultMemberPermissions(PermissionLevel.BAN_MEMBERS)
		.addSubcommand(subcommand => subcommand
			.setName('false_report')
			.setDescription('Notify servers of a false report.')
			.addStringOption(option => option
				.setName('user_id')
				.setDescription('The ID of the user that has been falsely banned')
				.setRequired(true))
			.addStringOption(option => option
				.setName('details')
				.setDescription('Extra details that will be included with the false ban notification')
				.setMinLength(10)
				.setMaxLength(1000)
				.setRequired(true))),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', ephemeral: true });
		}

		switch (interaction.options.getSubcommand()) {
		case 'false_report': {
			const user_id = interaction.options.getString('user_id', true);
			const details = interaction.options.getString('details', true);

			const data = persist.data(interaction.guild.id);
			if (!data.seen_accounts.includes(user_id)) {
				return interaction.reply({ content: 'Unable to send notification: user ID has not been reported before!', ephemeral: true });
			}

			// We do a little white lie here so the interaction doesn't have to be deferred
			await interaction.reply({ content: 'Notifications sent!', ephemeral: true });

			const user = await interaction.client.users.fetch(user_id);

			const embed = new EmbedBuilder()
				.setColor(LogLevelColor.ERROR)
				.setTitle('False Report Notification')
				.addFields([
					{ name: 'Falsely Reported User', value: `${user} (${formatUserRaw(user)})` },
					{ name: 'Notification Origin', value: interaction.guild.name },
					{ name: 'Details', value: details },
				])
				.setTimestamp(Date.now());

			const quickUnbanButtonID = `${user_id}_quick_unban_btn`;
			const quickUnbanButton = new ButtonBuilder()
				.setCustomId(quickUnbanButtonID)
				.setLabel('Unban User')
				.setStyle(ButtonStyle.Success);

			(interaction.client as OracleTurretClient).callbacks.addButtonCallback(quickUnbanButtonID, async btnInteraction => {
				if (!btnInteraction.inGuild() || !btnInteraction.guild) {
					return btnInteraction.reply({ content: 'This button must be clicked in a guild.', ephemeral: true });
				}

				// Check bot has unban permission
				if (!btnInteraction.guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
					return btnInteraction.reply({ content: `Unable to unban ${user}: this bot does not have the \`Ban Members\` permission!`, ephemeral: true });
				}

				// Check caller has ban permission
				if (!persist.data(btnInteraction.guild.id).allow_bans_from_anyone) {
					const callingMember = await btnInteraction.guild.members.fetch(btnInteraction.user).catch(() => null);
					if (!callingMember?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
						return btnInteraction.reply({ content: `Unable to unban ${user}: you are missing the \`Ban Members\` permission!`, ephemeral: true });
					}
				}

				// Check guild already banned member
				const guildBans = await btnInteraction.guild.bans.fetch().catch(() => null);
				if (guildBans === null || guildBans.find(guildBan => guildBan.user.id === user.id) === undefined) {
					return btnInteraction.reply({ content: 'User is not banned in this server!', ephemeral: true });
				}

				await btnInteraction.guild.bans.remove(user);
				return btnInteraction.reply({ content: `${btnInteraction.user} unbanned user ${user}!` });
			});

			const actionRow = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(quickUnbanButton);

			for (const oaGuild of (await interaction.client.guilds.fetch()).values()) {
				const guild = await oaGuild.fetch();
				const guildData = persist.data(guild.id);
				if (!guildData.first_time_setup)
					continue;

				const logMissingPerms = async () => await log.error(interaction.client, `Unable to send false ban notification to guild "${guild.name}" (${guild.id}): check channel permissions!`);

				const modChannel = await getModChannel(interaction.client, guild);
				if (!modChannel) {
					await logMissingPerms();
					continue;
				}
				await modChannel.send({ embeds: [embed], components: [actionRow] }).catch(() => logMissingPerms());

				guildData.seen_accounts = guildData.seen_accounts.filter(id => id !== interaction.options.getString('user_id', true));
				persist.saveData(guild.id);
			}
		}
		}
	}
};
export default Notify;
