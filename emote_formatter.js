// emote_formatter.js

export function formatEmotes(text) {
    // Liste d'emotes supportées sur la chaîne
    const emoteList = [
        'Kappa',
        'OMEGALUL',
        'PogChamp',
        'gaufreLol',
        'LUL',
        'PepeHands',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
        'gachiHYPER'
    ];

    // Remplacer :emote: par emote
    emoteList.forEach(emote => {
        const regex = new RegExp(`:${emote}:`, 'gi');
        text = text.replace(regex, emote);
    });

    return text;
}
