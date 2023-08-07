// noinspection JSIgnoredPromiseFromCall

import fs from 'fs';
import { ActivityType, Collection, GuildMember, IntentsBitField } from 'discord.js';
import { Callbacks, OracleTurretClient } from './types/client';
import { Command } from './types/interaction';
import { hasPermissionLevel } from './utils/permissions';
import { updateCommands, updateCommandsForGuild } from './utils/update_commands';

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
		const activityString = `${(await client.guilds.fetch()).size} servers`;
		client.user.setActivity(activityString, { type: ActivityType.Listening });
		setTimeout(() => client.user?.setActivity(activityString, { type: ActivityType.Listening }), 30e3);
		log.writeToLog(`Logged in as ${client.user.tag}`, true);
	});

	// Listen for errors
	client.on('error', async error => {
		await log.error(client, error);
	});

	// Listen for warnings
	client.on('warn', async warn => {
		await log.warning(client, warn);
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
				log.writeToLog((err as Error).toString(), true);
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
				log.writeToLog((err as Error).toString(), true);
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
				log.writeToLog((err as Error).toString(), true);
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
		// todo
	});

	// Listen for deleted messages
	client.on('messageDelete', async message => {
		// Only for members
		if (!message.guild || !message.member)
			return;

		// todo
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
