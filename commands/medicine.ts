// commands/medicine.ts
import { CommandInteraction, SlashCommandBuilder, TextChannel } from 'discord.js';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { MEDICINE_POSTS_CONFIG } from '../config.js';
import { generateMedicinePost, saveToHistory } from '../utils/medicineUtils.js';

export const data = new SlashCommandBuilder()
  .setName('medicine')
  .setDescription('Manually trigger a medicine post (for testing)');

export async function execute(interaction: CommandInteraction, client: ExtendedClient) {
  try {
    await interaction.deferReply({ ephemeral: true });

    console.log('Manually generating medicine post...');

    const result = await generateMedicinePost(client);
    if (!result) {
      await interaction.editReply('❌ Failed to generate medicine post (could not find unique medicine after multiple attempts)');
      return;
    }

    const { name, content } = result;

    // Get the configured channel
    const channel = await client.channels.fetch(MEDICINE_POSTS_CONFIG.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      await interaction.editReply('❌ Invalid channel configured for medicine posts');
      return;
    }

    // Send the post
    await channel.send(content);

    // Save to history (with built-in duplicate protection)
    saveToHistory(name);

    await interaction.editReply(`✅ Medicine post sent: ${name}`);
    console.log(`✅ Manual medicine post sent: ${name}`);
  } catch (error) {
    console.error('Error in medicine command:', error);
    await interaction.editReply('❌ An error occurred while generating the medicine post');
  }
}
