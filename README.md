# ÉCHO — labyrinthe sonore 3D

Prototype HTML, CSS et JavaScript, rendu avec **Three.js**. Le monde est entièrement noir : seules les ondes sonores révèlent temporairement ses surfaces. Aucun compte, serveur de jeu ou modèle 3D externe n’est nécessaire.

## Lancer le jeu

Avec Node.js 18+ installé :

```sh
npm install
npm run dev
```

Ouvrir l’adresse affichée, généralement **http://localhost:5173**. Ne pas ouvrir `index.html` directement : les modules JavaScript nécessitent un serveur local.

**Sur téléphone :** connecter le téléphone au même Wi-Fi que l’ordinateur, puis ouvrir l’adresse réseau affichée par Vite, par exemple `http://192.168.1.20:5173`. Autoriser Node.js sur le réseau privé dans le pare-feu Windows si nécessaire. Le jeu fonctionne en portrait et en paysage. La 3D nécessite WebGL 2 et un navigateur récent.

## Jouer

- Atteindre la porte **SORTIE**, qui apparaît en vert quand une onde la touche.
- **Ordinateur :** ZQSD, WASD ou flèches pour marcher ; cliquer-glisser dans la scène pour regarder ; boutons ou touches **1 / 2 / 3** pour émettre une onde.
- **Mode immersif facultatif :** double-cliquer dans la scène pour capturer la souris. Un clic émet alors l’onde sélectionnée ; **Tab** libère le curseur sans arrêter le jeu.
- **Téléphone :** joystick à gauche pour marcher ; glisser ailleurs dans la scène pour regarder ; trois boutons d’ondes en bas. Ces interactions peuvent être utilisées simultanément.
- **Échap :** pause / reprise. **H :** commandes. **M :** couper / activer le son. **Espace :** émettre l’onde sélectionnée.

| Onde | Portée | Persistance après le passage | Recharge |
| --- | --- | --- | --- |
| Courte | 4 m | 1 s | 0,85 s |
| Moyenne | 8 m | 2 s | 1,65 s |
| Longue | 14 m | 4 s | 2,8 s |

La vague avance à 9 m/s. La persistance commence **lorsqu’elle touche chaque surface**, et non au clic. Les ondes traversent les murs ; le rendu 3D masque naturellement les surfaces derrière un obstacle. Une petite recharge empêche le spam ; plusieurs ondes peuvent se superposer. Les valeurs sont modifiables dans `sonar.js`.

Le labyrinthe 9 × 9 est généré à chaque nouvelle partie et possède toujours un chemin vers la sortie. Il n’y a pas d’ennemis, de carte ou de limite de temps. Le son est synthétisé localement, ne démarre qu’après une interaction, et n’est pas indispensable pour jouer.

## Vérifier et construire

```sh
npm test
npm run build
npm run preview
```

Le dossier `dist/` contient la version de production, déployable sur un hébergement statique. Les polices Google sont facultatives : des polices système prennent le relais sans connexion.

## Fichiers

- `index.html` : interface et contrôles.
- `style.css` : présentation responsive, HUD et commandes tactiles.
- `main.js` : scène, déplacements, états du jeu et interactions.
- `maze.js` : génération, sortie et collisions.
- `sonar.js` : ondes et shaders ; murs instanciés pour limiter les appels GPU.
- `audio.js` : synthèse des sons avec Web Audio.
- `tests/maze.test.js` : connexité, génération déterministe, passages et collisions.
- `tests/sonar.test.js` : portées, persistance, superposition, extinction et limites des ondes.

Attention : le jeu présente des lueurs animées. Les animations décoratives et le balancement de la caméra respectent la préférence « réduire les animations » ; les ondes restent nécessaires au gameplay.
