import express from 'express';
import fs from 'fs';
import ws from 'ws';
import expressWs from 'express-ws';
import cors from 'cors';
import https from 'https';
import { job } from './keep_alive.js';
import { OpenAIOperations } from './openai_operations.js';
import { TwitchBot } from './twitch_bot.js';
import { sanitizeGPTResponse } from './response_sanitizer.js';
import { formatEmotes, addRandomEmoteToEnd } from './emote_formatter.js';

// === CONFIGURATION ===
const app = express();
const expressWsInstance = expressWs(app);

const GPT_MODE = process.env.GPT_MODE || 'CHAT';
const HISTORY_LENGTH = parseInt(process.env.HISTORY_LENGTH || '5', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const TWITCH_USER = process.env.TWITCH_USER || 'oSetinhasBot';
const TWITCH_AUTH = process.env.TWITCH_AUTH || 'oauth:xxx';
const COMMAND_NAME = process.env.COMMAND_NAME || '!gpt';
const CHANNELS = process.env.CHANNELS || 'oSetinhas,jones88';
const SEND_USERNAME = process.env.SEND_USERNAME !== 'false';
const ENABLE_TTS = process.env.ENABLE_TTS === 'true';
const ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS === 'true';
const COOLDOWN_DURATION = parseInt(process.env.COOLDOWN_DURATION || '10', 10);
const RANDOM_FACT_INTERVAL = 5 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 399;

if (!OPENAI_API_KEY) {
    console.error('No OPENAI_API_KEY found. Please set it as an environment variable.');
}

// === CHARGEMENT DU CONTEXTE ===
let fileContext = '';
try {
    fileContext = fs.readFileSync('./file_context.txt', 'utf8');
} catch {
    console.warn('file_context.txt not found, using empty context.');
}
const messages = [{ role: 'system', content: fileContext }];

// === INITIALISATION DES OBJETS ===
const commandNames = COMMAND_NAME.split(',').map(cmd => cmd.trim().toLowerCase());
const channels = CHANNELS.split(',').map(c => c.trim());
const bot = new TwitchBot(TWITCH_USER, TWITCH_AUTH, channels, OPENAI_API_KEY, ENABLE_TTS);
const openaiOps = new OpenAIOperations(fileContext, OPENAI_API_KEY, MODEL_NAME, HISTORY_LENGTH);

let lastResponseTime = 0;

// === BOT TWITCH ===
bot.onConnected((addr, port) => {
    console.log(`* Connected to ${addr}:${port}`);
    channels.forEach(c => console.log(`* Joined channel: ${c}`));
});
bot.onDisconnected(reason => console.log(`Disconnected: ${reason}`));

await bot.connect();

bot.onMessage(async (channel, user, message, self) => {
    if (self) return;

    const now = Date.now();
    const timeSinceLast = (now - lastResponseTime) / 1000;

    const isGPTCommand = commandNames.some(cmd => message.toLowerCase().startsWith(cmd));
    const isFactCommand = message.toLowerCase().startsWith('!fact');

    if (ENABLE_CHANNEL_POINTS && user['custom-reward-id']) {
        if (timeSinceLast < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${(COOLDOWN_DURATION - timeSinceLast).toFixed(1)} seconds.`);
            return;
        }
        lastResponseTime = now;
        handleGPT(message, user, channel);
        return;
    }

    if (isGPTCommand) {
        if (timeSinceLast < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${(COOLDOWN_DURATION - timeSinceLast).toFixed(1)} seconds.`);
            return;
        }
        lastResponseTime = now;

        let text = message.slice(COMMAND_NAME.length).trim();
        if (SEND_USERNAME) {
            text = `Message from user ${user.username}: ${text}`;
        }

        handleGPT(text, user, channel);
        return;
    }

    if (isFactCommand) {
        sendRandomUselessFact(channel);
    }
});

// === GPT HANDLER ===
async function handleGPT(prompt, user, channel) {
    try {
        const response = await openaiOps.make_openai_call(prompt);
        const finalResponse = addRandomEmoteToEnd(formatEmotes(response));

        if (finalResponse.length > MAX_MESSAGE_LENGTH) {
            const parts = finalResponse.match(new RegExp(`.{1,${MAX_MESSAGE_LENGTH}}`, 'g'));
            parts.forEach((msg, i) => setTimeout(() => bot.say(channel, msg), i * 150));
        } else {
            bot.say(channel, finalResponse);
        }

        if (ENABLE_TTS) {
            const ttsAudioUrl = await bot.sayTTS(channel, response, user);
            notifyFileChange(ttsAudioUrl);
        }
    } catch (err) {
        console.error('GPT error:', err);
    }
}

// === ENVOI D’UN FAIT INUTILE ===
function sendRandomUselessFact(channel) {
    const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';

    https.get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
            try {
                const parsed = JSON.parse(data);
                const fact = parsed.text;

                const prompt = `Traduis ce fait inutile en français, sans ajouter de texte autour : "${fact}"`;
                const translated = await openaiOps.make_openai_call(prompt);

                bot.say(channel, `🤯 Fait inutile : ${translated}`);
            } catch (err) {
                console.error('Erreur lors de la récupération ou traduction du fact :', err);
                bot.say(channel, "Erreur pendant la génération du fact. Essaie plus tard !");
            }
        });
    }).on('error', err => {
        console.error('Erreur HTTPS:', err);
    });
}

// === FACT AUTO TIMER ===
setInterval(() => {
    channels.forEach(channel => sendRandomUselessFact(channel));
}, RANDOM_FACT_INTERVAL);

// === EXPRESS SETUP ===
app.set('view engine', 'ejs');
app.use(cors());
app.use(express.json({ extended: true, limit: '1mb' }));
app.use('/public', express.static('public'));

app.all('/', (req, res) => res.render('pages/index'));

app.get('/gpt/:text', async (req, res) => {
    const text = req.params.text;
    try {
        let answer = '';

        if (GPT_MODE === 'CHAT') {
            answer = await openaiOps.make_openai_call(text);
        } else if (GPT_MODE === 'PROMPT') {
            const prompt = `${fileContext}\n\nUser: ${text}\nAgent:`;
            answer = await openaiOps.make_openai_call_completion(prompt);
        } else {
            throw new Error('Invalid GPT_MODE. Must be CHAT or PROMPT.');
        }

        res.send(answer);
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).send('Error generating response.');
    }
});

// === WEBSOCKET SYNC ===
const wss = expressWsInstance.getWss();
wss.on('connection', ws => {
    ws.on('message', () => {});
});
function notifyFileChange(data) {
    wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ updated: true, tts: data }));
        }
    });
}

// === LANCEMENT DU SERVEUR ===
const server = app.listen(3000, () => {
    console.log('✅ Serveur lancé sur le port 3000');
});
