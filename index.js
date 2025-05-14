// index.js

// --- Importation des modules nécessaires ---
import express from 'express';
import fs from 'fs';
import ws from 'ws';
import expressWs from 'express-ws';
import cors from 'cors';
import { job } from './keep_alive.js';
import { OpenAIOperations } from './openai_operations.js';
import { TwitchBot } from './twitch_bot.js';
import { sanitizeGPTResponse } from './response_sanitizer.js';
import { formatEmotes, addRandomEmoteToEnd } from './emote_formatter.js';
import https from 'https';
import fetch from 'node-fetch';

// --- Lancement du keep-alive ---
job.start();

// --- Configuration de l'application Express ---
const app = express();
const expressWsInstance = expressWs(app);
app.set('view engine', 'ejs');
app.use(cors());

// --- Constantes et configurations du bot ---
const GPT_MODE = 'CHAT';
const HISTORY_LENGTH = 5;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = 'gpt-3.5-turbo';
const TWITCH_USER = process.env.TWITCH_USER;
const TWITCH_AUTH = process.env.TWITCH_AUTH;
const COMMAND_NAME = '!gpt';
const CHANNELS = process.env.CHANNELS || 'gaufregentille';
const SEND_USERNAME = process.env.SEND_USERNAME || 'true';
const ENABLE_TTS = process.env.ENABLE_TTS || 'false';
const ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS || 'false';
const COOLDOWN_DURATION = 10;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// --- Variables liées aux fonctionnalités du bot ---
const FACT_COOLDOWN_DURATION = 45 * 60 * 1000; // 45 minutes pour les facts auto
let lastFactTime = 0;
const USER_REACTION_COOLDOWN = 120 * 1000; // 2 minutes pour réponses pseudo
const lastUserReactionTime = {};
const slotCooldown = {}; // cooldown pour !slot
const trackedUsers = ['garryaulait', 'pandibullee', 'gaufregentille'];
const CREDITS_FILE = './user_credits.json';
let userCredits = {}; // stocke les gaufrettes
let accessToken = '';

// --- Chargement des crédits sauvegardés ---
try {
  if (fs.existsSync(CREDITS_FILE)) {
    userCredits = JSON.parse(fs.readFileSync(CREDITS_FILE));
  }
} catch (err) {
  console.error('Erreur lecture du fichier de crédits :', err);
}

// --- Sauvegarde des crédits dans le fichier JSON ---
function saveCredits() {
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(userCredits, null, 2));
}

// --- Récupère un token d'accès à l'API Twitch ---
async function fetchTwitchAccessToken() {
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {
    method: 'POST'
  });
  const data = await res.json();
  accessToken = data.access_token;
}

// --- Vérifie si le stream est en ligne ---
async function isStreamLive(username) {
  if (!accessToken) await fetchTwitchAccessToken();
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const data = await res.json();
  return data.data && data.data.length > 0;
}

// --- Récupère un fait inutile aléatoire ---
async function fetchAndSendRandomFact(channel, force = false) {
  const now = Date.now();
  if (!force && now - lastFactTime < FACT_COOLDOWN_DURATION) return;
  if (!force && !(await isStreamLive('gaufregentille'))) return;
  lastFactTime = now;

  const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';
  https.get(url, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const parsed = JSON.parse(data);
        const prompt = `Traduis ce fait inutile en français sans rien ajouter : ${parsed.text}`;
        const translated = await openaiOps.make_openai_call(prompt);
        bot.say(channel, `🤯 Fait inutile : ${translated}`);
      } catch (err) {
        console.error('Erreur fetch fact :', err);
      }
    });
  });
}

// --- Chargement du contexte système ---
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

// --- Initialisation du bot Twitch et OpenAI ---
const bot = new TwitchBot(TWITCH_USER, TWITCH_AUTH, channels, OPENAI_API_KEY, ENABLE_TTS);
const openaiOps = new OpenAIOperations(fileContext, OPENAI_API_KEY, MODEL_NAME, HISTORY_LENGTH);

// --- Gestion des événements du bot ---
bot.onConnected((addr, port) => {
  console.log(`* Connected to ${addr}:${port}`);
  channels.forEach(channel => console.log(`* Joining ${channel}`));
});

bot.onDisconnected(reason => console.log(`Disconnected: ${reason}`));

// --- Réponses aux messages du chat Twitch ---
bot.onMessage(async (channel, user, message, self) => {
  if (self) return;
  const currentTime = Date.now();
  const elapsedTime = (currentTime - lastResponseTime) / 1000;
  const lowerMessage = message.toLowerCase();

  // !fact forcé par commande
  if (lowerMessage.startsWith('!fact')) {
    fetchAndSendRandomFact(channel, true);
    return;
  }

  // !conseil aléatoire via GPT
  if (lowerMessage.startsWith('!conseil')) {
    const gptPrompt = `Donne un conseil inutile, absurde mais bienveillant, comme si tu étais Gaufromatic.`;
    const response = await openaiOps.make_openai_call(gptPrompt);
    bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
    return;
  }

  // !slot (machine à sous avec gaufrettes)
  if (lowerMessage.startsWith('!slot')) {
    const now = Date.now();
    const cooldownTime = 15 * 60 * 1000;
    if (slotCooldown[user.username] && now - slotCooldown[user.username] < cooldownTime) {
      const timeLeft = ((cooldownTime - (now - slotCooldown[user.username])) / 1000).toFixed(1);
      bot.say(channel, `${user.username}, attends encore ${timeLeft} secondes avant de rejouer.`);
      return;
    }
    slotCooldown[user.username] = now;
    const symbols = ['🌭', '🧇', '💀', '☕', '🙀', '🔥', '🐶', '💲', '💩'];
    const [slot1, slot2, slot3] = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
    const result = `${slot1} | ${slot2} | ${slot3}`;
    let creditsChange = 0;
    if (slot1 === slot2 && slot2 === slot3) creditsChange = 50;
    else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) creditsChange = 10;
    else creditsChange = -10;
    if (!userCredits[user.username]) userCredits[user.username] = 100;
    userCredits[user.username] += creditsChange;
    saveCredits();
    const prompt = `Tu es Gaufromatic. Résultat : ${result}. Type: ${creditsChange > 0 ? 'gain' : 'perte'}. Crédits changés : ${creditsChange}`;
    const gptReaction = await openaiOps.make_openai_call(prompt);
    const finalMessage = `🎰 ${result} → ${formatEmotes(gptReaction)}\n${user.username}, tu as maintenant ${userCredits[user.username]} gaufrettes.`;
    bot.say(channel, addRandomEmoteToEnd(finalMessage));
    return;
  }

  // !gaufrettes / !crédits → Affiche le solde du joueur
  if (lowerMessage.startsWith('!gaufrettes') || lowerMessage.startsWith('!crédits')) {
    if (!userCredits[user.username]) userCredits[user.username] = 100;
    bot.say(channel, `${user.username}, tu as ${userCredits[user.username]} gaufrettes.`);
    return;
  }

  // !classement → top 5 des joueurs
  if (lowerMessage.startsWith('!classement')) {
    const sorted = Object.entries(userCredits).sort(([, a], [, b]) => b - a).slice(0, 5);
    let msg = '🏆 Top Gaufrettes :\n';
    sorted.forEach(([u, c], i) => { msg += `#${i + 1} ${u} : ${c} gaufrettes\n`; });
    bot.say(channel, msg);
    return;
  }

  // !ajoutercredits (réservé au streamer)
  if (lowerMessage.startsWith('!ajoutercredits') && user.username.toLowerCase() === 'gaufregentille') {
    const [, targetUser, amountStr] = lowerMessage.split(' ');
    const amount = parseInt(amountStr);
    if (!targetUser || isNaN(amount)) {
      bot.say(channel, 'Usage: !ajoutercredits <utilisateur> <montant>');
      return;
    }
    if (!userCredits[targetUser]) userCredits[targetUser] = 0;
    userCredits[targetUser] += amount;
    saveCredits();
    bot.say(channel, `${targetUser} a reçu ${amount} gaufrettes.`);
    return;
  }

  // Déclencheurs avec le nom du bot
  if (["gaufromatic", "le bot", "lebot", "gaufrobot", "gaugromatic"].some(trigger => lowerMessage.startsWith(trigger))) {
    const prompt = `Tu es Gaufromatic. Réagis à ce message : ${message}`;
    const response = await openaiOps.make_openai_call(prompt);
    bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
    return;
  }

  // Réaction automatique à certains pseudos
  if (trackedUsers.includes(user.username.toLowerCase())) {
    if (currentTime - (lastUserReactionTime[user.username] || 0) < USER_REACTION_COOLDOWN) return;
    lastUserReactionTime[user.username] = currentTime;
    const prompt = `Tu es Gaufromatic. Réagis au message de ${user.username} : ${message}`;
    const response = await openaiOps.make_openai_call(prompt);
    bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
    return;
  }
});

// --- Lancement principal ---
async function main() {
  try {
    await bot.connect();
  } catch (err) {
    console.error('Erreur lors de la connexion au bot Twitch :', err);
  }
  setInterval(() => {
    fetchAndSendRandomFact(channels[0]);
  }, 60 * 1000);
}

main();

// --- Serveur web Express pour compatibilité Render ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur express lancé sur le port ${PORT}`);
});
