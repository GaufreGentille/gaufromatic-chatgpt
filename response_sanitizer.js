// response_sanitizer.js

export function sanitizeGPTResponse(text) {
    const allowedEmotes = [
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

    // Supprimer les mots avec tirets suspects (genre "winking-face", "smiling-cat")
    text = text.replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/gi, '');

    // Supprimer les :emote: non autorisées
    text = text.replace(/:([a-zA-Z0-9_]+):/g, (match, emote) => {
        return allowedEmotes.includes(emote) ? emote : '';
    });

    return text.trim();
}

