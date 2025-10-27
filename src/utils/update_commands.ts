import { Client, IntentsBitField } from 'discord.js';
import fs from 'fs';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

import * as config from '../config.json';
import * as log from './log';
import * as persist from './persist';

export async function updateCommands() {
	// You need a token, duh
	if (!config.token) {
		log.writeToLog('Error updating commands: no token found in config.json!', true);
		return;
	}

	const dateStart = new Date();
	log.writeToLog(`--- UPDATE COMMANDS FOR ALL GUILDS START AT ${dateStart.toDateString()} ${dateStart.getHours()}:${dateStart.getMinutes()}:${dateStart.getSeconds()} ---`, true);

	const client = new Client({
		intents: [
			IntentsBitField.Flags.Guilds,
		],
	});
	await client.login(config.token);

	const guildCommands = [];
	for (const file of fs.readdirSync('./build/commands/guild').filter(file => file.endsWith('.js'))) {
		guildCommands.push((await import(`../commands/guild/${file}`)).default);
	}
	const globalCommands = [];
	for (const file of fs.readdirSync('./build/commands/global').filter(file => file.endsWith('.js'))) {
		globalCommands.push((await import(`../commands/global/${file}`)).default);
	}

	// Update commands for every guild
	const rest = new REST().setToken(config.token);
	for (const guild of (await client.guilds.fetch()).values()) {
		if (!config.whitelists.guilds.includes(guild.id)) {
			await rest.put(Routes.applicationGuildCommands(config.client_id, guild.id), { body: [] });
			log.writeToLog(`Registered 0 guild commands for UNWHITELISTED ${guild.id}`, true);
			continue;
		}

		const data = persist.data(guild.id);
		let filteredCommands = guildCommands;
		if (!data.first_time_setup) {
			filteredCommands = filteredCommands.filter(cmd => Object.hasOwn(cmd, 'canBeExecutedWithoutPriorGuildSetup') && cmd.canBeExecutedWithoutPriorGuildSetup);
		}
		filteredCommands = filteredCommands.map(cmd => cmd.data.toJSON());
		await rest.put(Routes.applicationGuildCommands(config.client_id, guild.id), { body: filteredCommands });
		log.writeToLog(`Registered ${filteredCommands.length} guild commands for ${guild.id}`, true);
	}

	// And register global commands
	await rest.put(Routes.applicationCommands(config.client_id), { body: globalCommands.map(cmd => cmd.data.toJSON()) });
	log.writeToLog(`Registered ${globalCommands.length} global commands`, true);

	const dateEnd = new Date();
	log.writeToLog(`--- UPDATE COMMANDS FOR ALL GUILDS END AT ${dateEnd.toDateString()} ${dateEnd.getHours()}:${dateEnd.getMinutes()}:${dateEnd.getSeconds()} ---`, true);
	await client.destroy();
}

export async function updateCommandsForGuild(guildID: string) {
	const guildCommands = [];
	if (config.whitelists.guilds.includes(guildID)) {
		for (const file of fs.readdirSync('./build/commands/guild').filter(file => file.endsWith('.js'))) {
			guildCommands.push((await import(`../commands/guild/${file}`)).default);
		}
	}

	const data = persist.data(guildID);
	let filteredCommands = guildCommands;
	if (!data.first_time_setup) {
		filteredCommands = filteredCommands.filter(cmd => Object.hasOwn(cmd, 'canBeExecutedWithoutPriorGuildSetup') && cmd.canBeExecutedWithoutPriorGuildSetup);
	}
	filteredCommands = filteredCommands.map(cmd => cmd.data.toJSON());

	// Update commands for this guild
	const rest = new REST({ version: '10' }).setToken(config.token);
	await rest.put(Routes.applicationGuildCommands(config.client_id, guildID), { body: filteredCommands });
	log.writeToLog(`Registered ${filteredCommands.length} guild commands for ${guildID}`, true);
}
