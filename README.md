# Web Strike

FPS 3D para navegador inspirado no ritmo de shooters táticos competitivos, sem usar assets proprietários de outros jogos.

## O que já existe

- Arena 3D em Three.js
- Controles FPS com pointer lock
- Movimento WASD, corrida e pulo
- Colisão com paredes e coberturas
- Rifle com munição, recarga, recoil, muzzle flash e tracers
- Bots com patrulha, perseguição, linha de visão, strafe e disparos
- Dano, armadura, headshot, hitmarker e kill feed
- Rounds, cronômetro e placar
- HUD responsivo

## Rodar localmente

Por usar ES modules, sirva a pasta com um servidor HTTP local:

```bash
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Publicação

O repositório inclui um workflow para GitHub Pages em `.github/workflows/pages.yml`.

No GitHub, abra **Settings → Pages → Source** e selecione **GitHub Actions**. Depois de um push em `main`, a publicação será automática.

## Próximos passos

- Multiplayer real via WebSocket (servidor autoritativo)
- Salas/lobby e nickname
- Times 5v5
- Mais armas e compra por round
- Objetivo de plantar/desarmar
- Matchmaking simples
- Áudio 3D, footsteps e melhorias de mapa
