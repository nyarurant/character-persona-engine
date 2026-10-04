'use strict';

const fs = require('node:fs');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');

const values = {};
for (const line of fs.readFileSync('C:/discord-auth-bot/.env', 'utf8').split(/\r?\n/u)) {
  const match = line.match(/^([^#=]+)=(.*)$/u);
  if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/gu, '');
}
const token = values.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is missing');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
client.once('ready', async () => {
  const joinUserId = process.argv[2] || null;
  const rows = [];
  for (const guild of client.guilds.cache.values()) {
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) continue;
      const permissions = channel.permissionsFor(client.user);
      rows.push({
        guildId: guild.id,
        guildName: guild.name,
        channelId: channel.id,
        channelName: channel.name,
        joinable: channel.joinable,
        speakable: channel.speakable,
        connect: permissions?.has(PermissionFlagsBits.Connect) ?? false,
        speak: permissions?.has(PermissionFlagsBits.Speak) ?? false,
      });
    }
  }
  console.log(JSON.stringify(rows, null, 2));
  if (joinUserId) {
    const state = [...client.guilds.cache.values()]
      .map((guild) => guild.voiceStates.cache.get(joinUserId))
      .find((entry) => entry?.channel);
    if (!state?.channel) throw new Error(`User ${joinUserId} is not in a cached VC`);
    const connection = joinVoiceChannel({
      channelId: state.channel.id,
      guildId: state.guild.id,
      adapterCreator: state.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    connection.on('stateChange', (oldState, newState) => {
      console.error(`[voice-state] ${oldState.status} -> ${newState.status}`);
    });
    connection.on('error', (error) => console.error(`[voice-error] ${error.message}`));
    await entersState(connection, VoiceConnectionStatus.Ready, 30000);
    console.log(JSON.stringify({ joined: true, guildId: state.guild.id, channelId: state.channel.id }));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    connection.destroy();
  }
  client.destroy();
});
client.login(token).catch((error) => { console.error(error.message); process.exitCode = 1; });
