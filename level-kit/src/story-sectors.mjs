// 把本场既定的敌种配比派到能容纳它们的房间。先保留原站位，只有受净高限制时换位。
export function assignGuardTypes(types, slots) {
  if (!slots || slots.every((part,i)=>!part.types || part.types.includes(types[i]))) return types;
  const owners=types.map((type,i)=>!slots[i].types || slots[i].types.includes(type) ? i : -1);
  const assigned=new Set(owners);
  function place(slot,seen) {
    const accepts=type=>!slots[slot].types || slots[slot].types.includes(type);
    for(const free of [true,false]) {
      for(let guard=0;guard<types.length;guard++) {
        if ((owners[guard]<0)!==free || seen.has(guard) || !accepts(types[guard])) continue;
        seen.add(guard);
        if (free || place(owners[guard],seen)) {
          owners[guard]=slot;
          return true;
        }
      }
    }
    return false;
  }
  for(let i=0;i<slots.length;i++) {
    if(!assigned.has(i) && !place(i,new Set())) throw Error('房间净空和本场敌种配比不兼容：'+slots[i].name);
  }
  const result=Array(types.length);
  owners.forEach((slot,i)=>{result[slot]=types[i];});
  return result;
}
