// 将完整连通部件分配给头、尾或躯干。按部件分组，活动关节不会切开同一片网格。
function islands(THREE, source) {
  const p = source.attributes.position;
  const faces = p.count / 3, parent = new Int32Array(faces), at = new Map();
  function root(i) {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  }
  for (let i=0; i<faces; i++) {
    parent[i] = i;
    for (let k=i*3; k<i*3+3; k++) {
      const key = Math.round(p.getX(k)*1e5)+','+Math.round(p.getY(k)*1e5)+','+Math.round(p.getZ(k)*1e5);
      const other = at.get(key);
      if (other === undefined) at.set(key,i); else parent[root(i)] = root(other);
    }
  }
  const pieces = new Map(), vertex = new THREE.Vector3();
  for (let i=0; i<faces; i++) {
    const id = root(i);
    if (!pieces.has(id)) pieces.set(id,{faces:[], box:new THREE.Box3()});
    const piece = pieces.get(id);
    piece.faces.push(i);
    for (let k=i*3; k<i*3+3; k++) piece.box.expandByPoint(vertex.fromBufferAttribute(p,k));
  }
  return pieces.values();
}

function splitParts(THREE, source, bounds) {
  const groups = {body:[], head:[], tail:[]}, size=bounds.getSize(new THREE.Vector3()), vertex=new THREE.Vector3();
  for (const piece of islands(THREE,source)) {
    piece.box.getCenter(vertex).sub(bounds.min).divide(size);
    const tail = vertex.z < .22 && Math.abs(vertex.x-.5) < .26 && vertex.y > .24;
    const head = vertex.z > .68 && vertex.y > .37 && piece.box.min.z > bounds.min.z+size.z*.44;
    groups[head ? 'head' : tail ? 'tail' : 'body'].push(...piece.faces);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, indices]) => {
    if (!indices.length) return [key,null];
    const geometry = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(source.attributes)) {
      const n = attr.itemSize, data = new Float32Array(indices.length*3*n);
      for (let i=0; i<indices.length; i++) {
        const start = indices[i]*3*n;
        data.set(attr.array.subarray(start,start+3*n),i*3*n);
      }
      geometry.setAttribute(name,new THREE.BufferAttribute(data,n));
    }
    return [key,geometry];
  }));
}

export function distantLights({THREE,mergeGeometries}, source) {
  const shape=new THREE.OctahedronGeometry(1), center=new THREE.Vector3(), size=new THREE.Vector3();
  const lights=[];
  for (const piece of islands(THREE,source)) {
    piece.box.getCenter(center);piece.box.getSize(size).multiplyScalar(.5);
    const g=shape.clone().scale(size.x,size.y,size.z).translate(center.x,center.y,center.z);
    const c=new THREE.Color().fromBufferAttribute(source.attributes.color,piece.faces[0]*3);
    const data=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<data.length;i+=3)c.toArray(data,i);
    g.setAttribute('color',new THREE.BufferAttribute(data,3));
    lights.push(g);
  }
  const result=mergeGeometries(lights);
  for(const g of lights)g.dispose();
  shape.dispose();
  return result;
}

export function beastSpecularAtlas(canvasTexture, THREE) {
  const tex = canvasTexture(192,64,(ctx) => {
    for (let strip=0; strip<3; strip++) {
      ctx.save(); ctx.translate(64*strip,0);
      ctx.beginPath();ctx.rect(0,0,64,64);ctx.clip();
      ctx.fillStyle = ['#4e4e4e','#262626','#898989'][strip];ctx.fillRect(0,0,64,64);
      ctx.strokeStyle = ['#a0a0a0','#777','#ddd'][strip];ctx.lineWidth = 1.3;
      for (let y=-8; y<70; y+=8) for (let x=-8; x<72; x+=8) {
        const u = x+(y%16 ? 4 : 0);
        ctx.beginPath();ctx.moveTo(u,y);
        if (strip===0) ctx.quadraticCurveTo(u+3,y+7,u+8,y);
        else if (strip===1) ctx.quadraticCurveTo(u+3,y+3,u+1,y+7);
        else ctx.lineTo(u+6,y+1);
        ctx.stroke();
      }
      ctx.restore();
    }
  });
  tex.colorSpace=THREE.NoColorSpace;
  tex.channel=1;
  return tex;
}

export function detailUV(THREE, geometry, surface) {
  const uv = geometry.attributes.uv, data = new Float32Array(uv.count*2);
  const strip = surface==='metal' ? 2 : surface==='fur' ? 1 : 0;
  for (let i=0; i<uv.count; i++) {
    data[2*i]=(strip+(1+62*Math.min(1,Math.max(0,uv.getX(i))))/64)/3;
    data[2*i+1]=(1+62*uv.getY(i))/64;
  }
  geometry.setAttribute('uv1',new THREE.BufferAttribute(data,2));
}

// 装甲、骨刺等附件的根部投到本关原型的真实表面；保持主题体形和原碰撞数据。
export function buildBeastDetail({THREE,mergeGeometries}, original, eyes, type, appearance, rage) {
  original.computeBoundingBox();
  const box=original.boundingBox, size=box.getSize(new THREE.Vector3());
  const pos=original.attributes.position, rgb=original.attributes.color;
  const aim=new THREE.Vector3(), hit=new THREE.Vector3(), bestPoint=new THREE.Vector3();
  const triangle=new THREE.Triangle(), accent=new THREE.Color(appearance.accent[type]), tint=new THREE.Color();
  const sphere=(segments,rings)=>new THREE.SphereGeometry(1,segments,rings).toNonIndexed();
  const plate=sphere(8,5), scale=sphere(14,8);
  const spur=new THREE.ConeGeometry(1,1,10,3).toNonIndexed();
  function surface(x,y,z) {
    aim.set(box.min.x+x*size.x,box.min.y+y*size.y,box.min.z+z*size.z);
    let nearest=Infinity, colorIndex=0;
    for (let i=0; i<pos.count; i+=3) {
      triangle.a.fromBufferAttribute(pos,i);
      triangle.b.fromBufferAttribute(pos,i+1);
      triangle.c.fromBufferAttribute(pos,i+2);
      triangle.closestPointToPoint(aim,hit);
      const d=hit.distanceToSquared(aim);
      if (d<nearest) {nearest=d;bestPoint.copy(hit);colorIndex=i;}
    }
    return {point:bestPoint.clone(), color:new THREE.Color().fromBufferAttribute(rgb,colorIndex)};
  }
  function piece(group,shape,anchor,w,h,d,pitch,roll,mix) {
    const geo=shape.clone();
    geo.scale(w,h,d).rotateX(pitch).rotateZ(roll);
    geo.translate(anchor.point.x,anchor.point.y,anchor.point.z);
    const colors=new Float32Array(geo.attributes.position.count*3);
    tint.copy(anchor.color).lerp(accent,mix);
    for (let i=0;i<colors.length;i+=3) tint.toArray(colors,i);
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    group.push(geo);
  }
  const midPieces=[original], highPieces=[], movableHead=[], movableTail=[];
  const w=Math.min(size.x,2.7), h=Math.min(size.y,3.2), d=Math.min(size.z,2.8);
  // 中模看得见的鳞脊、肩甲或背囊。原型本身精细时仅保留肩部一对。
  const rows=Math.min(4,Math.max(1,Math.round((680-pos.count/3)/128)));
  for (const s of [-1,1]) for (let row=0;row<rows;row++) {
    const anchor=surface(.5+s*.36,.63+(type===1?.09:0),.61-row*.13);
    piece(midPieces,plate,anchor,w*(type===1?.14:.09),h*(type===2?.095:.052),d*.12,-.20,s*.30,.3);
  }
  const mid=mergeGeometries(midPieces);
  for (const part of midPieces.slice(1)) part.dispose();
  const split=splitParts(THREE,mid,box), glow=splitParts(THREE,eyes,box);
  highPieces.push(split.body ?? original.clone());
  if (split.head) movableHead.push(split.head);
  if (split.tail) movableTail.push(split.tail);
  // 近模按原型分别增加猎手下颌、冲撞额甲、喷吐喉囊及首领双层骨冠。
  const head=surface(.5,type===2?.64:.68,.80), tail=surface(.5,.51,.18);
  for (const s of [-1,1]) {
    for (let row=0;row<3;row++) {
      const shoulder=surface(.5+s*(type===1?.39:.27),.73-row*.045,.60-row*.11);
      piece(highPieces,scale,shoulder,w*(type===1?.115:.062),h*(type===2?.066:.035),
        d*(type===0?.095:.085),-.32,s*.34,.42);
    }
    const cheek=surface(.5+s*.15,type===2?.59:.62,.86);
    piece(movableHead,scale,cheek,w*(type===1?.125:.075),h*(type===2?.10:.048),d*.11,-.1,s*.30,.4);
    for (let j=0;j<(type===3?4:3);j++) {
      const bite=surface(.5+s*(.13+j*.024),type===1||type===3?.81:.59,.91-j*.05);
      const inverted=type===0||type===2;
      piece(movableHead,spur,bite,w*.024,h*(rage?.15:.09),d*.028,
        inverted?Math.PI-.3:.34,s*.15,.79);
    }
    const flank=surface(.5+s*.25,type===0?.19:.39,.59);
    for (let j=0;j<3;j++) {
      const claw={point:flank.point.clone(),color:flank.color};
      claw.point.x+=s*(j-1)*w*.035;
      piece(highPieces,spur,claw,w*.017,h*.075,d*.026,1.2,s*.18,.75);
    }
    const rear=surface(.5+s*.11,.57,.13);
    piece(movableTail,scale,rear,w*.065,h*.047,d*.15,-.18,s*.25,.4);
    piece(movableTail,spur,rear,w*.036,h*.095,d*.045,-.9,s*.30,.62);
  }
  function finish(pieces,pivot,light) {
    for (const geo of pieces)
      geo.setAttribute('beastGlow',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count),1));
    if (light) {
      light.setAttribute('beastGlow',new THREE.BufferAttribute(new Float32Array(light.attributes.position.count).fill(1),1));
      pieces.push(light);
    }
    const result=mergeGeometries(pieces);
    for (const part of pieces) part.dispose();
    if (pivot) result.translate(-pivot.x,-pivot.y,-pivot.z);
    return result;
  }
  // 头尾上的发光部件随对应关节转动；躯干上的亮斑保留独立实例批次。
  const body=finish(highPieces,null,null);
  const headGeo=finish(movableHead,head.point,glow.head);
  const tailGeo=finish(movableTail,tail.point,glow.tail);
  let bodyEyes=glow.body;
  if (!bodyEyes) {
    bodyEyes=new THREE.BufferGeometry();
    bodyEyes.setAttribute('position',new THREE.Float32BufferAttribute([],3));
    bodyEyes.setAttribute('color',new THREE.Float32BufferAttribute([],3));
  }
  plate.dispose();scale.dispose();spur.dispose();
  return {mid,body,eyes:bodyEyes,head:headGeo,tail:tailGeo,headPivot:head.point,tailPivot:tail.point};
}
