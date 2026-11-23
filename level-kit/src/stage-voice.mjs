// 环境脉冲、警示、触发和任务终止音共享各关自己的基音与节奏。
const voices={
  'underground-lab':['triangle',72,510,104,840,2.8],
  'shanhai-secret-realm':['sine',196,430,84,660,3.3],
  'rain-city':['triangle',1320,520,132,195,2.4],
  'buried-tomb':['sine',106,305,80,1140,3.1],
  'polar-station':['triangle',86,800,390,650,2.6],
  'drowned-city':['sine',238,1520,112,730,2.5],
  'ember-fortress':['triangle',78,215,62,128,2.1],
  'derelict-station':['sawtooth',58,430,1820,150,2.9],
  'neon-undercity':['sine',104,1600,57,840,2.0],
  'jungle-temple':['sine',1730,97,150,1180,2.8],
  'bloodmoon-castle':['sine',128,174,320,260,4.1],
  'sakura-night-town':['sine',710,850,180,1170,3.4],
  'brass-factory':['triangle',160,740,1340,204,1.7],
  'haunted-midway':['sine',523,720,92,370,3.2],
  'paris-tower':['triangle',88,510,180,790,2.6],
};
export function stageVoice(id) {
  const data=voices[id];
  if(!data) return null;
  const [wave,bed,warn,danger,clear,interval]=data;
  return {id,interval,play(sound,kind,output) {
    const tone=(a,b,d,v=.16,delay=0)=>sound.tone(a,b,d,v,wave,delay,output);
    const noise=(d,a,b,v,delay=0)=>sound.hiss(d,a,b,v,delay,output);
    if(kind==='ambient') {
      if(id==='rain-city'||id==='buried-tomb'||id==='polar-station') noise(.42,bed*2,bed,.045);
      else tone(bed,bed*.91,.34,.045);
      if(id==='haunted-midway'||id==='sakura-night-town') tone(bed*1.49,bed*1.48,.42,.042,.24);
    } else if(kind==='warning') {
      tone(warn,warn*1.18,.10,.24);tone(warn,warn*1.3,.13,.21,.19);
      if(id==='ember-fortress'||id==='underground-lab') tone(warn,warn*1.4,.33,.24,.38);
    } else if(kind==='danger'||kind==='impact') {
      tone(danger,danger*.47,.32,.28); noise(.24,danger*5,danger*.8,.23,.025);
    } else if(kind==='rotor') {
      for (let i=0;i<4;i++) noise(.075,310,83,.22,i*.11);
    } else {
      tone(clear,clear*1.15,.17,.22);tone(clear*1.5,clear*1.48,.31,.18,.12);
    }
  }};
}
