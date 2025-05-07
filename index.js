// index.js
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

// Start keep alive cron job
job.start();

const app = express();
const expressWsInstance = expressWs(app);

app.set('view engine', 'ejs');
app.use(cors());

// Load environment variables
const GPT_MODE = process.env.GPT_MODE || 'CHAT';
const HISTORY_LENGTH = process.env.HISTORY_LENGTH || 5;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const TWITCH_USER = process.env.TWITCH_USER || 'oSetinhasBot';
const TWITCH_AUTH = process.env.TWITCH_AUTH || 'oauth:xxx';
const COMMAND_NAME = process.env.COMMAND_NAME || '!gpt';
const CHANNELS = process.env.CHANNELS || 'oSetinhas,jones88';
const SEND_USERNAME = process.env.SEND_USERNAME || 'true';
const ENABLE_TTS = process.env.ENABLE_TTS || 'false';
const ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS || 'false';
const COOLDOWN_DURATION = Number.isFinite(parseInt(process.env.COOLDOWN_DURATION)) ? parseInt(process.env.COOLDOWN_DURATION, 10) : 10;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

if (!OPENAI_API_KEY) {
    console.error('No OPENAI_API_KEY found. Please set it as an environment variable.');
}

const commandNames = COMMAND_NAME.split(',').map(cmd => cmd.trim().toLowerCase());
const channels = CHANNELS.split(',').map(channel => channel.trim());
const maxLength = 399;
let fileContext = '';
let lastResponseTime = 0;
let accessToken = '';
let isLive = false;

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

await bot.connect();

async function fetchTwitchAccessToken() {
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    accessToken = data.access_token;
}

async function checkStreamStatus() {
    if (!accessToken) await fetchTwitchAccessToken();

    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=gaufregentille`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const data = await res.json();
    isLive = data.data && data.data.length > 0;
}

setInterval(checkStreamStatus, 60000);
checkStreamStatus();

const RANDOM_FACT_INTERVAL = 20 * 60 * 1000;
setInterval(() => {
    if (isLive) sendRandomUselessFact();
}, RANDOM_FACT_INTERVAL);

function sendRandomUselessFact() {
    const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';
    https.get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
            try {
                const parsed = JSON.parse(data);
                const fact = parsed.text;
                const prompt = `Traduis ce fait inutile en français, sans ajouter de texte autour : "${fact}"`;
                const translatedFact = await openaiOps.make_openai_call(prompt);
                channels.forEach(channel => {
                    bot.say(channel, `🤯 Fait inutile : ${translatedFact}`);
                });
            } catch (error) {
                console.error('Erreur de parsing JSON ou GPT:', error);
            }
        });
    }).on('error', err => console.error('Erreur HTTPS:', err));
}

bot.onMessage(async (channel, user, message, self) => {
    if (self) return;

    const currentTime = Date.now();
    const elapsedTime = (currentTime - lastResponseTime) / 1000;

    const isFactCommand = message.toLowerCase().startsWith('!fact');

    if (isFactCommand) {
        const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const parsed = JSON.parse(data);
                    const fact = parsed.text;
                    const prompt = `Traduis ce fait inutile en français, sans ajouter de texte autour : "${fact}"`;
                    const translatedFact = await openaiOps.make_openai_call(prompt);
                    bot.say(channel, `🤯 Fait inutile : ${translatedFact}`);
                } catch (error) {
                    console.error('Erreur de parsing JSON ou GPT:', error);
                }
            });
        }).on('error', err => console.error('Erreur HTTPS:', err));
        return;
    }

    const command = commandNames.find(cmd => message.toLowerCase().startsWith(cmd));
    if (command) {
        if (elapsedTime < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${COOLDOWN_DURATION - elapsedTime.toFixed(1)} seconds.`);
            return;
        }
        lastResponseTime = currentTime;
        let text = message.slice(command.length).trim();
        if (SEND_USERNAME === 'true') {
            text = `Message from user ${user.username}: ${text}`;
        }

        const response = await openaiOps.make_openai_call(text);
        let formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
        bot.say(channel, formattedResponse);
    }
});

app.use(express.json({ extended: true, limit: '1mb' }));
app.use('/public', express.static('public'));

app.all('/', (req, res) => {
    res.render('pages/index');
});

const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});

const expressWss = expressWsInstance.getWss();
expressWss.on('connection', ws => {
    ws.on('message', message => {});
});
