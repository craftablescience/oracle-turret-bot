// noinspection JSUnusedGlobalSymbols

import { ButtonBuilder, ButtonStyle, CommandInteraction, ContainerBuilder, MessageFlags, PermissionsBitField, SeparatorSpacingSize, SlashCommandBuilder } from 'discord.js';
import { OracleTurretClient } from '../../types/client';
import { Command } from '../../types/interaction';
import { LogLevelColor } from '../../utils/log';
import { getModChannel } from '../../utils/mod_channel';
import { PermissionLevel } from '../../utils/permissions';
import { formatUserRaw } from '../../utils/utils';

import * as config from '../../config.json';
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
				.setRequired(true)))
		.addSubcommand(subcommand => subcommand
			.setName('broadcast')
			.setDescription('Send a message to every server with this bot. This command only works for a select group of people.')
			.addStringOption(option => option
				.setName('message')
				.setDescription('The contents of the broadcasted message')
				.setRequired(true))),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', flags: MessageFlags.Ephemeral });
		}

		switch (interaction.options.getSubcommand()) {
		case 'false_report': {
			const user_id = interaction.options.getString('user_id', true);
			const details = interaction.options.getString('details', true);

			if (!config.whitelists.guilds.includes(interaction.guild.id)) {
				return interaction.reply({ content: 'Unable to send false report: guild is not whitelisted!', flags: MessageFlags.Ephemeral });
			}

			const data = persist.data(interaction.guild.id);
			if (!data.seen_accounts.includes(user_id)) {
				return interaction.reply({ content: 'Unable to send notification: user ID has not been reported before!', flags: MessageFlags.Ephemeral });
			}

			// We do a little white lie here so the interaction doesn't have to be deferred
			await interaction.reply({ content: 'Notifications sent!', flags: MessageFlags.Ephemeral });

			const user = await interaction.client.users.fetch(user_id);

			const falseReportContainer = new ContainerBuilder()
				.setAccentColor(log.colorToNumber(LogLevelColor.ERROR))
				.addTextDisplayComponents(
					textDisplay => textDisplay
						.setContent('# False Report Notification'),
				)
				.addSeparatorComponents(
					separator => separator
						.setSpacing(SeparatorSpacingSize.Large),
				)
				.addTextDisplayComponents(
					textDisplay => textDisplay
						.setContent(`### Falsely Reported User\n${user} (${formatUserRaw(user)}), ID \`${user.id}\``),
					textDisplay => textDisplay
						.setContent(`### Notification Origin\n${interaction.guild?.name ?? 'Unknown Server'} - ${interaction.user} (${formatUserRaw(interaction.user)})`),
					textDisplay => textDisplay
						.setContent(`### Details\n${details}`),
				);

			const quickUnbanButtonID = `${user_id}_quick_unban_btn`;
			const quickUnbanButton = new ButtonBuilder()
				.setCustomId(quickUnbanButtonID)
				.setLabel('Unban User')
				.setStyle(ButtonStyle.Success);

			(interaction.client as OracleTurretClient).callbacks.addButtonCallback(quickUnbanButtonID, async btnInteraction => {
				if (!btnInteraction.inGuild() || !btnInteraction.guild) {
					return btnInteraction.reply({ content: 'This button must be clicked in a guild.', flags: MessageFlags.Ephemeral });
				}

				// Check bot has unban permission
				if (!btnInteraction.guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
					return btnInteraction.reply({ content: `Unable to unban ${user}: this bot does not have the \`Ban Members\` permission!`, flags: MessageFlags.Ephemeral });
				}

				// Check caller has ban permission
				if (!persist.data(btnInteraction.guild.id).allow_bans_from_anyone) {
					const callingMember = await btnInteraction.guild.members.fetch(btnInteraction.user).catch(() => null);
					if (!callingMember?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
						return btnInteraction.reply({ content: `Unable to unban ${user}: you are missing the \`Ban Members\` permission!`, flags: MessageFlags.Ephemeral });
					}
				}

				// Check guild already banned member
				const guildBans = await btnInteraction.guild.bans.fetch().catch(() => null);
				if (guildBans === null || guildBans.find(guildBan => guildBan.user.id === user.id) === undefined) {
					return btnInteraction.reply({ content: 'User is not banned in this server!', flags: MessageFlags.Ephemeral });
				}

				await btnInteraction.guild.bans.remove(user);
				return btnInteraction.reply({ content: `${btnInteraction.user} unbanned user ${user}!` });
			});

			falseReportContainer
				.addSeparatorComponents(
					separator => separator
						.setDivider(false)
						.setSpacing(SeparatorSpacingSize.Small)
				)
				.addActionRowComponents(
					actionRow => actionRow
						.addComponents(quickUnbanButton),
				);

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
				await modChannel.send({ components: [falseReportContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => logMissingPerms());

				guildData.seen_accounts = guildData.seen_accounts.filter(id => id !== interaction.options.getString('user_id', true));
				persist.saveData(guild.id);
			}
			break;
		}
		case 'broadcast': {
			const message = interaction.options.getString('message', true);

			if (!config.whitelists.notify_broadcast_users.includes(interaction.user.id)) {
				return interaction.reply({ content: 'Unable to broadcast message: user is not whitelisted!', flags: MessageFlags.Ephemeral });
			}

			// We do a little white lie here so the interaction doesn't have to be deferred
			await interaction.reply({ content: 'Message broadcasted!', flags: MessageFlags.Ephemeral });

			const broadcastContainer = new ContainerBuilder()
				.setAccentColor(log.colorToNumber(LogLevelColor.WARNING))
				.addTextDisplayComponents(
					textDisplay => textDisplay
						.setContent('# Broadcasted Message'),
				)
				.addSeparatorComponents(
					separator => separator
						.setSpacing(SeparatorSpacingSize.Large),
				)
				.addTextDisplayComponents(
					textDisplay => textDisplay
						.setContent(`> ${message}\n  — ${interaction.user} (${formatUserRaw(interaction.user)})`),
				);

			for (const oaGuild of (await interaction.client.guilds.fetch()).values()) {
				const guild = await oaGuild.fetch();
				const guildData = persist.data(guild.id);
				if (!guildData.first_time_setup)
					continue;

				const logMissingPerms = async () => await log.error(interaction.client, `Unable to send broadcast message to guild "${guild.name}" (${guild.id}): check channel permissions!`);

				const modChannel = await getModChannel(interaction.client, guild);
				if (!modChannel) {
					await logMissingPerms();
					continue;
				}
				await modChannel.send({ components: [broadcastContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => logMissingPerms());
			}

			break;
		}
		}
	}
};
export default Notify;
