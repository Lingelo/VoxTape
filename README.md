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

Sourdine est une application macOS de bureau pour la transcription en temps réel de vos réunions (Teams, Meet, Zoom...) avec génération automatique de notes, résumés et points clés. **Tout fonctionne localement** — aucune API externe, aucune donnée envoyée sur le cloud, aucun abonnement.

## Fonctionnalités

- **Transcription en temps réel** — Capture simultanée du micro et de l'audio système (appels vidéo, podcasts, etc.)
- **IA locale** — Résumé automatique, points clés, actions à suivre via Mistral 7B
- **Chat contextuel** — Posez des questions sur vos réunions passées
- **Recherche full-text** — Retrouvez rapidement n'importe quel sujet discuté
- **Organisation par dossiers** — Classez vos sessions de transcription
- **Export** — Exportez vos notes en Markdown ou texte brut
- **100% hors-ligne** — Aucune connexion internet requise après le téléchargement initial des modèles
- **Vie privée garantie** — Vos données ne quittent jamais votre machine

## Aperçu

```
┌─────────────────────────────────────────────────────────────────┐
│  🎙️ Session en cours                              ⏱️ 00:45:23   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Marie] On devrait finaliser le design d'ici vendredi.        │
│  [Pierre] D'accord, je m'occupe des maquettes Figma.           │
│  [Marie] Parfait. On fait un point mercredi ?                   │
│  [Pierre] Ça marche, je t'envoie un invite.                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📝 Notes IA                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  **Résumé** : Discussion sur la finalisation du design         │
│  **Actions** :                                                  │
│  - Pierre : Créer les maquettes Figma                          │
│  - Marie : Organiser un point mercredi                         │
└─────────────────────────────────────────────────────────────────┘
```

## Prérequis

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| **macOS** | 14.2 (Sonoma) | 15+ (Sequoia) |
| **RAM** | 16 Go | 32 Go |
| **Stockage** | 10 Go | 20 Go |
| **Processeur** | Apple Silicon (M1) | M2/M3/M4 |

> **Note** : La capture audio système nécessite macOS 14.2+ (ScreenCaptureKit). Les Mac Intel ne sont pas officiellement supportés.

### Optionnel (pour le développement)

- **Node.js 20+** — Recommandé : utiliser [nvm](https://github.com/nvm-sh/nvm)
- **Rust** — Pour compiler le module natif de capture audio système
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

## Installation (Utilisateurs)

### Téléchargement

1. Télécharger le DMG depuis [Releases](https://github.com/Lingelo/Sourdine/releases)
2. Ouvrir le DMG et glisser Sourdine dans Applications

### Contournement Gatekeeper

L'application n'est pas signée (pas de certificat Apple Developer). macOS affichera une erreur "application endommagée". Exécutez cette commande :

```bash
xattr -cr /Applications/Sourdine.app
```

### Premier lancement

1. Lancer Sourdine
2. L'assistant d'onboarding vous guidera pour télécharger les modèles IA (~5 Go)
3. Autoriser l'accès au micro et à l'enregistrement d'écran dans Préférences Système

## Installation (Développeurs)

```bash
# Cloner le repo
git clone https://github.com/Lingelo/Sourdine.git
cd Sourdine

# Installer les dépendances
npm install

# Télécharger les modèles IA
npm run download-model       # STT: Silero VAD + Parakeet TDT (~640 Mo)
npm run download-llm-model   # LLM: Mistral 7B Q4_K_M (~4.4 Go)

# Lancer en mode développement
npm run dev
```

L'application s'ouvre automatiquement. Le serveur Angular tourne sur `http://localhost:4200`.

### Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Mode développement avec hot-reload |
| `npm run build` | Build de production |
| `npm run package` | Créer Sourdine.app (non signé) |
| `npm run make` | Créer DMG + ZIP distribuables |
| `npm run build:native` | Compiler le module Rust manuellement |

## Architecture

Sourdine utilise une architecture multi-processus pour garantir stabilité et performances :

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  NestJS Backend (DI container)                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ AudioModule │  │  SttModule  │  │    LlmModule    │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │  │
│  │         │                │                   │            │  │
│  │         ▼                ▼                   ▼            │  │
│  │    ┌─────────┐     ┌──────────┐       ┌──────────┐       │  │
│  │    │  Rust   │     │stt-worker│       │llm-worker│       │  │
│  │    │ Module  │     │(sherpa)  │       │(llama)   │       │  │
│  │    └─────────┘     └──────────┘       └──────────┘       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ Database    │  │   Config    │  │     Export      │   │  │
│  │  │ (SQLite)    │  │   Module    │  │     Module      │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC (contextBridge)
┌────────────────────────────┴────────────────────────────────────┐
│  Renderer Process (Angular 21 SPA)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Session   │  │    Audio    │  │         LLM             │  │
│  │   Service   │  │   Capture   │  │        Service          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Stack technique

| Couche | Technologies |
|--------|--------------|
| **Desktop** | Electron 34 |
| **Frontend** | Angular 21, SCSS, Signals |
| **Backend** | NestJS 11, RxJS |
| **Database** | SQLite (better-sqlite3), FTS5 |
| **STT** | sherpa-onnx (Parakeet TDT + Silero VAD) |
| **LLM** | node-llama-cpp (Mistral 7B) |
| **Audio** | ScreenCaptureKit (Rust/napi-rs) |
| **Build** | Nx monorepo, Vite, Electron Forge |

### Structure du projet

```
sourdine/
├── apps/
│   ├── electron-shell/        # Process principal Electron + workers
│   │   ├── src/main.ts        # Point d'entrée Electron
│   │   ├── src/preload.ts     # Bridge IPC sécurisé
│   │   ├── src/stt-worker.ts  # Worker transcription
│   │   └── src/llm-worker.ts  # Worker LLM
│   └── renderer/              # Interface Angular
│       └── src/app/           # Components, services, routes
├── libs/
│   ├── backend/               # Services NestJS
│   │   └── src/lib/
│   │       ├── audio/         # Capture et mixage audio
│   │       ├── stt/           # Orchestration transcription
│   │       ├── llm/           # Orchestration LLM
│   │       ├── database/      # Accès SQLite
│   │       └── export/        # Export Markdown/texte
│   ├── native-audio-capture/  # Module Rust ScreenCaptureKit
│   └── shared-types/          # Types TypeScript partagés
├── models/                    # Modèles IA (téléchargés)
└── scripts/                   # Scripts de build et packaging
```

### Modèles IA utilisés

| Modèle | Taille | Usage | Performance |
|--------|--------|-------|-------------|
| [Silero VAD](https://github.com/snakers4/silero-vad) | 2 Mo | Détection de voix | ~1ms/chunk |
| [Parakeet TDT 0.6B](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) | 640 Mo | Transcription (STT) | Temps réel |
| [Mistral 7B Q4_K_M](https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF) | 4.4 Go | Résumé et chat | ~20 tokens/s (M2) |

## Roadmap

- [ ] Support multi-langue (actuellement français/anglais)
- [ ] Identification des locuteurs (speaker diarization)
- [ ] Synchronisation cloud optionnelle (chiffrée)
- [ ] Intégration calendrier (Google Calendar, Outlook)
- [ ] Plugins pour Teams, Meet, Zoom
- [ ] Version Windows/Linux

## Contribuer

Les contributions sont bienvenues ! N'hésitez pas à ouvrir une issue ou une PR.

1. Fork le projet
2. Créer une branche (`git checkout -b feature/ma-feature`)
3. Commit les changements (`git commit -m 'feat: ajout de ma feature'`)
4. Push (`git push origin feature/ma-feature`)
5. Ouvrir une Pull Request

## Licence

MIT — Voir [LICENSE](LICENSE) pour plus de détails.

---

<p align="center">
  Fait avec ❤️ par <a href="https://github.com/Lingelo">Angelo Lima</a>
</p>
