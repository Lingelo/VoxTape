# Sourdine

<p align="center">
  <img src="assets/icon.icns" alt="Sourdine Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Transcription de réunions et prise de notes assistée par IA — 100% locale, 100% privée</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-14.2%2B-blue?logo=apple" alt="macOS">
  <img src="https://img.shields.io/badge/Electron-34-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Angular-21-DD0031?logo=angular" alt="Angular">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs" alt="NestJS">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

Application macOS pour la transcription en temps réel de vos réunions (Teams, Meet, Zoom...) avec génération automatique de résumés et points clés. **Tout fonctionne localement** — aucune API externe, aucune donnée envoyée sur le cloud.

## Fonctionnalités

- **Transcription temps réel** — Capture simultanée micro + audio système
- **IA locale** — Résumé, points clés, actions via Mistral 7B
- **Chat contextuel** — Questions sur vos réunions passées
- **Recherche full-text** — SQLite FTS5
- **Export** — Markdown ou texte brut
- **100% hors-ligne** — Aucune connexion requise après téléchargement des modèles

## Prérequis

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| **macOS** | 14.2 (Sonoma) | 15+ (Sequoia) |
| **RAM** | 16 Go | 32 Go |
| **Stockage** | 10 Go | 20 Go |
| **Processeur** | Apple Silicon (M1) | M2/M3/M4 |

> La capture audio système nécessite macOS 14.2+ (ScreenCaptureKit). Les Mac Intel ne sont pas supportés.

## Installation (Utilisateurs)

1. Télécharger le DMG depuis [Releases](https://github.com/Lingelo/Sourdine/releases)
2. Glisser Sourdine dans Applications

### Contournement Gatekeeper

L'application n'est pas signée. macOS affichera "application endommagée". Exécutez :

```bash
xattr -cr /Applications/Sourdine.app
```

### Premier lancement

1. Lancer Sourdine
2. L'assistant télécharge les modèles IA (~5 Go)
3. Autoriser l'accès micro + enregistrement d'écran dans Préférences Système

## Développement

### Prérequis

- **Node.js 20+** (recommandé : [nvm](https://github.com/nvm-sh/nvm))
- **Rust** (optionnel, pour la capture audio système)
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

### Démarrage rapide

```bash
# Cloner et installer
git clone https://github.com/Lingelo/Sourdine.git
cd Sourdine
npm install

# Télécharger les modèles IA
npm run download-model       # STT (~640 Mo)
npm run download-llm-model   # LLM (~4.4 Go)

# Lancer en mode dev (hot-reload)
npm run dev
```

L'application s'ouvre automatiquement. Angular tourne sur `http://localhost:4200`.

### Commandes

| Commande | Description |
|----------|-------------|
| `npm run dev` | Mode développement avec hot-reload |
| `npm test` | Lancer les tests (Vitest) |
| `npm run build` | Build de production |
| `npm run package` | Créer Sourdine.app |
| `npm run make` | Créer DMG + ZIP |
| `npm run build:native` | Compiler le module Rust |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NestJS Backend                                       │  │
│  │  AudioModule → SttModule → stt-worker (sherpa-onnx)   │  │
│  │  LlmModule ────────────→ llm-worker (node-llama-cpp)  │  │
│  │  DatabaseModule (SQLite) | ConfigModule | ExportModule│  │
│  └───────────────────────────────────────────────────────┘  │
│  IPC Hub (contextBridge)                                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│  Renderer Process (Angular 21 SPA)                          │
│  SessionService | AudioCaptureService | LlmService          │
└─────────────────────────────────────────────────────────────┘
```

### Structure Nx

| Projet | Stack | Description |
|--------|-------|-------------|
| `apps/electron-shell` | Electron + Vite | Process principal + workers STT/LLM |
| `apps/renderer` | Angular 21 | Interface utilisateur |
| `libs/backend` | NestJS 11 | Services (audio, STT, LLM, DB, export) |
| `libs/shared-types` | TypeScript | Interfaces et constantes IPC |
| `libs/native-audio-capture` | Rust + napi-rs | Capture audio système (ScreenCaptureKit) |

### Modèles IA

| Modèle | Taille | Usage |
|--------|--------|-------|
| Silero VAD | 2 Mo | Détection de voix |
| Parakeet TDT 0.6B | 640 Mo | Transcription (STT) |
| Mistral 7B Q4_K_M | 4.4 Go | Résumé et chat |

## Contribuer

1. Fork le projet
2. Créer une branche (`git checkout -b feature/ma-feature`)
3. Commit (`git commit -m 'feat: ajout de ma feature'`)
4. Push (`git push origin feature/ma-feature`)
5. Ouvrir une Pull Request

## Licence

MIT — Voir [LICENSE](LICENSE)
