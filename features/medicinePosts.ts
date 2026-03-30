// features/medicinePosts.ts
import { TextChannel } from 'discord.js';
import cron from 'node-cron';
import { MEDICINE_POSTS_CONFIG } from '../config.js';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { generateMedicinePost, saveToHistory } from '../utils/medicineUtils.js';

/**
 * Post the daily medicine information
 */
async function postDailyMedicine(client: ExtendedClient): Promise<void> {
  try {
    if (!MEDICINE_POSTS_CONFIG.enabled) {
      return;
    }

    console.log('Generating daily medicine post...');

    const result = await generateMedicinePost(client);
    if (!result) {
      console.error('Failed to generate medicine post');
      return;
    }

    const { name, content } = result;

    // Get the channel
    const channel = await client.channels.fetch(MEDICINE_POSTS_CONFIG.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error('Invalid channel for medicine posts');
      return;
    }

    // Send the post
    await channel.send(content);

    // Save to history (with built-in duplicate protection)
    saveToHistory(name);

    console.log(`✅ Medicine post sent: ${name}`);
  } catch (error) {
    console.error('Error posting daily medicine:', error);
  }
}

/**
 * Initialize the medicine posts scheduler
 */
export function initializeMedicinePosts(client: ExtendedClient): void {
  if (!MEDICINE_POSTS_CONFIG.enabled) {
    console.log('Medicine posts feature is disabled');
    return;
  }

  const hour = MEDICINE_POSTS_CONFIG.postHour;

  // Schedule daily post at configured hour (Paris timezone)
  // Cron format: minute hour day month weekday
  const cronExpression = `0 ${hour} * * *`;

  cron.schedule(cronExpression, async () => {
    await postDailyMedicine(client);
  }, {
    timezone: 'Europe/Paris'
  });

  console.log(`✅ Medicine posts scheduled at ${hour}:00 Paris time`);
}
