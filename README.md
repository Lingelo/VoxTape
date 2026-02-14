# Sourdine

Application macOS de transcription de reunions et prise de notes assistee par IA. Tout fonctionne **100% en local** — aucune API externe, aucune donnee envoyee sur le cloud.

![macOS](https://img.shields.io/badge/macOS-12%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Fonctionnalites

- **Transcription en temps reel** — Capture audio micro + systeme (appels Teams, Meet, etc.)
- **IA locale** — Resume, points cles, actions via Mistral 7B (node-llama-cpp)
- **Chat contextuel** — Posez des questions sur vos reunions
- **100% hors-ligne** — Aucune connexion internet requise apres telechargement des modeles
- **Vie privee** — Vos donnees restent sur votre machine

## Prerequis

- **macOS 12+** (Monterey ou plus recent)
- **Node.js 20+** (recommande: utiliser [nvm](https://github.com/nvm-sh/nvm))
- **16 Go RAM minimum** (pour le modele LLM)
- **~6 Go d'espace disque** (modeles IA)

### Optionnel (pour la capture audio systeme)

- **Rust** — Pour compiler le module natif de capture audio systeme
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

## Installation

```bash
# Cloner le repo
git clone https://github.com/Lingelo/Sourdine.git
cd Sourdine

# Installer les dependances (rebuild automatique des modules natifs pour Electron)
npm install

# Telecharger les modeles IA (~640 Mo pour STT, ~4.4 Go pour LLM)
npm run download-model       # Silero VAD + Parakeet TDT
npm run download-llm-model   # Mistral 7B Q4_K_M
```

## Developpement

```bash
# Lancer l'app en mode dev (Angular hot-reload + Electron)
npm run dev
```

L'application s'ouvre automatiquement. Le serveur Angular tourne sur `http://localhost:4200`.

### Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Mode developpement avec hot-reload |
| `npm run build` | Build de production |
| `npm run package` | Creer Sourdine.app (non signe) |
| `npm run make` | Creer DMG + ZIP distribuables |

### Structure du projet

```
sourdine/
├── apps/
│   ├── electron-shell/     # Process principal Electron + workers
│   └── renderer/           # Interface Angular
├── libs/
│   ├── backend/            # Services NestJS (audio, STT, LLM, DB)
│   ├── native-audio-capture/  # Module Rust pour capture audio systeme
│   └── shared-types/       # Types TypeScript partages
├── models/                 # Modeles IA (telecharges)
└── scripts/                # Scripts de build et packaging
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Electron Main Process                          │
│  ┌─────────────────────────────────────────┐    │
│  │  NestJS Backend                         │    │
│  │  AudioModule → SttService → stt-worker ─┼──→ sherpa-onnx (Parakeet TDT)
│  │  LlmModule → LlmService → llm-worker ───┼──→ node-llama-cpp (Mistral 7B)
│  │  DatabaseModule (SQLite)                │    │
│  └─────────────────────────────────────────┘    │
└────────────────┬────────────────────────────────┘
                 │ IPC (contextBridge)
┌────────────────┴────────────────────────────────┐
│  Renderer Process (Angular 21)                  │
│  SessionService, AudioCaptureService, LlmService│
└─────────────────────────────────────────────────┘
```

### Modeles IA utilises

| Modele | Taille | Usage |
|--------|--------|-------|
| [Silero VAD](https://github.com/snakers4/silero-vad) | 2 Mo | Detection de voix |
| [Parakeet TDT 0.6B](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) | 640 Mo | Transcription (STT) |
| [Mistral 7B Q4_K_M](https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF) | 4.4 Go | Resume et chat |

## Packaging

### Build local

```bash
# Creer l'app macOS
npm run package
# → out/Sourdine-darwin-arm64/Sourdine.app

# Creer un DMG
npm run make
# → out/make/Sourdine-x.x.x-arm64.dmg
```

### Release GitHub

Les releases sont automatisees via GitHub Actions. Pour publier une nouvelle version :

```bash
# Creer un tag de version
git tag v0.1.0
git push origin v0.1.0
```

Le workflow CI va automatiquement :
1. Builder l'application pour macOS (arm64 + x64)
2. Creer le DMG
3. Publier une release GitHub avec les artefacts

## Contribuer

Les contributions sont bienvenues ! N'hesitez pas a ouvrir une issue ou une PR.

## Licence

MIT
