import { GuildMember, PermissionFlagsBits } from 'discord.js';

export const PermissionLevel = {
	EVERYONE: 0n,
	BAN_MEMBERS: PermissionFlagsBits.BanMembers,
	ADMINISTRATOR: PermissionFlagsBits.Administrator,
};

export function hasPermissionLevel(member: GuildMember, permissionLevel: bigint) {
	if (permissionLevel === PermissionLevel.EVERYONE || member.permissions.has(PermissionLevel.ADMINISTRATOR)) {
		return true;
	}
	return member.permissions.has(permissionLevel);
}
