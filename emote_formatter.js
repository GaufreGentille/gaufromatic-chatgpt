// emote_formatter.js

export function formatEmotes(text) {
    // Liste d'emotes supportées sur la chaîne
    const emoteList = [
        'Kappa',
        'OMEGALUL',
        'PogChamp',
        'LUL',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
        'gaufre1Ffee',
        'gaufre1Justice',
        'gaufre1Gunner',
        'gaufre1Wut',
        'bongoTap',
        'catJAM',
        'catKISS',
        'HUH',
        'Jigglin',
        'PogTasty',
        'PETTHEMODS',
        'pedro',
        'OMEGALUL',
        'muted',
        'LICKA',
        'POLICE',
        'RobustoAPT',
        'ThisIsFine',
        'VIBE',
        'Joel',        
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
        'LUL',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
        'gaufre1Ffee',
        'gaufre1Justice',
        'gaufre1Gunner',
        'gaufre1Wut',
        'bongoTap',
        'catJAM',
        'catKISS',
        'HUH',
        'Jigglin',
        'PogTasty',
        'PETTHEMODS',
        'pedro',
        'OMEGALUL',
        'muted',
        'LICKA',
        'POLICE',
        'RobustoAPT',
        'ThisIsFine',
        'VIBE',
        'Joel',        
        'gachiHYPER'
    ];
    
    // Supprimer ponctuation finale s'il y en a
    text = text.trim().replace(/[.!?]+$/, '');

    // Ajouter une emote random à la fin
    const randomEmote = emoteList[Math.floor(Math.random() * emoteList.length)];
    return `${text} ${randomEmote}`;
    
    // Remplacer :emote: par emote
    emoteList.forEach(emote => {
        const regex = new RegExp(`:${emote}:`, 'gi');
        text = text.replace(regex, emote);
    });

    return text;
}
