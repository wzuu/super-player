// 房间和连接廊共用这张占地图。只在可走地板的外沿构建墙体，相交的房间自然连通。
export function floorPlan(areas, halfX, halfZ, cell = 2) {
  const rows = [];
  for (let z = -halfZ + cell/2; z < halfZ; z += cell) {
    let row = '';
    for (let x = -halfX + cell/2; x < halfX; x += cell) {
      const room = areas.find(({bounds:[x0,z0,x1,z1]}) => x>=x0 && x<x1 && z>=z0 && z<z1);
      row += room?.tile ?? '#';
    }
    rows.push(row);
  }
  return rows;
}

export function buildFacility(ctx, plan) {
  const {THREE,scene,GRID,level,StaticBatches,shapes,canvasTexture,brighter}=ctx;
  const materials = {
    wall:new THREE.MeshStandardMaterial({roughness:plan.roughness,metalness:plan.metalness}),
    trim:new THREE.MeshLambertMaterial(),
    light:new THREE.MeshBasicMaterial(),
    glass:new THREE.MeshStandardMaterial({transparent:true,opacity:.29,roughness:.2,depthWrite:false}),
  };
  const batch=new StaticBatches(materials,shapes);
  const floor=plan.ground;
  const shape=(geometry,material,x,y,z,w,h,d,color,yaw=0,rx=0,rz=0) =>
    batch.add(geometry,material,x,y+floor(x,z),z,w,h,d,color,yaw,rx,rz);
  const box=(material,x,y,z,w,h,d,color,yaw=0)=>shape('box',material,x,y,z,w,h,d,color,yaw);
  function solid(x,z,w,d,h,color,bottom=0) {
    box('wall',x,bottom+h/2,z,w,h,d,color);
    const y=floor(x,z)+bottom;
    const collider=level.box(x,z,w,d,y,y+h);
    level.viewOccluders.push(collider);
    return collider;
  }
  const groundVertices=[],uv=[];
  const cells=GRID.cells,size=GRID.cell,half=size/2;
  function walkable(r,c) {
    return cells[r]?.[c] !== undefined && cells[r][c]!=='#';
  }
  for(let r=0;r<GRID.rows;r++) for(let c=0;c<GRID.columns;c++) {
    if(!walkable(r,c)) continue;
    const x=GRID.x(c),z=GRID.z(r);
    for(const [dx,dz] of [[-half,-half],[-half,half],[half,half],[-half,-half],[half,half],[half,-half]]) {
      groundVertices.push(x+dx,floor(x+dx,z+dz),z+dz);
      uv.push((x+dx)/4,(z+dz)/4);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(groundVertices,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();
  const texture=canvasTexture(128,128,plan.floorTexture,true);
  scene.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:texture,roughness:plan.roughness,metalness:plan.metalness})));

  // 同一条边上最多合并四米墙板，坡面墙的下缘延伸至相邻踏面下方。
  for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const lines=dr?GRID.rows:GRID.columns, length=dr?GRID.columns:GRID.rows;
    for(let line=0;line<lines;line++) {
      let start=-1;
      for(let k=0;k<=length;k++) {
        const r=dr?line:k,c=dr?k:line;
        const edge=k<length && walkable(r,c) && !walkable(r+dr,c+dc);
        if(start>=0 && (!edge || (k-start)*size>=4)) {
          const mid=(start+k-1)/2;
          const x=GRID.x(dr?mid:line)+dc*half,z=GRID.z(dr?line:mid)+dr*half;
          const span=(k-start)*size,w=dr ? span : .36,d=dr ? .36 : span;
          const wall={x,z,w,d,span,dr,dc,line,start};
          if(!plan.edge?.(wall,{shape,box,solid,level,floor,brighter})) solid(x,z,w,d,plan.wallHeight+.5,plan.wallColor,-.5);
          start=-1;
        }
        if(edge && start<0) start=k;
      }
    }
  }
  // 方向牌附着于实际舱门或房间，隐藏 HUD 后仍能从玩家视角辨认转向。
  function sign(text,x,y,z,width,height,yaw=0,ink='#b9f4e5',background='#16292e') {
    const map=canvasTexture(512,96,(g,w,h)=>{
      g.fillStyle=background;g.fillRect(0,0,w,h);
      g.strokeStyle=ink;g.lineWidth=3;g.strokeRect(5,5,w-10,h-10);
      g.fillStyle=ink;g.font='bold 44px sans-serif';g.textAlign='center';g.textBaseline='middle';
      g.fillText(text,w/2,h/2+1,w-28);
    });
    const placard=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map}));
    placard.position.set(x,y+floor(x,z),z);placard.rotation.y=yaw;scene.add(placard);
  }
  const model={...ctx,shape,box,solid,sign,floor};
  const data=plan.decorate(model) ?? {};
  batch.flush();
  for(const [name,position] of Object.entries(plan.spots)) {
    const [x,z]=position;
    level[name].set(x,floor(x,z),z);
  }
  return data;
}
