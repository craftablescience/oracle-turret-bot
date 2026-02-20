import fs from 'fs';
import { AttachmentBuilder, Client, EmbedBuilder } from 'discord.js';

import * as config from '../config.json';

export enum LogLevelColor {
	INFO      = '#2b2d31',
	WARNING   = '#ffd700',
	ERROR     = '#ff0000',
}

export function colorToNumber(color: LogLevelColor) {
	return parseInt(color.substring(1), 16);
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

// Modified from https://github.com/ud-cis-discord/Sage/blob/b874c716e0c1a153e5162ee0e928cb9af536bae6/src/pieces/logs/errorLog.ts#L16
export async function generateErrorEmbed(error: string | Error, guildID?: string | undefined | null): Promise<[EmbedBuilder, AttachmentBuilder[]]> {
	const embed = new EmbedBuilder();
	const attachments: AttachmentBuilder[] = [];

	embed.setTitle(error instanceof Error ? (error.name ? error.name : error.toString()) : 'Error [Custom]');
	embed.setColor(LogLevelColor.ERROR);

	if (guildID) {
		embed.addFields({ name: 'Guild ID', value: '```\n' + guildID + '```' });
	}

	const message = error instanceof Error ? error.message : error;
	if (message.length < 1000) {
		embed.addFields({ name: 'Message', value: `\`\`\`\n${message}\`\`\`` });
	} else {
		embed.addFields({ name: 'Message', value: 'Full error message is too big to display, file is attached above.' });
		attachments.push(new AttachmentBuilder(Buffer.from(message)).setName('message.txt'));
	}

	if (error instanceof Error && error.stack) {
		if (error.stack.length < 1000) {
			embed.addFields({ name: 'Stack Trace', value: `\`\`\`js\n${error.stack}\`\`\`` });
		} else {
			embed.addFields({ name: 'Stack Trace', value: 'Full stack is too big to display, file is attached above.' });
			attachments.push(new AttachmentBuilder(Buffer.from(error.stack)).setName('stacktrace.js'));
		}
	}

	embed.setTimestamp();

	return [embed, attachments];
}

export async function error(client: Client, msg: string | Error, guildID?: string | undefined | null) {
	const channelID = config.log.errors_and_warnings_channel;
	if (channelID.length === 0) return;
	const channel = await client.channels.fetch(channelID);
	const [embed, attachments] = await generateErrorEmbed(msg, guildID);
	if (channel?.isSendable()) {
		await channel.send({ embeds: [embed], files: attachments });
	}
	writeToLog(msg.toString());
}
