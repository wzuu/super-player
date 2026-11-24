// 环境脉冲、警示、触发和任务终止音共享各关自己的基音与节奏。
const voices = {
  'rift-temple-valley': ['sine',203,461,116,694,3.3],
  'caldera-rift-works': ['triangle',92,332,72,481,2.9],
  'midnight-midway-backstage': ['sine',392,620,143,795,3.1],
  'underground-lab': ['triangle', 72, 510, 104, 840, 2.8],
  'shanhai-secret-realm': ['sine', 196, 430, 84, 660, 3.3],
  'rain-city': ['triangle', 1320, 520, 132, 195, 2.4],
  'buried-tomb': ['sine', 106, 305, 80, 1140, 3.1],
  'polar-station': ['triangle', 86, 800, 390, 650, 2.6],
  'drowned-city': ['sine', 238, 1520, 112, 730, 2.5],
  'ember-fortress': ['triangle', 78, 215, 62, 128, 2.1],
  'derelict-station': ['sawtooth', 58, 430, 1820, 150, 2.9],
  'neon-undercity': ['sine', 104, 1600, 57, 840, 2.0],
  'jungle-temple': ['sine', 1730, 97, 150, 1180, 2.8],
  'bloodmoon-castle': ['sine', 128, 174, 320, 260, 4.1],
  'sakura-night-town': ['sine', 710, 850, 180, 1170, 3.4],
  'brass-factory': ['triangle', 160, 740, 1340, 204, 1.7],
  'haunted-midway': ['sine', 523, 720, 92, 370, 3.2],
  'paris-tower': ['triangle', 88, 510, 180, 790, 2.6],
  'orbital-brood-ring': ['sine', 118, 660, 235, 930, 2.2],
  'moonlit-stained-glass-keep': ['triangle', 164, 246, 110, 493, 3.8],
  'storm-city-overpass': ['sawtooth', 105, 390, 142, 620, 2.8],
  'lantern-shrine-escape': ['triangle', 196, 294, 147, 588, 3.3],
  'neon-northline-escape': ['sine', 123, 554, 185, 830, 2.4],
  'sunken-rooftop-recovery': ['sine',132,462,158,693,3.6],
  'frost-sample-escort': ['triangle',98,392,147,684,3.1],
  'steam-service-rail': ['sawtooth',110,415,185,660,2.8],
  'dune-signal-terrace': ['sine',170,433,112,680,3.3],
  'waterfall-temple-defense': ['triangle',137,392,165,745,3.7],
  'tower-observation-defense': ['sine',97,531,115,782,3.0],
};
export function stageVoice(id) {
  const data = voices[id];
  if (!data) return null;
  const [wave, bed, warn, danger, clear, interval] = data;
  return {
    id,
    interval,
    play(sound, kind, output) {
      const tone = (a, b, d, v = 0.16, delay = 0) => sound.tone(a, b, d, v, wave, delay, output);
      const noise = (d, a, b, v, delay = 0) => sound.hiss(d, a, b, v, delay, output);
      if (kind === 'ambient') {
        if (id === 'rain-city' || id === 'buried-tomb' || id === 'polar-station')
          noise(0.42, bed * 2, bed, 0.045);
        else tone(bed, bed * 0.91, 0.34, 0.045);
        if (id === 'haunted-midway' || id === 'sakura-night-town')
          tone(bed * 1.49, bed * 1.48, 0.42, 0.042, 0.24);
      } else if (kind === 'warning') {
        tone(warn, warn * 1.18, 0.1, 0.24);
        tone(warn, warn * 1.3, 0.13, 0.21, 0.19);
        if (id === 'ember-fortress' || id === 'underground-lab') tone(warn, warn * 1.4, 0.33, 0.24, 0.38);
      } else if (kind === 'danger' || kind === 'impact') {
        tone(danger, danger * 0.47, 0.32, 0.28);
        noise(0.24, danger * 5, danger * 0.8, 0.23, 0.025);
      } else if (kind === 'rotor') {
        for (let i = 0; i < 4; i++) noise(0.075, 310, 83, 0.22, i * 0.11);
      } else {
        tone(clear, clear * 1.15, 0.17, 0.22);
        tone(clear * 1.5, clear * 1.48, 0.31, 0.18, 0.12);
      }
    },
  };
}
