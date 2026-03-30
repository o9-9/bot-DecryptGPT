// commands/eponym.ts
import { CommandInteraction, SlashCommandBuilder, TextChannel } from 'discord.js';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { EPONYM_POSTS_CONFIG } from '../config.js';
import { generateEponymPost, saveEponymToHistory } from '../utils/eponymUtils.js';

export const data = new SlashCommandBuilder()
  .setName('eponym')
  .setDescription('Manually trigger an eponym post (for testing)');

export async function execute(interaction: CommandInteraction, client: ExtendedClient) {
  try {
    await interaction.deferReply({ ephemeral: true });

    console.log('Manually generating eponym post...');

    const result = await generateEponymPost(client);
    if (!result) {
      await interaction.editReply('❌ Failed to generate eponym post (could not find unique eponym after multiple attempts)');
      return;
    }

    const { name, content } = result;

    // Get the configured channel
    const channel = await client.channels.fetch(EPONYM_POSTS_CONFIG.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      await interaction.editReply('❌ Invalid channel configured for eponym posts');
      return;
    }

    // Send the post
    await channel.send(content);

    // Save to history (with built-in duplicate protection)
    saveEponymToHistory(name);

    await interaction.editReply(`✅ Eponym post sent: ${name}`);
    console.log(`✅ Manual eponym post sent: ${name}`);
  } catch (error) {
    console.error('Error in eponym command:', error);
    await interaction.editReply('❌ An error occurred while generating the eponym post');
  }
}
