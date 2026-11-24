import {watchRooms} from '@level-kit/room-guards.mjs';

// 敌群分守沿途街区，路线可以折返或绕行。唯一的胜利触发点是有高差判定的接应区。
export function escapeRoute({name,rule,exit,label,victory,parts,mix}) {
  return {
    type:'escape',classicAction:'突围',classicRule:rule,turnDirections:true,watchRooms,
    route:[{
      kind:'breakout',name,at:exit,label,victory,parts,mix,
      entries:parts.map(part=>part.anchor),
      count:parts.reduce((sum,part)=>sum+part.count,0),
    }],
  };
}
