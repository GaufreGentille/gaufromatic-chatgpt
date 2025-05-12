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

// Charge les variables d'environnement depuis le fichier .env
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

if (!OPENAI_API_KEY) {
    console.error('No OPENAI_API_KEY found. Please set it as an environment variable.');
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

try {
    await bot.connect();
} catch (err) {
    console.error('Erreur lors de la connexion au bot Twitch :', err);
}

// Fonction pour savoir si le stream est en ligne
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

// Timer automatique pour fetch un fact toutes les 20 minutes si live
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

    // Commande !conseil
    if (lowerMessage.startsWith('!conseil')) {
        const gptPrompt = `Donne un conseil inutile, absurde mais bienveillant, comme si tu étais Gaufromatic.`;
        const response = await openaiOps.make_openai_call(gptPrompt);
        const formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
        bot.say(channel, formattedResponse);
        return;
    }

    // Commande !fact
    if (lowerMessage.startsWith('!fact')) {
        fetchAndSendRandomFact(channel);
        return;
    }

    // Commande !slot
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
        const finalMessage = ` ${result} → ${formatEmotes(gptReaction)}\n${user.username}, tu as maintenant ${userCredits[user.username]} gaufrettes.`;
        bot.say(channel, addRandomEmoteToEnd(finalMessage));
        return;
    }

    if (lowerMessage.startsWith('!gaufrettes') || lowerMessage.startsWith('!crédits')) {
        if (!userCredits[user.username]) userCredits[user.username] = 100;
        bot.say(channel, `${user.username}, tu as ${userCredits[user.username]} gaufrettes.`);
        return;
    }

    if (lowerMessage.startsWith('!classement')) {
        const sorted = Object.entries(userCredits).sort(([, a], [, b]) => b - a).slice(0, 5);
        let msg = '🏆 Top Gaufrettes :\n';
        sorted.forEach(([u, c], i) => { msg += `#${i + 1} ${u} : ${c} gaufrettes\n`; });
        bot.say(channel, msg);
        return;
    }

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

    if (["gaufromatic", "le bot", "lebot", "gaufrobot", "gaugromatic"].some(trigger => lowerMessage.startsWith(trigger))) {
        const prompt = `Tu es Gaufromatic. Réagis à : "${message}"`;
        const response = await openaiOps.make_openai_call(prompt);
        bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
        return;
    }

    if (trackedUsers.includes(user.username.toLowerCase())) {
        const now = Date.now();
        if (now - (lastUserReactionTime[user.username] || 0) < USER_REACTION_COOLDOWN) return;
        lastUserReactionTime[user.username] = now;

        const prompt = `Tu es Gaufromatic. Réagis au message de ${user.username} : "${message}"`;
        const response = await openaiOps.make_openai_call(prompt);
        bot.say(channel, addRandomEmoteToEnd(formatEmotes(response)));
        return;
    }
});

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
                const prompt = `Traduis ce fait inutile en français sans rien ajouter : \"${parsed.text}\"`;
                const translated = await openaiOps.make_openai_call(prompt);
                bot.say(channel, `🤯 Fait inutile : ${translated}`);
            } catch (err) {
                console.error('Erreur fetch fact :', err);
            }
        });
    });
}

const messages = [{ role: 'system', content: fileContext }];
app.use(express.json({ extended: true, limit: '1mb' }));
app.use('/public', express.static('public'));

app.all('/', (req, res) => res.render('pages/index'));

app.get('/gpt/:text', async (req, res) => {
    const text = req.params.text;
    try {
        const answer = await openaiOps.make_openai_call(text);
        res.send(answer);
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).send('Erreur de génération de réponse.');
    }
});

const server = app.listen(3000, () => console.log('Serveur lancé sur le port 3000'));

const wss = expressWsInstance.getWss();
wss.on('connection', ws => {
    ws.on('message', message => {});
});

function notifyFileChange() {
    wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ updated: true }));
        }
    });
}
