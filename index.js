// index.js
import express from 'express';
import fs from 'fs';
import ws from 'ws';
import expressWs from 'express-ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { job } from './keep_alive.js';
import { OpenAIOperations } from './openai_operations.js';
import { TwitchBot } from './twitch_bot.js';
import { sanitizeGPTResponse } from './response_sanitizer.js';
import { formatEmotes, addRandomEmoteToEnd } from './emote_formatter.js';
import https from 'https';

// Charge les variables d'environnement
dotenv.config();

job.start();

const app = express();
const expressWsInstance = expressWs(app);

app.set('view engine', 'ejs');
app.use(cors());

const GPT_MODE = process.env.GPT_MODE || 'CHAT';
const HISTORY_LENGTH = process.env.HISTORY_LENGTH || 5;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const TWITCH_USER = process.env.TWITCH_USER || 'Gaufromatic';
const TWITCH_AUTH = process.env.TWITCH_AUTH || 'oauth:xxx';
const COMMAND_NAME = process.env.COMMAND_NAME || '!gpt';
const CHANNELS = process.env.CHANNELS || 'gaufregentille';
const SEND_USERNAME = process.env.SEND_USERNAME || 'true';
const ENABLE_TTS = process.env.ENABLE_TTS || 'false';
const ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS || 'false';
const COOLDOWN_DURATION = Number.isFinite(parseInt(process.env.COOLDOWN_DURATION)) ? parseInt(process.env.COOLDOWN_DURATION, 10) : 10;

const FACT_COOLDOWN_DURATION = 20 * 60 * 1000;
let lastFactTime = 0;
const USER_REACTION_COOLDOWN = 120 * 1000;
const lastUserReactionTime = {};
const slotCooldown = {};
const CREDITS_FILE = './user_credits.json';
let userCredits = {};

try {
  if (fs.existsSync(CREDITS_FILE)) {
    userCredits = JSON.parse(fs.readFileSync(CREDITS_FILE));
  }
} catch (err) {
  console.error('Erreur lecture du fichier de crédits :', err);
}

function saveCredits() {
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(userCredits, null, 2));
}

const commandNames = COMMAND_NAME.split(',').map(cmd => cmd.trim().toLowerCase());
const channels = CHANNELS.split(',').map(channel => channel.trim());
const maxLength = 399;
let fileContext = '';
let lastResponseTime = 0;

try {
  fileContext = fs.readFileSync('./file_context.txt', 'utf8');
} catch (err) {
  console.warn('file_context.txt not found, using empty context.');
}

const bot = new TwitchBot(TWITCH_USER, TWITCH_AUTH, channels, OPENAI_API_KEY, ENABLE_TTS);
const openaiOps = new OpenAIOperations(fileContext, OPENAI_API_KEY, MODEL_NAME, HISTORY_LENGTH);

bot.onConnected((addr, port) => {
  console.log(`* Connected to ${addr}:${port}`);
  channels.forEach(channel => console.log(`* Joining ${channel}`));
});

bot.onDisconnected(reason => console.log(`Disconnected: ${reason}`));

async function isStreamLive() {
  const userLogin = 'gaufregentille';
  const clientId = process.env.TWITCH_CLIENT_ID;
  const accessToken = process.env.TWITCH_APP_TOKEN;

  try {
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${userLogin}`, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    return data.data && data.data.length > 0;
  } catch (err) {
    console.error('Erreur lors de la vérification du stream :', err);
    return false;
  }
}

function fetchAndSendRandomFact(channel) {
  const now = Date.now();
  if (now - lastFactTime < FACT_COOLDOWN_DURATION) return;
  lastFactTime = now;

  const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';
  https.get(url, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const parsed = JSON.parse(data);
        const prompt = `Traduis ce fait inutile en français sans rien ajouter : "${parsed.text}"`;
        const translated = await openaiOps.make_openai_call(prompt);
        bot.say(channel, `🤯 Fait inutile : ${translated}`);
      } catch (err) {
        console.error('Erreur fetch fact :', err);
      }
    });
  });
}

async function main() {
  try {
    await bot.connect();
  } catch (err) {
    console.error('Erreur lors de la connexion au bot Twitch :', err);
  }

  setInterval(async () => {
    try {
      const live = await isStreamLive();
      const now = Date.now();
      if (live && now - lastFactTime >= FACT_COOLDOWN_DURATION) {
        lastFactTime = now;
        fetchAndSendRandomFact(channels[0]);
      }
    } catch (err) {
      console.error('Erreur dans le timer de fact auto :', err);
    }
  }, 60 * 1000);

  bot.onMessage(async (channel, user, message, self) => {
    if (self) return;

    const currentTime = Date.now();
    const elapsedTime = (currentTime - lastResponseTime) / 1000;
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.startsWith('!conseil')) {
      const prompt = `Donne un conseil inutile, absurde mais bienveillant, comme si tu étais Gaufromatic.`;
      const response = await openaiOps.make_openai_call(prompt);
      bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
      return;
    }

    if (lowerMessage.startsWith('!slot')) {
      const cooldown = 15 * 60 * 1000;
      if (slotCooldown[user.username] && currentTime - slotCooldown[user.username] < cooldown) {
        const left = ((cooldown - (currentTime - slotCooldown[user.username])) / 1000).toFixed(1);
        bot.say(channel, `${user.username}, attends encore ${left}s avant de rejouer.`);
        return;
      }
      slotCooldown[user.username] = currentTime;

      const symbols = ['🌭', '🧇', '💀', '☕', '🙀', '🔥', '🐶', '💲', '💩'];
      const [s1, s2, s3] = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
      const result = `${s1} | ${s2} | ${s3}`;
      let delta = 0;
      if (s1 === s2 && s2 === s3) delta = 50;
      else if (s1 === s2 || s2 === s3 || s1 === s3) delta = 10;
      else delta = -10;

      if (!userCredits[user.username]) userCredits[user.username] = 100;
      userCredits[user.username] += delta;
      saveCredits();

      const prompt = `Tu es Gaufromatic. Résultat : ${result}. Type: ${delta > 0 ? 'gain' : 'perte'}. Crédits changés : ${delta}`;
      const gptReaction = await openaiOps.make_openai_call(prompt);
      const msg = `🎰 ${result} → ${formatEmotes(gptReaction)}
${user.username}, tu as maintenant ${userCredits[user.username]} gaufrettes.`;
      bot.say(channel, addRandomEmoteToEnd(msg));
      return;
    }

    if (lowerMessage.startsWith('!gaufrettes') || lowerMessage.startsWith('!crédits')) {
      if (!userCredits[user.username]) userCredits[user.username] = 100;
      bot.say(channel, `${user.username}, tu as ${userCredits[user.username]} gaufrettes.`);
      return;
    }

    if (lowerMessage.startsWith('!classement')) {
      const top = Object.entries(userCredits).sort(([, a], [, b]) => b - a).slice(0, 5);
      let msg = '🏆 Top Gaufrettes :\n';
      top.forEach(([u, c], i) => { msg += `#${i + 1} ${u} : ${c} gaufrettes\n`; });
      bot.say(channel, msg);
      return;
    }

    if (lowerMessage.startsWith('!ajoutercredits') && user.username.toLowerCase() === 'gaufregentille') {
      const [, target, amountStr] = lowerMessage.split(' ');
      const amount = parseInt(amountStr);
      if (!target || isNaN(amount)) {
        bot.say(channel, 'Usage: !ajoutercredits <utilisateur> <montant>');
        return;
      }
      if (!userCredits[target]) userCredits[target] = 0;
      userCredits[target] += amount;
      saveCredits();
      bot.say(channel, `${target} a reçu ${amount} gaufrettes.`);
      return;
    }

    if (["gaufromatic", "le bot", "lebot", "gaufrobot", "gaugromatic"].some(trigger => lowerMessage.startsWith(trigger))) {
      const prompt = `Tu es Gaufromatic. Réagis à : "${message}"`;
      const response = await openaiOps.make_openai_call(prompt);
      bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
      return;
    }

    const command = commandNames.find(cmd => lowerMessage.startsWith(cmd));
    if (command) {
      if (elapsedTime < COOLDOWN_DURATION) {
        bot.say(channel, `Cooldown actif. Attends encore ${COOLDOWN_DURATION - elapsedTime.toFixed(1)}s.`);
        return;
      }
      lastResponseTime = currentTime;

      let text = message.slice(command.length).trim();
      if (SEND_USERNAME === 'true') text = `Message de ${user.username} : ${text}`;

      const response = await openaiOps.make_openai_call(text);
      if (response.length > maxLength) {
        const chunks = response.match(new RegExp(`.{1,${maxLength}}`, 'g'));
        chunks.forEach((chunk, i) => setTimeout(() => bot.say(channel, chunk), 150 * i));
      } else {
        bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
      }
    }
  });
}

main();
