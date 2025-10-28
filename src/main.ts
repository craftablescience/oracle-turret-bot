// noinspection JSIgnoredPromiseFromCall

import fs from 'fs';
import { ActionRowBuilder, ActivityType, AttachmentBuilder, ButtonBuilder, ButtonStyle, Collection, ContainerBuilder, FileUploadBuilder, GuildMember, IntentsBitField, LabelBuilder, MediaGalleryBuilder, MessageFlags, ModalBuilder, PermissionsBitField, SeparatorSpacingSize, TextDisplayBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Callbacks, OracleTurretClient } from './types/client';
import { Command } from './types/interaction';
import { LogLevelColor } from './utils/log';
import { getModChannel } from './utils/mod_channel';
import { hasPermissionLevel } from './utils/permissions';
import { updateCommands, updateCommandsForGuild } from './utils/update_commands';
import { formatUserRaw } from './utils/utils';
import fetch from 'node-fetch';

import * as config from './config.json';
import * as log from './utils/log';
import * as persist from './utils/persist';

// Make console output better
import consoleStamp from 'console-stamp';
consoleStamp(console);

async function main() {
	// You need a token, duh
	if (!config.token) {
		log.writeToLog('Error: no token found in config.json!', true);
		return;
	}

	const date = new Date();
	log.writeToLog(`--- BOT START AT ${date.toDateString()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ---`, true);

	// Create client
	const client = new OracleTurretClient({
		intents: new IntentsBitField([
			IntentsBitField.Flags.Guilds,
			IntentsBitField.Flags.GuildModeration,
		])
	});

	// Register commands
	client.commands = new Collection();
	for (const file of fs.readdirSync('./build/commands/global').filter(file => file.endsWith('.js'))) {
		const command: Command = (await import(`./commands/global/${file}`)).default;
		client.commands.set(command.data.name, command);
	}
	for (const file of fs.readdirSync('./build/commands/guild').filter(file => file.endsWith('.js'))) {
		const command: Command = (await import(`./commands/guild/${file}`)).default;
		client.commands.set(command.data.name, command);
	}

	// Add callback holders
	client.callbacks = new Callbacks();

	// Run this when the client is ready
	client.on('clientReady', async () => {
		if (!client.user) {
			log.writeToLog('Client user is missing? Very strange, investigate!', true);
			return;
		}

		const statusSetter = () => {
			const guildCount = client.application?.approximateGuildCount ?? client.guilds.cache.size;
			client.user?.setActivity(`${guildCount} servers`, { type: ActivityType.Listening });
		};
		statusSetter();
		setInterval(statusSetter, 120e3);

		log.writeToLog(`Logged in as ${client.user.tag}`, true);
	});

	// Listen for errors
	client.on('error', async error => {
		await log.error(client, error);
	});

	// Listen for joined guilds
	client.on('guildCreate', async guild => {
		await updateCommandsForGuild(guild.id);

		log.writeToLog(`Joined guild ${guild.id}`, true);
	});

	// Listen for left guilds
	client.on('guildDelete', async guild => {
		log.writeToLog(`Left guild ${guild.id}`, true);
	});

	// Listen for commands
	client.on('interactionCreate', async interaction => {
		if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
			const command = client.commands?.get(interaction.commandName);
			if (!command) return;

			// Check if the user has the required permission level
			// This is a backup to Discord's own permissions stuff in case that breaks
			if (!interaction.channel?.isDMBased() && interaction.guild) {
				if (!persist.data(interaction.guild.id).first_time_setup && !command.canBeExecutedWithoutPriorGuildSetup) {
					if (interaction.deferred) {
						await interaction.followUp('Command could not be executed! Please ask a server administrator to run </setup:0>.');
						return;
					} else {
						await interaction.reply('Command could not be executed! Please ask a server administrator to run </setup:0>.');
						return;
					}
				}

				if (!hasPermissionLevel(interaction.member as GuildMember, command.permissionLevel)) {
					if (interaction.deferred) {
						await interaction.followUp('You do not have permission to execute this command!');
						return;
					} else {
						await interaction.reply({ content: 'You do not have permission to execute this command!', ephemeral: true });
						return;
					}
				}
			}

			try {
				await command.execute(interaction, client.callbacks);
			} catch (err) {
				await log.error(client, err as Error, interaction.guild?.id);
				if (interaction.deferred) {
					await interaction.followUp(`There was an error while executing this command: ${err}`);
				} else {
					await interaction.reply(`There was an error while executing this command: ${err}`);
				}
				return;
			}
		} else if (interaction.isButton()) {
			if (interaction.message.interactionMetadata && interaction.user !== interaction.message.interactionMetadata.user) {
				await interaction.reply({ content: `You cannot touch someone else's buttons! These buttons are owned by ${interaction.message.interactionMetadata.user}`, ephemeral: true });
				return;
			}

			try {
				if (interaction.isButton()) {
					await client.callbacks.runButtonCallback(interaction.customId, interaction);
				}
			} catch (err) {
				await log.error(client, err as Error, interaction.guild?.id);
				if (interaction.deferred) {
					await interaction.followUp(`There was an error while pressing this button: ${err}`);
				} else {
					await interaction.reply(`There was an error while pressing this button: ${err}`);
				}
				return;
			}
		} else if (interaction.isModalSubmit()) {
			try {
				await client.callbacks.runModalCallback(interaction.customId, interaction);
			} catch (err) {
				await log.error(client, err as Error, interaction.guild?.id);
				if (interaction.deferred) {
					await interaction.followUp(`There was an error while submitting this modal: ${err}`);
				} else {
					await interaction.reply(`There was an error while submitting this modal: ${err}`);
				}
				return;
			}
		} else if (interaction.isAutocomplete()) {
			const command = client.commands?.get(interaction.commandName);
			if (!command) {
				await interaction.respond([]);
				return;
			}

			let options = (command as Command).getAutocompleteOptions?.(interaction);
			if (!options) {
				await interaction.respond([]);
				return;
			}

			// Only display options that correspond to what has been typed already
			options = options.filter(option => option.name.startsWith(interaction.options.getFocused()));

			// Max number of choices is 25
			if (options.length > 25) {
				await interaction.respond(options.slice(0, 25));
			} else {
				await interaction.respond(options);
			}
		}
	});

	// Listen for banned members
	client.on('guildBanAdd', async ban => {
		if (!config.whitelists.guilds.includes(ban.guild.id)) {
			return;
		}

		const data = persist.data(ban.guild.id);
		if (data.seen_accounts.includes(ban.user.id)) {
			return;
		}

		const modChannel = await getModChannel(ban.client, ban.guild);
		if (!modChannel) {
			return;
		}

		const reportButtonID = `${ban.user.id}_${ban.guild.id}_report_btn`;
		const reportButton = new ButtonBuilder()
			.setCustomId(reportButtonID)
			.setLabel('Report')
			.setStyle(ButtonStyle.Danger);

		const ignoreButtonID = `${ban.user.id}_${ban.guild.id}_ignore_btn`;
		const ignoreButton = new ButtonBuilder()
			.setCustomId(ignoreButtonID)
			.setLabel('Ignore')
			.setStyle(ButtonStyle.Secondary);

		const banClient = ban.client as OracleTurretClient;

		banClient.callbacks.addButtonCallback(ignoreButtonID, async btnInteraction => {
			if (!btnInteraction.inGuild() || !btnInteraction.guild) {
				return btnInteraction.reply({ content: 'This button must be clicked in a guild.', flags: MessageFlags.Ephemeral });
			}
			if (btnInteraction.message.deletable) {
				return btnInteraction.message.delete();
			}
			return btnInteraction.reply({ 'content': 'Ignored ban.', flags: MessageFlags.Ephemeral });
		});

		banClient.callbacks.addButtonCallback(reportButtonID, async btnInteraction => {
			if (!btnInteraction.inGuild() || !btnInteraction.guild) {
				return btnInteraction.reply({ content: 'This button must be clicked in a guild.', flags: MessageFlags.Ephemeral });
			}

			const banRationale = new TextInputBuilder()
				.setCustomId('ban_rationale')
				.setStyle(TextInputStyle.Short);

			const banRationaleLabel = new LabelBuilder()
				.setLabel('Why was this user banned?')
				.setTextInputComponent(banRationale);

			const banEvidenceText = new TextInputBuilder()
				.setCustomId('ban_evidence_text')
				.setStyle(TextInputStyle.Paragraph);

			const banEvidenceTextLabel = new LabelBuilder()
				.setLabel('Evidence of misconduct:')
				.setTextInputComponent(banEvidenceText);

			const banEvidenceAttachments = new FileUploadBuilder()
				.setCustomId('ban_evidence_attachments')
				.setRequired(false)
				.setMinValues(0)
				.setMaxValues(10);

			const banEvidenceAttachmentsLabel = new LabelBuilder()
				.setLabel('Optional attachments:')
				.setFileUploadComponent(banEvidenceAttachments);

			const modal = new ModalBuilder()
				.setCustomId(reportButtonID + '_modal')
				.setTitle('Report User')
				.addLabelComponents(banRationaleLabel, banEvidenceTextLabel, banEvidenceAttachmentsLabel);

			return btnInteraction.showModal(modal);
		});
		banClient.callbacks.addModalCallback(reportButtonID + '_modal', async modalInteraction => {
			const banRationale = modalInteraction.fields.getTextInputValue('ban_rationale');
			let banEvidenceText = modalInteraction.fields.getTextInputValue('ban_evidence_text');
			const banEvidenceAttachments = modalInteraction.fields.getUploadedFiles('ban_evidence_attachments');

			if (banEvidenceText.length === 0) {
				banEvidenceText = 'No evidence provided.';
			}

			const submittedMessage = new TextDisplayBuilder()
				.setContent('Submitted ban report to network!');

			const reportMessageContainer = new ContainerBuilder()
				.setAccentColor(log.colorToNumber(LogLevelColor.WARNING))
				.addTextDisplayComponents(
					textDisplay => textDisplay
						.setContent('# New Ban Report'),
				)
				.addSeparatorComponents(
					separator => separator
						.setSpacing(SeparatorSpacingSize.Large),
				)
				.addTextDisplayComponents(
					textDisplay => textDisplay
						.setContent(`### Banned User\n${ban.user} (${formatUserRaw(ban.user)})\nID \`${ban.user.id}\``),
					textDisplay => textDisplay
						.setContent(`### Account Age\n<t:${(ban.user.createdTimestamp / 1000.0).toFixed()}:R>`),
					textDisplay => textDisplay
						.setContent(`### Originating Server\n${ban.guild.name}\nID \`${ban.guild.id}\``),
					textDisplay => textDisplay
						.setContent(`### Ban Reporter\n${modalInteraction.user} (${formatUserRaw(modalInteraction.user)})\nID \`${modalInteraction.user.id}\``),
					textDisplay => textDisplay
						.setContent(`### Why was this user banned?\n${banRationale}`),
					textDisplay => textDisplay
						.setContent(`### Evidence of Misconduct\n${banEvidenceText}`),
				);

			const files: AttachmentBuilder[] = [];
			if (banEvidenceAttachments) {
				const mediaGallery = new MediaGalleryBuilder();
				for (const [, attachment] of banEvidenceAttachments.entries()) {
					const currentAttachment = new AttachmentBuilder(await (await fetch(attachment.url)).buffer())
						.setName(attachment.name)
						.setSpoiler(true);
					mediaGallery.spliceItems(
						0,
						0,
						item => item
							.setSpoiler(true)
							.setURL(`attachment://${currentAttachment.name}`),
					);
					files.push(currentAttachment);
				}
				reportMessageContainer.addMediaGalleryComponents(mediaGallery);
			}

			const quickBanButtonID = `${ban.user.id}_quick_ban_btn`;
			const quickBanButton = new ButtonBuilder()
				.setCustomId(quickBanButtonID)
				.setLabel('Ban User')
				.setStyle(ButtonStyle.Danger);

			reportMessageContainer
				.addSeparatorComponents(
					separator => separator
						.setDivider(false)
						.setSpacing(SeparatorSpacingSize.Small)
				)
				.addActionRowComponents(
					actionRow => actionRow
						.addComponents(quickBanButton)
				);

			banClient.callbacks.addButtonCallback(quickBanButtonID, async btnInteraction => {
				if (!btnInteraction.inGuild() || !btnInteraction.guild) {
					return btnInteraction.reply({ content: 'This button must be clicked in a guild.', flags: MessageFlags.Ephemeral });
				}

				// Sanity check
				if (ban.user.id === btnInteraction.guild.members.me?.id) {
					return btnInteraction.reply({ content: 'Unable to ban myself!', flags: MessageFlags.Ephemeral });
				}

				// Check bot has ban permission
				if (!btnInteraction.guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
					return btnInteraction.reply({ content: `Unable to ban ${ban.user}: this bot does not have the \`Ban Members\` permission!`, flags: MessageFlags.Ephemeral });
				}

				// Check caller has ban permission
				if (!persist.data(btnInteraction.guild.id).allow_bans_from_anyone) {
					const callingMember = await btnInteraction.guild.members.fetch(btnInteraction.user).catch(() => null);
					if (!callingMember?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
						return btnInteraction.reply({ content: `Unable to ban ${ban.user}: you are missing the \`Ban Members\` permission!`, flags: MessageFlags.Ephemeral });
					}
				}

				// Check guild already banned member
				const guildBans = await btnInteraction.guild.bans.fetch().catch(() => null);
				if (guildBans && guildBans.find(guildBan => guildBan.user.id === ban.user.id)) {
					return btnInteraction.reply({ content: 'User is already banned in this server!', flags: MessageFlags.Ephemeral });
				}

				// Check member is bannable
				const bannedMember = await btnInteraction.guild.members.fetch(ban.user.id).catch(() => null);
				if (bannedMember && !bannedMember.bannable) {
					return btnInteraction.reply({ content: `Unable to ban ${ban.user}: they are not bannable!`, flags: MessageFlags.Ephemeral });
				}

				await btnInteraction.guild.bans.create(ban.user, { reason: `Banned by Oracle Turret - "${banRationale}" https://discord.com/channels/${btnInteraction.message.guildId}/ ${btnInteraction.message.channelId}/${btnInteraction.message.id}` });
				return btnInteraction.reply({ content: `${btnInteraction.user} banned user ${ban.user}!` });
			});

			await modalInteraction.reply({ components: [submittedMessage, reportMessageContainer], files: files, flags: MessageFlags.IsComponentsV2 });
			if (modalInteraction.message?.deletable) {
				await modalInteraction.message.delete();
			}

			for (const oaGuild of (await modalInteraction.client.guilds.fetch()).values()) {
				const guild = await oaGuild.fetch();
				const guildData = persist.data(guild.id);
				if (!guildData.first_time_setup || guildData.seen_accounts.includes(ban.user.id))
					continue;

				const logMissingPerms = async () => await log.error(client, `Unable to send ban report to guild "${guild.name}" (${guild.id}): check channel permissions!`);

				if (guild.id !== modalInteraction.guild?.id) {
					if (guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
						if ((await guild.bans.fetch()).find(userBan => userBan.user.id === ban.user.id)) {
							guildData.seen_accounts.push(ban.user.id);
							persist.saveData(guild.id);
							continue;
						}
					}

					const modChannel = await getModChannel(modalInteraction.client, guild);
					if (!modChannel) {
						await logMissingPerms();
						continue;
					}
					await modChannel.send({ components: [reportMessageContainer], files: files, flags: MessageFlags.IsComponentsV2 }).catch(() => logMissingPerms());
				}

				guildData.seen_accounts.push(ban.user.id);
				persist.saveData(guild.id);
			}
		});

		const actionRow = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(reportButton, ignoreButton);

		await modChannel.send({ content: `${ban.user} (${formatUserRaw(ban.user)}) was just banned. Would you like to report them to other servers?`, components: [actionRow] });
	});

	// Log in
	await client.login(config.token);

	async function shutdown() {
		const date = new Date();
		log.writeToLog(`--- BOT END AT ${date.toDateString()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ---`, true);
		await client.destroy();
		persist.saveAll();
		process.exit();
	}

	process.on('SIGINT', shutdown);
}

if (process.argv.includes('--update-commands')) {
	updateCommands();
} else {
	main();
}
