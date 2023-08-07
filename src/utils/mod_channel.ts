import { Client, Guild, GuildTextBasedChannel, PermissionFlagsBits } from 'discord.js';

import * as persist from './persist';

export async function getModChannel(client: Client, guild: Guild): Promise<GuildTextBasedChannel | null> {
	if (!client.user)
		return null;

	const data = persist.data(guild.id);
	if (!data.first_time_setup)
		return null;

	const modChannelID = data.mod_channel;
	const modChannel = await guild.channels.fetch(modChannelID);
	if (!modChannel || !modChannel.isTextBased() || !modChannel.permissionsFor(client.user.id)?.has(PermissionFlagsBits.SendMessages))
		return null;

	return modChannel;
}
