// noinspection JSIgnoredPromiseFromCall

import fs from 'fs';
import { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, Collection, EmbedBuilder, GuildMember, IntentsBitField, ModalActionRowComponentBuilder, ModalBuilder, PermissionsBitField, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Callbacks, OracleTurretClient } from './types/client';
import { Command } from './types/interaction';
import { LogLevelColor } from './utils/log';
import { getModChannel } from './utils/mod_channel';
import { hasPermissionLevel } from './utils/permissions';
import { updateCommands, updateCommandsForGuild } from './utils/update_commands';
import { formatUserRaw /*, getUserOrMemberAvatarAttachment*/ } from './utils/utils';

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
	client.on('ready', async () => {
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
		} else if (interaction.isButton() || interaction.isStringSelectMenu()) {
			if (interaction.message.interaction && interaction.user !== interaction.message.interaction.user) {
				await interaction.reply({ content: `You cannot touch someone else's buttons! These buttons are owned by ${interaction.message.interaction.user}`, ephemeral: true });
				return;
			}

			try {
				if (interaction.isButton()) {
					await client.callbacks.runButtonCallback(interaction.customId, interaction);
				} else if (interaction.isStringSelectMenu()) {
					await client.callbacks.runSelectMenuCallback(interaction.customId, interaction);
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
		const data = persist.data(ban.guild.id);
		if (data.seen_accounts.includes(ban.user.id)) {
			return;
		}

		const modChannel = await getModChannel(ban.client, ban.guild);
		if (!modChannel) {
			return;
		}

		const reportButtonID = `${ban.user.id}_report_btn`;
		const reportButton = new ButtonBuilder()
			.setCustomId(reportButtonID)
			.setLabel('Report')
			.setStyle(ButtonStyle.Danger);

		const ignoreButtonID = `${ban.user.id}_ignore_btn`;
		const ignoreButton = new ButtonBuilder()
			.setCustomId(ignoreButtonID)
			.setLabel('Ignore')
			.setStyle(ButtonStyle.Secondary);

		(ban.client as OracleTurretClient).callbacks.addButtonCallback(ignoreButtonID, async btnInteraction => {
			if (!btnInteraction.inGuild() || !btnInteraction.guild) {
				return btnInteraction.reply({ content: 'This button must be clicked in a guild.', ephemeral: true });
			}
			if (btnInteraction.message.deletable) {
				return btnInteraction.message.delete();
			}
			return btnInteraction.reply({ 'content': 'Ignored ban.', ephemeral: true });
		});

		(ban.client as OracleTurretClient).callbacks.addButtonCallback(reportButtonID, async btnInteraction => {
			if (!btnInteraction.inGuild() || !btnInteraction.guild) {
				return btnInteraction.reply({ content: 'This button must be clicked in a guild.', ephemeral: true });
			}

			const modal = new ModalBuilder()
				.setCustomId(reportButtonID + '_modal')
				.setTitle('Report User');

			const banRationale = new TextInputBuilder()
				.setCustomId('ban_rationale')
				.setLabel('Why was this user banned?')
				.setStyle(TextInputStyle.Short);

			const banEvidence = new TextInputBuilder()
				.setCustomId('ban_evidence')
				.setLabel('Evidence of misconduct:')
				.setStyle(TextInputStyle.Paragraph);

			modal.addComponents(
				new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(banRationale),
				new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(banEvidence));

			return btnInteraction.showModal(modal);
		});
		(ban.client as OracleTurretClient).callbacks.addModalCallback(reportButtonID + '_modal', async modalInteraction => {
			const banRationale = modalInteraction.components[0].components[0].value;
			let banEvidence = modalInteraction.components[1].components[0].value;
			if (banEvidence.length === 0) {
				banEvidence = 'No evidence provided.';
			}

			//const [attachment, path] = await getUserOrMemberAvatarAttachment(ban.user, 256);

			const embed = new EmbedBuilder()
				.setColor(LogLevelColor.WARNING)
				.setTitle('New Ban Report')
				//.setThumbnail(path)
				.addFields([
					{ name: 'Banned User', value: `${ban.user} (${formatUserRaw(ban.user)})` },
					{ name: 'Originating Server', value: ban.guild?.name ?? 'Unknown' },
					{ name: 'Why was this user banned?', value: banRationale },
					{ name: 'Evidence of misconduct:', value: banEvidence },
					{ name: 'Manual Ban Command', value: `\`/ban user:<@${ban.user.id}>\`` },
				])
				.setTimestamp(Date.now());

			const quickBanButtonID = `${ban.user.id}_quick_ban_btn`;
			const quickBanButton = new ButtonBuilder()
				.setCustomId(quickBanButtonID)
				.setLabel('Ban User')
				.setStyle(ButtonStyle.Danger);

			(ban.client as OracleTurretClient).callbacks.addButtonCallback(quickBanButtonID, async btnInteraction => {
				if (!btnInteraction.inGuild() || !btnInteraction.guild) {
					return btnInteraction.reply({ content: 'This button must be clicked in a guild.', ephemeral: true });
				}

				// Sanity check
				if (ban.user.id === btnInteraction.guild.members.me?.id) {
					return btnInteraction.reply({ content: 'Unable to ban myself!', ephemeral: true });
				}

				// Check bot has ban permission
				if (!btnInteraction.guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
					return btnInteraction.reply({ content: `Unable to ban ${ban.user}: this bot does not have the Ban Members permission in this server!`, ephemeral: true });
				}

				// Check caller has ban permission
				const callingMember = await btnInteraction.guild.members.fetch(btnInteraction.user).catch(() => null);
				if (!callingMember?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
					return btnInteraction.reply({ content: `Unable to ban ${ban.user}: you are missing the Ban Members permission!`, ephemeral: true });
				}

				// Check member is bannable
				const bannedMember = await btnInteraction.guild.members.fetch(ban.user.id).catch(() => null);
				if (bannedMember && !bannedMember.bannable) {
					return btnInteraction.reply({ content: `Unable to ban ${ban.user}: they are not bannable!`, ephemeral: true });
				}

				await btnInteraction.guild.bans.create(ban.user, { reason: `Banned by Oracle Turret - "${banRationale}" https://discord.com/channels/${btnInteraction.message.guildId}/ ${btnInteraction.message.channelId}/${btnInteraction.message.id}` });
				return btnInteraction.reply({ content: `Banned user ${ban.user}!` });
			});

			const actionRow = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(quickBanButton);

			if (modalInteraction.message?.deletable) {
				await modalInteraction.message.delete();
			}
			// Don't show the action row on this embed, it only has a redundant "Ban User" button
			await modalInteraction.reply({ content: 'Submitted ban report to network!', embeds: [embed], /*files: [attachment],*/ });

			for (const guild of (await modalInteraction.client.guilds.fetch()).values()) {
				const guildData = persist.data(guild.id);
				if (guildData.seen_accounts.includes(ban.user.id))
					continue;

				if (guild.id !== modalInteraction.guild?.id) {
					const modChannel = await getModChannel(modalInteraction.client, await guild.fetch());
					await modChannel?.send({ embeds: [embed], /*files: [attachment],*/ components: [actionRow] });
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
