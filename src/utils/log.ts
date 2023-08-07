import fs from 'fs';
import { Client, EmbedBuilder } from 'discord.js';

import * as config from '../config.json';

export enum LogLevelColor {
	INFO      = '#2f3136',
	WARNING   = '#ffd700',
	ERROR     = '#ff0000',
}

export function writeToLog(message: string, sendToConsole = false) {
	// Print it to the console
	if (sendToConsole) {
		console.log(message);
	}

	// Write all messages to the main log too
	const logPath = './log.txt';
	if (!fs.existsSync(logPath)) {
		fs.writeFileSync(logPath, '');
	}
	fs.appendFileSync(logPath, message + '\n');
}

export async function error(client: Client, msg: Error) {
	const channelID = config.log.errors_and_warnings_channel;
	if (channelID.length === 0) return;
	const channel = await client.channels.fetch(channelID);
	const embed = new EmbedBuilder()
		.setColor(LogLevelColor.ERROR)
		.setTitle('ERROR')
		.setDescription(msg.toString())
		.setTimestamp();
	if (channel?.isTextBased()) {
		await channel.send({ embeds: [embed] });
	}
	writeToLog(msg.toString());
}

export async function warning(client: Client, msg: string) {
	const channelID = config.log.errors_and_warnings_channel;
	if (channelID.length === 0) return;
	const channel = await client.channels.fetch(channelID);
	const embed = new EmbedBuilder()
		.setColor(LogLevelColor.WARNING)
		.setTitle('WARNING')
		.setDescription(msg)
		.setTimestamp();
	if (channel?.isTextBased()) {
		await channel.send({ embeds: [embed] });
	}
	writeToLog(msg.toString());
}
