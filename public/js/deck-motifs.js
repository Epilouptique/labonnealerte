/*
 * LBADeckMotifs — ambient SVG background motifs keyed by emoji.
 * Monochrome (currentColor only). The consuming page sets
 * `color: var(--deck-motif)` so each motif is softly tinted.
 * Each motif is composed as a light background pattern (offset shape +
 * scattered marks) so a deck title/counter on top stays readable.
 */
(function () {
  "use strict";

  var SVG_OPEN =
    "<svg viewBox='0 0 120 120' width='100%' height='100%' preserveAspectRatio='xMidYMid slice' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>";
  var C = "</svg>";

  window.LBADeckMotifs = {
    // 📦 open box/cube silhouette + a few dots
    "📦":
      SVG_OPEN +
      "<path d='M74 40 L100 52 L100 88 L74 100 L48 88 L48 52 Z'/>" +
      "<path d='M48 52 L74 64 L100 52 M74 64 L74 100'/>" +
      "<path d='M62 46 L88 34 L100 52'/>" +
      "<circle cx='20' cy='30' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='30' cy='72' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='16' cy='96' r='2.5' fill='currentColor' stroke='none'/>" +
      C,

    // 🎒 backpack silhouette + dotted trail
    "🎒":
      SVG_OPEN +
      "<path d='M60 34 C46 34 40 46 40 60 L40 96 C40 100 42 102 46 102 L86 102 C90 102 92 100 92 96 L92 60 C92 46 86 34 72 34'/>" +
      "<path d='M52 34 C52 26 60 24 66 30'/>" +
      "<path d='M52 62 L80 62 C82 62 84 64 84 66 L84 84 L48 84 L48 66 C48 64 50 62 52 62 Z'/>" +
      "<path d='M60 62 L60 72'/>" +
      "<circle cx='20' cy='34' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='16' cy='54' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='22' cy='74' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='16' cy='94' r='2.5' fill='currentColor' stroke='none'/>" +
      C,

    // ⭐ scattered 4-5 point stars, varied sizes
    "⭐":
      SVG_OPEN +
      "<path d='M78 30 L83 44 L97 44 L86 53 L90 67 L78 58 L66 67 L70 53 L59 44 L73 44 Z'/>" +
      "<path d='M34 72 L37 81 L46 81 L39 87 L41 96 L34 90 L27 96 L29 87 L22 81 L31 81 Z'/>" +
      "<path d='M96 92 L98 98 L104 98 L99 102 L101 108 L96 104 L91 108 L93 102 L88 98 L94 98 Z'/>" +
      "<path d='M26 30 L28 36 L34 36 L29 40 L31 46 L26 42 L21 46 L23 40 L18 36 L24 36 Z'/>" +
      C,

    // 🔥 stylised flame curves
    "🔥":
      SVG_OPEN +
      "<path d='M74 26 C86 42 92 54 92 68 C92 86 80 98 66 98 C52 98 40 86 40 70 C40 60 46 54 50 48 C52 56 58 58 60 56 C62 52 58 44 62 36 C66 30 70 28 74 26 Z'/>" +
      "<path d='M66 74 C74 80 74 90 66 92 C58 90 58 80 66 74 Z'/>" +
      "<path d='M22 40 C26 46 26 50 22 56'/>" +
      "<path d='M20 78 C24 84 24 88 20 94'/>" +
      C,

    // 💡 bulb outline + short rays
    "💡":
      SVG_OPEN +
      "<path d='M78 30 C64 30 54 40 54 54 C54 64 60 70 64 76 C66 80 66 84 66 86 L90 86 C90 84 90 80 92 76 C96 70 102 64 102 54 C102 40 92 30 78 30 Z'/>" +
      "<path d='M68 92 L88 92 M70 98 L86 98'/>" +
      "<path d='M78 16 L78 22 M102 26 L98 30 M116 54 L110 54 M54 24 L58 28'/>" +
      "<circle cx='26' cy='60' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='34' cy='90' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='20' cy='34' r='2.5' fill='currentColor' stroke='none'/>" +
      C,

    // 🎯 concentric circles (target)
    "🎯":
      SVG_OPEN +
      "<circle cx='72' cy='56' r='34'/>" +
      "<circle cx='72' cy='56' r='22'/>" +
      "<circle cx='72' cy='56' r='10'/>" +
      "<circle cx='72' cy='56' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='24' cy='96' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='20' cy='30' r='2.5' fill='currentColor' stroke='none'/>" +
      C,

    // 🌍 globe with simplified meridians
    "🌍":
      SVG_OPEN +
      "<circle cx='70' cy='58' r='38'/>" +
      "<path d='M32 58 L108 58'/>" +
      "<path d='M70 20 C48 34 48 82 70 96 C92 82 92 34 70 20 Z'/>" +
      "<path d='M38 40 C52 48 88 48 102 40 M38 76 C52 68 88 68 102 76'/>" +
      C,

    // 🏔️ mountain ridges (layered crests)
    "🏔️":
      SVG_OPEN +
      "<path d='M14 92 L44 46 L60 68 L78 40 L110 92 Z'/>" +
      "<path d='M38 55 L44 46 L52 58'/>" +
      "<path d='M72 49 L78 40 L86 52'/>" +
      "<path d='M6 100 L38 66 L54 84'/>" +
      C,

    // 🌊 repeated wave curves
    "🌊":
      SVG_OPEN +
      "<path d='M12 44 C24 34 36 54 48 44 C60 34 72 54 84 44 C96 34 104 50 112 44'/>" +
      "<path d='M12 66 C24 56 36 76 48 66 C60 56 72 76 84 66 C96 56 104 72 112 66'/>" +
      "<path d='M12 88 C24 78 36 98 48 88 C60 78 72 98 84 88 C96 78 104 94 112 88'/>" +
      C,

    // 🌌 stars + crescent moon + a small connected constellation
    "🌌":
      SVG_OPEN +
      "<path d='M92 26 C80 30 78 46 90 52 C82 52 72 44 72 34 C72 26 82 22 92 26 Z'/>" +
      "<path d='M22 72 L40 66 L54 78 L74 74'/>" +
      "<circle cx='22' cy='72' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='40' cy='66' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='54' cy='78' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='74' cy='74' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='30' cy='34' r='2' fill='currentColor' stroke='none'/>" +
      "<circle cx='58' cy='42' r='2' fill='currentColor' stroke='none'/>" +
      "<circle cx='96' cy='90' r='2' fill='currentColor' stroke='none'/>" +
      C,

    // ☀️ sun outline + rounded rays
    "☀️":
      SVG_OPEN +
      "<circle cx='68' cy='54' r='22'/>" +
      "<path d='M68 20 L68 28 M68 80 L68 88 M34 54 L42 54 M94 54 L102 54'/>" +
      "<path d='M44 30 L49 35 M87 59 L92 64 M44 78 L49 73 M87 49 L92 44'/>" +
      "<circle cx='22' cy='96' r='2.5' fill='currentColor' stroke='none'/>" +
      "<circle cx='104' cy='98' r='2.5' fill='currentColor' stroke='none'/>" +
      C,

    // ❄️ simple geometric snowflakes
    "❄️":
      SVG_OPEN +
      "<path d='M70 30 L70 82 M47 43 L93 69 M47 69 L93 43'/>" +
      "<path d='M70 30 L64 36 M70 30 L76 36 M70 82 L64 76 M70 82 L76 76'/>" +
      "<path d='M28 92 L28 108 M20 96 L36 104 M20 104 L36 96'/>" +
      "<path d='M100 22 L100 34 M94 25 L106 31 M94 31 L106 25'/>" +
      C,

    // 🍁 falling stylised leaves
    "🍁":
      SVG_OPEN +
      "<path d='M74 34 C64 42 62 56 74 62 C86 56 84 42 74 34 Z'/>" +
      "<path d='M74 62 L74 80 M64 50 L58 46 M84 50 L90 46'/>" +
      "<path d='M32 66 C26 71 25 79 32 82 C39 79 38 71 32 66 Z'/>" +
      "<path d='M32 82 L32 92'/>" +
      "<path d='M96 88 C90 93 89 101 96 104 C103 101 102 93 96 88 Z'/>" +
      C,

    // 🎮 gamepad silhouette + buttons/cross
    "🎮":
      SVG_OPEN +
      "<path d='M42 50 C34 50 28 58 26 68 C24 80 22 92 30 96 C38 100 44 90 50 88 L82 88 C88 90 94 100 102 96 C110 92 108 80 106 68 C104 58 98 50 90 50 Z'/>" +
      "<path d='M40 64 L40 76 M34 70 L46 70'/>" +
      "<circle cx='86' cy='66' r='3' fill='currentColor' stroke='none'/>" +
      "<circle cx='94' cy='74' r='3' fill='currentColor' stroke='none'/>" +
      C,

    // 💻 screen with code chevrons < >
    "💻":
      SVG_OPEN +
      "<path d='M40 36 L100 36 C102 36 104 38 104 40 L104 80 C104 82 102 84 100 84 L40 84 C38 84 36 82 36 80 L36 40 C36 38 38 36 40 36 Z'/>" +
      "<path d='M30 96 L110 96'/>" +
      "<path d='M58 52 L48 60 L58 68'/>" +
      "<path d='M82 52 L92 60 L82 68'/>" +
      "<path d='M72 50 L68 70'/>" +
      C,

    // 📈 rising line + points
    "📈":
      SVG_OPEN +
      "<path d='M30 96 L30 32 M30 96 L108 96'/>" +
      "<path d='M38 84 L58 66 L74 76 L100 44'/>" +
      "<circle cx='58' cy='66' r='3' fill='currentColor' stroke='none'/>" +
      "<circle cx='74' cy='76' r='3' fill='currentColor' stroke='none'/>" +
      "<circle cx='100' cy='44' r='3' fill='currentColor' stroke='none'/>" +
      "<path d='M94 44 L100 44 L100 50'/>" +
      C,

    // 💰 stacked round coins
    "💰":
      SVG_OPEN +
      "<ellipse cx='70' cy='84' rx='26' ry='10'/>" +
      "<path d='M44 84 L44 68 M96 84 L96 68'/>" +
      "<ellipse cx='70' cy='68' rx='26' ry='10'/>" +
      "<path d='M44 68 L44 52 M96 68 L96 52'/>" +
      "<ellipse cx='70' cy='52' rx='26' ry='10'/>" +
      "<path d='M70 46 L70 58 M66 50 L74 50'/>" +
      "<circle cx='24' cy='36' r='2.5' fill='currentColor' stroke='none'/>" +
      C,

    // 🎬 clapperboard/film strip silhouette
    "🎬":
      SVG_OPEN +
      "<path d='M34 58 L104 58 L104 96 C104 98 102 100 100 100 L38 100 C36 100 34 98 34 96 Z'/>" +
      "<path d='M34 58 L40 40 L108 52 L104 58'/>" +
      "<path d='M50 41 L44 58 M66 44 L60 58 M82 47 L76 58 M98 50 L92 58'/>" +
      C,

    // 🎵 notes + wavy staff
    "🎵":
      SVG_OPEN +
      "<circle cx='58' cy='84' r='9'/>" +
      "<circle cx='92' cy='76' r='9'/>" +
      "<path d='M67 84 L67 42 L101 34 L101 76'/>" +
      "<path d='M67 52 L101 44'/>" +
      "<path d='M18 44 C28 38 38 50 48 44'/>" +
      C,

    // 📚 stacked books silhouette
    "📚":
      SVG_OPEN +
      "<path d='M36 92 L96 92 L96 100 L36 100 Z'/>" +
      "<path d='M32 76 L92 76 L92 92 L32 92 Z'/>" +
      "<path d='M38 60 L98 60 L98 76 L38 76 Z'/>" +
      "<path d='M44 60 L44 76 M62 76 L62 92 M74 92 L74 100'/>" +
      C,

    // 🏃 running figure silhouette + speed lines
    "🏃":
      SVG_OPEN +
      "<circle cx='78' cy='36' r='8'/>" +
      "<path d='M78 44 L70 62 L84 70 L80 88'/>" +
      "<path d='M70 62 L54 58 M84 70 L96 66'/>" +
      "<path d='M70 62 L60 84'/>" +
      "<path d='M20 50 L42 50 M14 66 L38 66 M22 82 L40 82'/>" +
      C,

    // 🍽️ plate + cutlery outline
    "🍽️":
      SVG_OPEN +
      "<circle cx='68' cy='60' r='26'/>" +
      "<circle cx='68' cy='60' r='16'/>" +
      "<path d='M24 34 L24 66 M18 34 L18 50 C18 54 24 54 24 50 M30 34 L30 50 C30 54 24 54 24 50'/>" +
      "<path d='M110 34 C102 38 102 54 110 58 L110 88 M110 58 L110 34'/>" +
      C,

    // 🐾 scattered paw prints
    "🐾":
      SVG_OPEN +
      "<ellipse cx='40' cy='58' rx='9' ry='11'/>" +
      "<circle cx='28' cy='42' r='4'/>" +
      "<circle cx='40' cy='38' r='4'/>" +
      "<circle cx='52' cy='42' r='4'/>" +
      "<ellipse cx='84' cy='90' rx='9' ry='11'/>" +
      "<circle cx='72' cy='74' r='4'/>" +
      "<circle cx='84' cy='70' r='4'/>" +
      "<circle cx='96' cy='74' r='4'/>" +
      C,

    // 🚨 exclamation "!" + concentric alert waves
    "🚨":
      SVG_OPEN +
      "<path d='M66 34 L66 66'/>" +
      "<circle cx='66' cy='82' r='2.5' fill='currentColor' stroke='none'/>" +
      "<path d='M40 30 C30 42 30 74 40 86'/>" +
      "<path d='M92 30 C102 42 102 74 92 86'/>" +
      "<path d='M28 18 C12 38 12 78 28 98'/>" +
      "<path d='M104 18 C120 38 120 78 104 98'/>" +
      C
  };
})();
