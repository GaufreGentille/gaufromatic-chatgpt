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

job.start();

const app = express();
const expressWsInstance = expressWs(app);

app.set('view engine', 'ejs');
app.use(cors());

const GPT_MODE = process.env.GPT_MODE || 'CHAT';
const HISTORY_LENGTH = process.env.HISTORY_LENGTH || 5;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const TWITCH_USER = process.env.TWITCH_USER || 'oSetinhasBot';
const TWITCH_AUTH = process.env.TWITCH_AUTH || 'oauth:xxx';
const COMMAND_NAME = process.env.COMMAND_NAME || '!gpt';
const CHANNELS = process.env.CHANNELS || 'gaufregentille';
const SEND_USERNAME = process.env.SEND_USERNAME || 'true';
const ENABLE_TTS = process.env.ENABLE_TTS || 'false';
const ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS || 'false';
const COOLDOWN_DURATION = Number.isFinite(parseInt(process.env.COOLDOWN_DURATION)) ? parseInt(process.env.COOLDOWN_DURATION, 10) : 10;

const FACT_COOLDOWN_DURATION = 20 * 60 * 1000;
let lastFactTime = 0;

const USER_REACTION_COOLDOWN = 120 * 1000; // 2 minutes
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

const trackedUsers = ['garryaulait', 'pandibullee', 'gaufregentille'];

bot.onMessage(async (channel, user, message, self) => {
    if (self) return;

    const currentTime = Date.now();
    const elapsedTime = (currentTime - lastResponseTime) / 1000;
    const lowerMessage = message.toLowerCase();

    // ----- Commande !conseil -----
    if (lowerMessage.startsWith('!conseil')) {
        const gptPrompt = `Donne un conseil inutile, absurde mais bienveillant, comme si tu étais Gaufromatic, un bot sarcastique de Twitch.`;
        const response = await openaiOps.make_openai_call(gptPrompt);
        const formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
        bot.say(channel, formattedResponse);
        return;
    }

    // ----- Commande !fact -----
    if (lowerMessage.startsWith('!fact')) {
        fetchAndSendRandomFact(channel);
        return;
    }
// Déclaration des crédits des utilisateurs et du cooldown
const userCredits = {}; // Crédits des utilisateurs
const slotCooldown = {}; // Cooldown de la commande !slot

// ----- Commande !slot -----
if (lowerMessage.startsWith('!slot')) {
    const now = Date.now();
    const cooldownTime = 60 * 1000; // 1 minute de cooldown entre chaque utilisation

    // Vérifier le cooldown pour cette commande
    if (slotCooldown[user.username] && now - slotCooldown[user.username] < cooldownTime) {
        const timeLeft = ((cooldownTime - (now - slotCooldown[user.username])) / 1000).toFixed(1);
        bot.say(channel, `${user.username}, tu dois attendre encore ${timeLeft} secondes avant de pouvoir jouer à nouveau !`);
        return;
    }

    // Mise à jour du cooldown
    slotCooldown[user.username] = now;

    // Résultat de la machine à sous
    const symbols = ['🍕', '🍌', '💀', '🧀', '🥒', '🔥', '🤡', '🤑', '💩'];
    const slot1 = symbols[Math.floor(Math.random() * symbols.length)];
    const slot2 = symbols[Math.floor(Math.random() * symbols.length)];
    const slot3 = symbols[Math.floor(Math.random() * symbols.length)];

    const result = `${slot1} | ${slot2} | ${slot3}`;
    let outcome;
    let creditsChange = 0;

    // Déterminer le résultat
    if (slot1 === slot2 && slot2 === slot3) {
        outcome = 'jackpot';
        creditsChange = 50; // Gagner des crédits pour un jackpot
    } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
        outcome = 'partial';
        creditsChange = 10; // Gagner des crédits pour une petite victoire
    } else {
        outcome = 'loss';
        creditsChange = -10; // Perdre des crédits pour un échec
    }

    // Mettre à jour les crédits
    if (!userCredits[user.username]) {
        userCredits[user.username] = 100; // Crédit initial de 100
    }

    userCredits[user.username] += creditsChange;

    // Réaction du PNJ Dealer (GPT)
    const prompt = `Tu es Gaufromatic, un bot sarcastique de Twitch, jouant le rôle d'un dealer de casino. Voici le résultat du joueur : ${result} (résultat : ${outcome}). Réagis de façon sarcastique et amusante, tout en commentant le changement de crédits du joueur (+${creditsChange} crédits ou -${creditsChange} crédits). Garde un ton absurde mais bienveillant.`;

    try {
        const gptReaction = await openaiOps.make_openai_call(prompt);
        const finalMessage = `🎰 ${result} → ${formatEmotes(gptReaction)}\n${user.username}, tu as maintenant ${userCredits[user.username]} crédits.`;
        bot.say(channel, addRandomEmoteToEnd(finalMessage));
    } catch (error) {
        console.error('Erreur GPT !slot :', error);
        bot.say(channel, `🎰 ${result} → Dommage, même le bot a buggé devant tant de nullité. 😵 Tu as toujours ${userCredits[user.username]} crédits.`);
    }

    return;
}

// ----- Commande !crédits -----
if (lowerMessage.startsWith('!crédits')) {
    if (!userCredits[user.username]) {
        userCredits[user.username] = 100; // Crédit initial si non défini
    }
    bot.say(channel, `${user.username}, tu as actuellement ${userCredits[user.username]} crédits.`);
    return;
}

// ----- Commande !classement -----
if (lowerMessage.startsWith('!classement')) {
    const sortedUsers = Object.entries(userCredits)
        .sort(([, a], [, b]) => b - a) // Trie par crédit, du plus grand au plus petit
        .slice(0, 5); // Limite aux 5 premiers

    let rankingMessage = '🏆 **Classement des joueurs (Top 5)** :\n';
    sortedUsers.forEach(([username, credits], index) => {
        rankingMessage += `#${index + 1} ${username} : ${credits} crédits\n`;
    });

    bot.say(channel, rankingMessage);
    return;
}

// ----- Commande pour ajouter des crédits (Seul GaufreGentille peut le faire) -----
if (lowerMessage.startsWith('!ajoutercredits') && user.username.toLowerCase() === 'gaufregentille') {
    const targetUser = lowerMessage.split(' ')[1];
    const amount = parseInt(lowerMessage.split(' ')[2]);

    if (!targetUser || isNaN(amount)) {
        bot.say(channel, 'Usage: !ajoutercredits <utilisateur> <montant>');
        return;
    }

    if (!userCredits[targetUser]) {
        userCredits[targetUser] = 0; // Crédits à 0 si l'utilisateur n'existe pas
    }

    userCredits[targetUser] += amount;

    bot.say(channel, `${user.username} a ajouté ${amount} crédits à ${targetUser}. ${targetUser} a maintenant ${userCredits[targetUser]} crédits.`);
    return;
}

    // ----- Réaction à certains pseudos -----
    if (trackedUsers.includes(user.username.toLowerCase())) {
    const now = Date.now();
    const lastTime = lastUserReactionTime[user.username] || 0;

    if (now - lastTime < USER_REACTION_COOLDOWN) return;
    lastUserReactionTime[user.username] = now;

        const prompt = `Tu es Gaufromatic, un bot sarcastique de Twitch. Réagis à ce message venant de ${user.username} : "${message}". Garde un ton second degré, drôle, un peu absurde, mais bienveillant.`;
        const response = await openaiOps.make_openai_call(prompt);
        const formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
        bot.say(channel, formattedResponse);
        return;
    }

    // ----- Commande via points de chaîne -----
    if (ENABLE_CHANNEL_POINTS === 'true' && user['custom-reward-id']) {
        if (elapsedTime < COOLDOWN_DURATION) {
            bot.say(channel, `Cooldown active. Please wait ${COOLDOWN_DURATION - elapsedTime.toFixed(1)} seconds.`);
            return;
        }
        lastResponseTime = currentTime;
        const response = await openaiOps.make_openai_call(message);
        const formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
        bot.say(channel, formattedResponse);
        return;
    }

    // ----- Commande GPT classique (ex: !gpt) -----
    const command = commandNames.find(cmd => lowerMessage.startsWith(cmd));
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
            const formattedResponse = addRandomEmoteToEnd(formatEmotes(response));
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
                const fact = parsed.text;
                const prompt = `Traduis ce fait inutile en français, sans ajouter de texte autour : "${fact}"`;
                const translatedFact = await openaiOps.make_openai_call(prompt);
                bot.say(channel, `🤯 Fait inutile : ${translatedFact}`);
            } catch (error) {
                console.error('Erreur de parsing JSON ou GPT:', error);
            }
        });
    }).on('error', err => console.error('Erreur HTTPS:', err));
}
