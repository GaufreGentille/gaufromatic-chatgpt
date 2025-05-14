// Import tmi.js module
import tmi from 'tmi.js';
import OpenAI from 'openai';
import { promises as fsPromises } from 'fs';

export class TwitchBot {
  constructor(bot_username, oauth_token, channels, openai_api_key, enable_tts) {
    this.channels = channels;
    this.client = new tmi.client({
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: bot_username,
        password: oauth_token
      },
      channels: this.channels
    });
    this.openai = new OpenAI({ apiKey: openai_api_key });
    this.enable_tts = enable_tts;

    // Événements Twitch : sub, resub, cheer
    this.client.on('subscription', (channel, username, method, message, userstate) => {
      this.say(channel, ` Merci ${username} pour ton abonnement ! Tu viens de faire pleurer une gaufre.`);
    });

    this.client.on('resub', (channel, username, months, message, userstate, methods) => {
      this.say(channel, ` Merci ${username} pour ${months} mois de soutien ! Tu dois aimer les gaufres au suk.`);
    });

    this.client.on('cheer', (channel, userstate, message) => {
      const bits = userstate.bits;
      const user = userstate.username;
      this.say(channel, `✨ ${user} a lâché ${bits} bits ! C’est pas des miettes !`);
    });
  }

  addChannel(channel) {
    if (!this.channels.includes(channel)) {
      this.channels.push(channel);
      this.client.join(channel);
    }
  }

  connect() {
    (async () => {
      try {
        await this.client.connect();
      } catch (error) {
        console.error(error);
      }
    })();
  }

  disconnect() {
    (async () => {
      try {
        await this.client.disconnect();
      } catch (error) {
        console.error(error);
      }
    })();
  }

  onMessage(callback) {
    this.client.on('message', callback);
  }

  onConnected(callback) {
    this.client.on('connected', callback);
  }

  onDisconnected(callback) {
    this.client.on('disconnected', callback);
  }

  say(channel, message) {
    (async () => {
      try {
        await this.client.say(channel, message);
      } catch (error) {
        console.error(error);
      }
    })();
  }

  async sayTTS(channel, text, userstate) {
    if (this.enable_tts !== 'true') return;
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      const filePath = './public/file.mp3';
      await fsPromises.writeFile(filePath, buffer);
      return filePath;
    } catch (error) {
      console.error('Error in sayTTS:', error);
    }
  }

  whisper(username, message) {
    (async () => {
      try {
        await this.client.whisper(username, message);
      } catch (error) {
        console.error(error);
      }
    })();
  }

  ban(channel, username, reason) {
    (async () => {
      try {
        await this.client.ban(channel, username, reason);
      } catch (error) {
        console.error(error);
      }
    })();
  }

  unban(channel, username) {
    (async () => {
      try {
        await this.client.unban(channel, username);
      } catch (error) {
        console.error(error);
      }
    })();
  }

  clear(channel) {
    (async () => {
      try {
        await this.client.clear(channel);
      } catch (error) {
        console.error(error);
      }
    })();
  }

  color(channel, color) {
    (async () => {
      try {
        await this.client.color(channel, color);
      } catch (error) {
        console.error(error);
      }
    })();
  }

  commercial(channel, seconds) {
    (async () => {
      try {
        await this.client.commercial(channel, seconds);
      } catch (error) {
        console.error(error);
      }
    })();
  }
}
