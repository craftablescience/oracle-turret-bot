// noinspection JSUnusedGlobalSymbols

import { AttachmentBuilder, CommandInteraction, EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types/interaction';
import { LogLevelColor, generateErrorEmbed } from '../../utils/log';
import { getModChannel } from '../../utils/mod_channel';
import { PermissionLevel } from '../../utils/permissions';

function getRandomTestMessage() {
	const messages: string[] = [
		'Get mad!',
		'Don\'t make lemonade!',
		'Prometheus was punished by the gods for giving the gift of knowledge to man. He was cast into the bowels of the earth and pecked by birds.',
		'It won\'t be enough.',
		'The answer is beneath us.',
		'Her name is Caroline.',
		'Remember that!',
		'That\'s all I can say.',
	];
	return messages[Math.floor(Math.random() * messages.length)];
}

const Status: Command = {
	permissionLevel: PermissionLevel.BAN_MEMBERS,

	data: new SlashCommandBuilder()
		.setName('status')
		.setDescription('Check the status of the current server.')
		.setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
		.addBooleanOption(option => option
			.setName('debug')
			.setDescription('Sends a test message in the configured moderation channel, and reports any errors while doing so.')),

	async execute(interaction: CommandInteraction) {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inGuild() || !interaction.guild) {
			return interaction.reply({ content: 'This command must be ran in a guild.', flags: MessageFlags.Ephemeral });
		}

		const modChannel = await getModChannel(interaction.client, interaction.guild);

		// Send a test message
		let debugContents: [EmbedBuilder, AttachmentBuilder[]] | undefined = undefined;
		if (modChannel && interaction.options.getBoolean('debug')) {
			try {
				const testMessage = await modChannel.send({ content: getRandomTestMessage() });
				if (testMessage.deletable) {
					await testMessage.delete();
				}
			} catch (e) {
				debugContents = await generateErrorEmbed(e as Error, interaction.guild.id);
			}
		}

		// We're assuming that the setup command has ran, otherwise we wouldn't get called
		const embed = new EmbedBuilder()
			.setTitle('Status')
			.setColor(LogLevelColor.INFO)
			.addFields(
				{ name: 'Required:', value: `- Moderation channel is accessible: ${modChannel ? '✅' : '❌'}` },
				{ name: 'Optional:', value: `- Has \`Ban Members\` permission: ${interaction.guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers) ? '✅' : '❌'}` })
			.setTimestamp();

		if (debugContents !== undefined) {
			return interaction.reply({ embeds: [embed, debugContents[0]], files: debugContents[1], flags: MessageFlags.Ephemeral });
		}
		if (interaction.options.getBoolean('debug')) {
			embed.addFields({ name: 'Debug:', value: '- No Errors' });
		}
		return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	}
};
export default Status;
