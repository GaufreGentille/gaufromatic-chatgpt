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

const RANDOM_FACT_INTERVAL = 5 * 60 * 1000;
setInterval(sendRandomUselessFact, RANDOM_FACT_INTERVAL);

bot.onMessage(async (channel, user, message, self) => {
    if (self) return;

    const currentTime = Date.now();
    const elapsedTime = (currentTime - lastResponseTime) / 1000;

    if (ENABLE_CHANNEL_POINTS === 'true' && user['custom-reward-id']) {
        if (elapsedTime < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${COOLDOWN_DURATION - elapsedTime.toFixed(1)} seconds.`);
            return;
        }
        lastResponseTime = currentTime;
        const response = await openaiOps.make_openai_call(message);
        let formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
        bot.say(channel, formattedResponse);
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
        if (response.length > maxLength) {
            const messages = response.match(new RegExp(`.{1,${maxLength}}`, 'g'));
            messages.forEach((msg, index) => {
                setTimeout(() => bot.say(channel, msg), 150 * index);
            });
        } else {
            let formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
            bot.say(channel, formattedResponse);
        }

        if (ENABLE_TTS === 'true') {
            try {
                const ttsAudioUrl = await bot.sayTTS(channel, response, user);
                notifyFileChange(ttsAudioUrl);
            } catch (error) {
                console.error('TTS Error:', error);
            }
        }
    }
});

app.ws('/check-for-updates', (ws, req) => {
    ws.on('message', message => {});
});

const messages = [{ role: 'system', content: fileContext }];

app.use(express.json({ extended: true, limit: '1mb' }));
app.use('/public', express.static('public'));

app.all('/', (req, res) => {
    res.render('pages/index');
});

if (GPT_MODE === 'CHAT') {
    fs.readFile('./file_context.txt', 'utf8', (err, data) => {
        if (!err) messages[0].content = data;
    });
} else {
    fs.readFile('./file_context.txt', 'utf8', (err, data) => {
        if (!err) fileContext = data;
    });
}

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

const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});

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

function sendRandomUselessFact() {
    const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';

    https.get(url, res => {
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
            try {
                // Tente de parser la réponse
                const parsed = JSON.parse(data);

                // Vérifie que le champ texte est bien présent
                if (!parsed.text) {
                    throw new Error("Le champ 'text' est manquant dans la réponse.");
                }

                // Génère le prompt sans guillemets autour du texte
                const prompt = `Traduis ce fait inutile en français, sans ajouter de texte autour : ${parsed.text}`;

                const translatedFact = await openaiOps.make_openai_call(prompt);

                channels.forEach(channel => {
                    bot.say(channel, `🤯 Fait inutile : ${translatedFact}`);
                });
            } catch (error) {
                console.error('Erreur de parsing JSON ou GPT:', error);
                console.error('Réponse brute :', data);
            }
        });
    }).on('error', err => {
        console.error('Erreur HTTPS:', err);
    });
}
