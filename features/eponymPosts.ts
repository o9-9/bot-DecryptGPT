// features/eponymPosts.ts
import { TextChannel } from 'discord.js';
import cron from 'node-cron';
import { EPONYM_POSTS_CONFIG } from '../config.js';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { generateEponymPost, saveEponymToHistory } from '../utils/eponymUtils.js';

/**
 * Post the daily eponym information
 */
async function postDailyEponym(client: ExtendedClient): Promise<void> {
  try {
    if (!EPONYM_POSTS_CONFIG.enabled) {
      return;
    }

    console.log('Generating daily eponym post...');

    const result = await generateEponymPost(client);
    if (!result) {
      console.error('Failed to generate eponym post');
      return;
    }

    const { name, content } = result;

    // Get the channel
    const channel = await client.channels.fetch(EPONYM_POSTS_CONFIG.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error('Invalid channel for eponym posts');
      return;
    }

    // Send the post
    await channel.send(content);

    // Save to history (with built-in duplicate protection)
    saveEponymToHistory(name);

    console.log(`✅ Eponym post sent: ${name}`);
  } catch (error) {
    console.error('Error posting daily eponym:', error);
  }
}

/**
 * Initialize the eponym posts scheduler
 */
export function initializeEponymPosts(client: ExtendedClient): void {
  if (!EPONYM_POSTS_CONFIG.enabled) {
    console.log('Eponym posts feature is disabled');
    return;
  }

  const hour = EPONYM_POSTS_CONFIG.postHour;

  // Schedule daily post at configured hour (Paris timezone)
  // Cron format: minute hour day month weekday
  const cronExpression = `0 ${hour} * * *`;

  cron.schedule(cronExpression, async () => {
    await postDailyEponym(client);
  }, {
    timezone: 'Europe/Paris'
  });

  console.log(`✅ Eponym posts scheduled at ${hour}:00 Paris time`);
}
