// emote_formatter.js

export function formatEmotes(text) {
    const emoteList = [
        'Kappa',
        'bongoTap',
        'catJAM',
        'catKISS',
        'HUH',
        'Jigglin',
        'LICKA',
        'muted',
        'pedro',
        'PETTHEMODS',
        'PogTasty',
        'POLICE',
        'RobustoAPT',
        'ThisIsFine',
        'VIBE',
        'Joel', 
        'OMEGALUL',
        'PogChamp',
        'gaufre1Wut',
        'gaufre1Justice',
        'gaufre1Ffee',
        'gaufre1Gunner',
        'gaufre1Pirate',
        'LUL',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
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
        'bongoTap',
        'catJAM',
        'catKISS',
        'HUH',
        'Jigglin',
        'LICKA',
        'muted',
        'pedro',
        'PETTHEMODS',
        'PogTasty',
        'POLICE',
        'RobustoAPT',
        'ThisIsFine',
        'VIBE',
        'Joel', 
        'OMEGALUL',
        'PogChamp',
        'gaufre1Wut',
        'gaufre1Justice',
        'gaufre1Ffee',
        'gaufre1Gunner',
        'gaufre1Pirate',
        'LUL',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
    ];

    // Supprimer la ponctuation à la fin
    text = text.trim().replace(/[.!?]+$/, '');

    // Ajouter une emote aléatoire
    const randomEmote = emoteList[Math.floor(Math.random() * emoteList.length)];
    return `${text} ${randomEmote}`;
}
