// emote_formatter.js

export function formatEmotes(text) {
    // Liste d'emotes supportées sur la chaîne
    const emoteList = [
        'Kappa',
        'OMEGALUL',
        'PogChamp',
        'LUL',
        'PepeHands',
        'BibleThump',
        '4Head',
        'FeelsStrongMan',
        'KEKW',
        'monkaS',
        'gaufre1117',
        'gaufre1Ah',
        'gaufre1Arjen',
        'gaufre1Dab',
        'gaufre1Dance',
        'gaufre1Ffee',
        'gaufre1Muai',
        'gaufre1Miam',
        'gaufre1Mdr',
        'gaufre1Justice',
        'gaufre1Gunner',
        'gaufre1Grumpy',
        'gaufre1Pirate',
        'gaufre1Pxl',
        'gaufre1Spin',
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

    // Remplacer :emote: par emote
    emoteList.forEach(emote => {
        const regex = new RegExp(`:${emote}:`, 'gi');
        text = text.replace(regex, emote);
    });

    return text;
}
