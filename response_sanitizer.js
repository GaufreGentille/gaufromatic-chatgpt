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

    // 1. Supprimer les noms genre "winking-face-with-tongue"
    text = text.replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/gi, '');

    // 2. Supprimer les :emote: non autorisées
    text = text.replace(/:([a-zA-Z0-9_]+):/g, (match, emote) => {
        return allowedEmotes.includes(emote) ? emote : '';
    });

    // 3. Supprimer tous les emojis Unicode (sauf si tu veux les garder)
    // Source : https://stackoverflow.com/questions/10992921/how-to-remove-emoji-code-using-javascript
    text = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])/g, '');

    return text.trim();
}
