// emote_formatter.js

export function formatEmotes(text) {
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
        'gaufreLol',
        'LUL',
        'PepeHands',
        'FeelsStrongMan',
        'KEKW'
    ];

    // Supprimer ponctuation finale s'il y en a
    text = text.trim().replace(/[.!?]+$/, '');

    // Ajouter une emote random à la fin
    const randomEmote = emoteList[Math.floor(Math.random() * emoteList.length)];
    return `${text} ${randomEmote}`;
}

    
    // Remplacer :emote: par emote
    emoteList.forEach(emote => {
        const regex = new RegExp(`:${emote}:`, 'gi');
        text = text.replace(regex, emote);
    });

    return text;
}
