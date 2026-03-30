// types/ExtendedClient.ts
import { Client } from 'discord.js';
import OpenAI from 'openai';

export interface ExtendedClient extends Client {
  openai: OpenAI;
  currentModel: string;
}
