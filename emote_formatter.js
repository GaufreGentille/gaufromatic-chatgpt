// emote_formatter.js

export function formatEmotes(text) {
    const emoteList = [
        'Kappa',
        'OMEGALUL',
        'PogChamp',
        'gaufre1Wut',
        'gaufre1Justice',
        'gaufre1Ffee',
        'gaufre1Gunner',
        'gaufre1Pirate',
        'LUL',
        'PepeHands',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
        'gachiHYPER'
    ];

    emoteList.forEach(emote => {
        const regex = new RegExp(`:${emote}:`, 'gi');
        text = text.replace(regex, emote);
    });

    return text;
}

export function addRandomEmoteToEnd(text) {
    const emoteList = [
        'Kappa',
        'OMEGALUL',
        'PogChamp',
        'gaufre1Wut',
        'gaufre1Justice',
        'gaufre1Ffee',
        'gaufre1Gunner',
        'gaufre1Pirate',
        'LUL',
        'PepeHands',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
        'gachiHYPER'
    ];

    // Supprimer la ponctuation à la fin
    text = text.trim().replace(/[.!?]+$/, '');

    // Ajouter une emote aléatoire
    const randomEmote = emoteList[Math.floor(Math.random() * emoteList.length)];
    return `${text} ${randomEmote}`;
}
