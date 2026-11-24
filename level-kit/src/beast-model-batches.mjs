import {detailedBody, distantBody, fitBeastModel, hideTexture} from '@level-kit/beast-visuals.mjs';
import {beastSpecularAtlas, buildBeastDetail, detailUV, distantLights} from '@level-kit/beast-detail-model.mjs';

export function createBeastBatches(manager, context, definition, basicModel, graphics) {
  const {THREE,CONFIG}=context, {canvasTexture,dynamicMesh,updateMesh,markInstancePrefix}=graphics;
  const appearance=CONFIG.beasts.appearance, materials=new Map(), textures=new Map();
  const surfaces=appearance.surfaces[definition.weaponSkin] ?? [];
  const atlas=beastSpecularAtlas(canvasTexture,THREE);
  const eyeMaterial=new THREE.MeshBasicMaterial({vertexColors:true,fog:false});
  const specularMaterials=[];
  function surfaceMaterial(surface,detail) {
    const key=(surface||'plain')+(detail?'-detail':'');
    if(materials.has(key))return materials.get(key);
    if(surface && !textures.has(surface))textures.set(surface,hideTexture(canvasTexture,surface));
    const texture=textures.get(surface);
    const material=surface ? new THREE.MeshPhongMaterial({
      vertexColors:true,map:texture,specularMap:detail ? atlas : texture,
      specular:surface==='metal'?0x565e69:0x241f1d,shininess:surface==='metal'?32:8,
    }) : new THREE.MeshLambertMaterial({vertexColors:true});
    // 原型的顶点色一直保留；精模中随头、尾运动的亮斑共用其关节批次。
    material.customProgramCacheKey=()=>detail?'beast-detail':'beast-body';
    material.onBeforeCompile=shader=>{
      const glow=detail?'attribute float beastGlow; attribute float beastLight; varying float vGlow;':'';
      shader.vertexShader='attribute float beastFlash; varying float vBeastFlash;\n'+glow+'\n'+shader.vertexShader
        .replace('#include <begin_vertex>','#include <begin_vertex>\n vBeastFlash=beastFlash;'+(detail?'vGlow=beastGlow*beastLight;':''));
      shader.fragmentShader='varying float vBeastFlash;\n'+(detail?'varying float vGlow;\n':'')+shader.fragmentShader
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
          float edge=1.0-abs(dot(normal,normalize(vViewPosition)));
          totalEmissiveRadiance+=vec3(1.25)*vBeastFlash+diffuseColor.rgb*edge*edge*${Number(appearance.rim).toFixed(4)};
          ${detail?'totalEmissiveRadiance+=vColor*vGlow;':''}`);
    };
    materials.set(key,material);
    if(detail)specularMaterials.push(material);
    return material;
  }
  function bodyMesh(geometry,capacity,surface,detail=false) {
    const attribute=()=>new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('beastFlash',attribute());
    if(detail) {
      detailUV(THREE,geometry,surface);
      geometry.setAttribute('beastLight',attribute());
    }
    return dynamicMesh(geometry,surfaceMaterial(surface,detail),capacity);
  }
  function pair(body,eye,capacity,surface,detail=false) {
    return [bodyMesh(body,capacity,surface,detail),dynamicMesh(eye,eyeMaterial,capacity)];
  }
  const legacy=[], mid=[], high=[], far=[], legacyFar=[], joints=[];
  manager.footprints=[];
  function add(type,stats,source,eye,rage) {
    const surface=surfaces[type] ?? 'hide';
    const capacity=(type===3 ? 1 : manager.pool.length)+appearance.corpses;
    const highCapacity=(type===3 ? 1 : Math.max(...Object.values(appearance.nearBudgets)))+appearance.corpses;
    const original=detailedBody(context,source,type,appearance,rage);
    const reduced=type!==3 ? distantBody(THREE,source,appearance.gridCells):null;
    // 尺寸沿用已交付的模型+眼睛；精模和关节不参与命中盒与移动半径。
    manager.footprints.push(fitBeastModel(original,eye,reduced,stats,appearance.scale[type][0]));
    const parts=buildBeastDetail(context,original,eye,type,appearance,rage);
    const lights=distantLights(context,eye);
    let middle=parts.mid;
    // 在本身部件繁密的关卡削减中模，头尾分件和近模原型仍使用未简化的网格。
    if ((middle.attributes.position.count+lights.attributes.position.count)/3>800) {
      const clustered=distantBody(THREE,middle,22);
      if(clustered.attributes.position.count>0 && clustered.attributes.position.count<middle.attributes.position.count) {
        middle.dispose();
        middle=clustered;
      } else clustered.dispose();
    }
    legacy.push(pair(original,eye,capacity,surface));
    mid.push(pair(middle,lights,capacity,null));
    high.push(pair(parts.body,parts.eyes,highCapacity,surface,true));
    joints.push({
      head:bodyMesh(parts.head,highCapacity,surface,true),headPivot:parts.headPivot,
      tail:bodyMesh(parts.tail,highCapacity,surface,true),tailPivot:parts.tailPivot,
    });
    if(reduced) {
      legacyFar.push(pair(reduced.clone(),eye,capacity,null));
      far.push(pair(reduced,lights,capacity,null));
    }
  }
  CONFIG.beasts.types.forEach((stats,type)=>{
    const [source,eye]=definition.buildBeastModel?.(type,context) ?? basicModel(type);
    // 先克隆，再统一缩放。回退首领使用相同基础模型的独立眼睛几何。
    const rage=type===3 ? definition.buildRageModel?.(context) ?? [source,eye.clone()]:null;
    add(type,stats,source,eye,false);
    if(rage) {
      manager.rageBatch=legacy.length;
      add(type,stats,rage[0],rage[1],true);
      if(rage[0]!==source)rage[0].dispose();
    }
    source.dispose();
  });
  manager.midStart=legacy.length;
  manager.nearStart=manager.midStart+mid.length;
  manager.legacyFarStart=manager.nearStart+high.length;
  manager.farStart=manager.legacyFarStart+legacyFar.length;
  manager.modelBatches=[...legacy,...mid,...high,...legacyFar,...far];
  const warmMeshes=[...high,...mid,...far].flat();
  for(const {head,tail} of joints)warmMeshes.push(head,tail);
  const eyes=new Set([...high,...mid,...far].map(pair=>pair[1]));
  const warmScene=new THREE.Scene();
  warmScene.matrixWorldAutoUpdate=false;
  let warmIndex=0;
  const parent=new THREE.Matrix4(), relative=new THREE.Matrix4(), rotation=new THREE.Euler(0,0,0,'YXZ');
  let specular=true;
  return {
    joints,
    prepareMaterial(renderer,scene,camera,target) {
      const mesh=warmMeshes[warmIndex];
      if(!mesh)return;
      warmIndex++;
      // 用真实的几何、材质与灯光提交零实例，完成首次上传与编译，不改变真正相机的场景内容。
      warmScene.children.length=0;
      scene.traverseVisible(o=>{if(o.isLight)warmScene.children.push(o);});
      warmScene.fog=scene.fog;warmScene.environment=scene.environment;
      warmScene.children.push(mesh);
      const previous=renderer.getRenderTarget(),clear=renderer.autoClear,visible=mesh.visible,count=mesh.count;
      if(eyes.has(mesh) && !mesh.instanceColor)mesh.setColorAt(0,new THREE.Color(1,1,1));
      mesh.visible=true;mesh.count=0;
      try {
        renderer.setRenderTarget(target);renderer.autoClear=false;renderer.render(warmScene,camera);
      }finally{
        mesh.visible=visible;mesh.count=count;renderer.autoClear=clear;renderer.setRenderTarget(previous);
        warmScene.children.length=0;
      }
    },
    apply(form,index,bodyMatrix,headPitch,headYaw,tailPitch,tailYaw,flash,light) {
      bodyMatrix.getMatrixAt(index,parent);
      const part=joints[form];
      for(const key of ['head','tail']) {
        const mesh=part[key];
        rotation.set(key==='head'?headPitch:tailPitch,key==='head'?headYaw:tailYaw,0,'YXZ');
        relative.makeRotationFromEuler(rotation).setPosition(key==='head'?part.headPivot:part.tailPivot);
        relative.premultiply(parent);
        mesh.setMatrixAt(index,relative);
        mesh.geometry.attributes.beastFlash.setX(index,flash);
        mesh.geometry.attributes.beastLight.setX(index,light);
      }
    },
    flush() {
      if (appearance.detailSpecular!==specular) {
        specular=appearance.detailSpecular;
        for(const mat of specularMaterials) {mat.specularMap=specular?atlas:null; mat.needsUpdate=true;}
      }
      for(let form=0;form<joints.length;form++) {
        const batch=manager.nearStart+form,count=manager.counts[batch];
        if(count)markInstancePrefix(manager.modelBatches[batch][0].geometry.attributes.beastLight,count);
        for(const mesh of [joints[form].head,joints[form].tail]) {
          mesh.visible=count>0;
          if(count) {
            markInstancePrefix(mesh.geometry.attributes.beastFlash,count);
            markInstancePrefix(mesh.geometry.attributes.beastLight,count);
          }
          updateMesh(mesh,count);
        }
      }
    },
  };
}
