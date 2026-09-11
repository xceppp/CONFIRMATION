# Confirmation d'inscription

Application française pour que les **agents** confirment **une seule filière** par code Massar, avec **Google Sheets** comme base partagée. Déployable sur **Vercel**.

## Filières

| Code | Nom |
|------|-----|
| DWM | Développement Web Et Multimédia |
| FBA | Finance, Banque et Assurance |
| GC | Génie Civil |
| GETE | Génie Electrique et Technologie Emergentes |
| GI | Génie Informatique |
| GTE | Génie Thermique et Energétique |
| IATE | Intelligence Artificielle et technologies émergentes |
| PMD | Publicité et Marketing Digital |
| TCC | Techniques de Commercialisation et de Communication |
| TM | Techniques de Management |

> Note : dans votre liste de codes, `TCC` apparaissait deux fois ; **GC** a été utilisé pour **Génie Civil**. Dites-moi si le code exact est différent.

## Feuilles Google Sheets

Créez un Google Sheet vide, puis partagez-le en **Éditeur** avec l’email du compte de service.

L’app créera automatiquement :

1. **Etudiants** — listes fusionnées (`FiliereCode`, `Filiere`, + colonnes CSV)
2. **Confirmations** — ligne complète confirmée + `DateConfirmation`

Un même `Code` peut avoir plusieurs lignes dans **Etudiants** (une par filière). Une seule confirmation est autorisée.

## Configuration Google (une fois)

1. [Google Cloud Console](https://console.cloud.google.com/) → créer un projet
2. Activer **Google Sheets API**
3. **Compte de service** → créer → télécharger la clé JSON
4. Copier `client_email` et `private_key`
5. Ouvrir votre Sheet → **Partager** → coller l’email du compte de service → rôle **Éditeur**
6. Copier l’ID du Sheet (dans l’URL : `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`)

## Variables d’environnement

Copier `.env.example` → `.env.local` :

```env
APP_PASSWORD=votre-mot-de-passe
GOOGLE_SHEET_ID=...
GOOGLE_CLIENT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Sur Vercel : Project → Settings → Environment Variables (mêmes clés).

## Lancer en local

```bash
npm install
npm run dev
```

- Agents : http://localhost:3000  
- Admin (import CSV) : http://localhost:3000/admin  
- Login : http://localhost:3000/login  

## Usage

1. **Admin** → importer chaque CSV en choisissant la filière (ex. FBA aujourd’hui, les 9 autres plus tard)
2. **Agent** → code Massar → voir les filières → confirmer **une** seule
3. Tout arrive dans la feuille **Confirmations** (plus de fusion manuelle)

## Déploiement Vercel

```bash
git init
git add .
git commit -m "Plateforme confirmation filieres"
```

Puis importer le repo sur Vercel, ajouter les variables d’environnement, déployer. Partager le lien + le mot de passe aux agents.
