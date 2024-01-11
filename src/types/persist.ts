// Modify this interface when adding new data things, or don't if you hate TypeScript and everything it stands for
export interface PersistentData {
	first_time_setup: boolean,
	mod_channel: string,
	seen_accounts: string[],
	allow_bans_from_anyone?: boolean,
}
