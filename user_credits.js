import fs from 'fs';

const CREDITS_FILE = './user_credits.json';
let credits = {};

// Charger les crédits depuis le fichier JSON
export function loadCredits() {
  try {
    if (fs.existsSync(CREDITS_FILE)) {
      credits = JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Erreur lors du chargement des crédits :', err);
    credits = {};
  }
}

// Sauvegarder les crédits dans le fichier JSON
export function saveCredits() {
  try {
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
  } catch (err) {
    console.error('Erreur lors de la sauvegarde des crédits :', err);
  }
}

// Récupérer le solde d’un utilisateur
export function getCredits(username) {
  if (!credits[username]) credits[username] = 100; // Valeur par défaut
  return credits[username];
}

// Modifier les crédits d’un utilisateur (+/-)
export function changeCredits(username, amount) {
  if (!credits[username]) credits[username] = 100;
  credits[username] += amount;
  saveCredits();
  return credits[username];
}

// Définir les crédits manuellement
export function setCredits(username, amount) {
  credits[username] = amount;
  saveCredits();
}

// Obtenir le classement (top X)
export function getTopCredits(limit = 5) {
  return Object.entries(credits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}
