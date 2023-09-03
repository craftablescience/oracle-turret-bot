import fs from 'fs';
import { AttachmentBuilder, Client, EmbedBuilder } from 'discord.js';

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

// Modified from https://github.com/ud-cis-discord/Sage/blob/b874c716e0c1a153e5162ee0e928cb9af536bae6/src/pieces/logs/errorLog.ts#L16
async function generateErrorEmbed(error: Error): Promise<[EmbedBuilder, AttachmentBuilder[]]> {
	const embed = new EmbedBuilder();
	const attachments: AttachmentBuilder[] = [];

	embed.setTitle(error.name ? error.name : error.toString());
	embed.setColor(LogLevelColor.ERROR);

	if (error.message) {
		if (error.message.length < 1000) {
			embed.setDescription(`\`\`\`\n${error.message}\`\`\``);
		} else {
			embed.setDescription('Full error message is too big to display, file is attached above.');
			attachments.push(new AttachmentBuilder(Buffer.from(error.message)).setName('message.txt'));
		}
	}

	if (error.stack) {
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

export async function error(client: Client, msg: Error) {
	const channelID = config.log.errors_and_warnings_channel;
	if (channelID.length === 0) return;
	const channel = await client.channels.fetch(channelID);
	const [embed, attachments] = await generateErrorEmbed(msg);
	if (channel?.isTextBased()) {
		await channel.send({ embeds: [embed], files: attachments });
	}
	writeToLog(msg.toString());
}
