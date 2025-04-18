// response_sanitizer.js

export function sanitizeGPTResponse(text) {
    const allowedEmotes = [
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

    // Supprimer les mots avec tirets suspects (genre "winking-face", "smiling-cat")
    text = text.replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/gi, '');

    // Supprimer les :emote: non autorisées
    text = text.replace(/:([a-zA-Z0-9_]+):/g, (match, emote) => {
        return allowedEmotes.includes(emote) ? emote : '';
    });

    return text.trim();
}

