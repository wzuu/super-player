"""在实际打包关卡里检查眼部弹道、肩后投影，以及鼠标和手柄混合输入。"""
import re
from campaign_browser import ROOT


PAD = """async () => {
  const {game:g, pollPad, prefs, config} = run, p = g.player;
  const axes = [0,0,0,0], pad = {mapping:'standard',index:0,connected:true,axes,buttons:[]};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
  const poll = (x, y, n=1) => {
    axes[2]=x; axes[3]=y;
    for(let i=0;i<n;i++) pollPad(1/60);
  };
  const move = dx => document.dispatchEvent(new MouseEvent('mousemove',{movementX:dx}));
  const yaw = () => p.look.rotation.y;
  const expected = (value, target, message) => {
    if(Math.abs(value-target)>1e-8) throw Error(message+' '+value+' vs '+target);
  };
  for(const shoulder of [false,true]) {
    p.thirdPerson = shoulder;
    let initial = yaw();
    for(let i=0;i<120;i++) {
      move(i<60 ? 2 : -2); poll(.151, .151);
    }
    expected(yaw(),initial,'静置摇杆改变鼠标往返');
    poll(1,0,60);
    expected(yaw()-initial,-850*.002*config.player.mouseSpeed,'满幅转向倍率');
    prefs.gamepad=false; initial=yaw(); poll(.95,0,60);
    expected(yaw(),initial,'关闭手柄后偏航');
    prefs.gamepad=true; poll(.23,0,60);
    expected(yaw(),initial,'重新启用手柄时沿用旧启动态');
    poll(.8,0); pad.connected=false; poll(.23,0); pad.connected=true;
    initial=yaw(); poll(.23,0,60);
    expected(yaw(),initial,'重新连接时沿用旧启动态');
    poll(.8,0); initial=yaw();
    const disconnected=new Event('gamepaddisconnected');
    Object.defineProperty(disconnected,'gamepad',{value:pad});
    window.dispatchEvent(disconnected); poll(.23,0,60);
    expected(yaw(),initial,'两帧间重接同编号手柄沿用旧启动态');
    poll(.8,0); initial=yaw();
    await setLock(false); move(30);
    const stale=new MouseEvent('mousemove',{movementX:60});
    Object.defineProperty(stale,'timeStamp',{value:0});
    await setLock(true); document.dispatchEvent(stale); poll(.23,0,60);
    expected(yaw(),initial,'重锁后输入未清除');
  }
}"""


SIGHTS = """stage => {
  const {game:g, camera, config} = run, p=g.player, w=g.weapon, m=g.beasts;
  Object.assign(p,{x:-20,y:45,z:0,thirdPerson:true,speedMix:0});
  p.look.rotation.set(0,0,0,'YXZ');
  m.pool.forEach(b=>b.active=false); m.live=0; m.refreshHash();
  const gate=g.level.box(p.x,-5,2,.2,44,49);
  const backWall=g.level.box(p.x+.3,1,2,.2,44,49);
  gate.active=backWall.active=false;
  const check=(condition,text)=>{if(!condition)throw Error(text)};
  const view = expectedDepth => {
    p.positionCamera(0);
    const orientation=camera.quaternion.clone(), eye=camera.position.clone();
    const expected=camera.getWorldDirection(eye.clone()).multiplyScalar(expectedDepth).add(eye);
    w.render(0,p,g); g.ui.update(0,g);
    check(orientation.angleTo(camera.quaternion)<1e-7,'近敌/掩体改变肩后偏航或俯仰');
    expected.project(camera);
    const cross=g.ui.nodes.cross.getBoundingClientRect();
    check(Math.hypot(cross.x-(1+expected.x)*innerWidth/2,cross.y-(1-expected.y)*innerHeight/2)<.08,
      '准星偏离眼部命中投影 '+expectedDepth);
    return {x:cross.x,reach:camera.position.distanceTo(eye)};
  };
  const far=view(config.weapon.range);
  const target=m.spawn(1,p.x,-2,p.y);
  target.height=2.3; target.hp=target.maxHP=1000; m.refreshHash();
  const near=view(-target.z1);
  check(Math.abs(far.x-near.x)>15,'近身命中仍显示远端准星');
  target.x+=4; m.refreshHash(); view(config.weapon.range);
  target.x=p.x; target.z=-8; m.refreshHash(); gate.active=true;
  const cover=view(-gate.z1);
  backWall.active=true;
  check(view(-gate.z1).reach<cover.reach-.5,'避墙未收近机位');
  backWall.active=false;
  config.weapon.baseSpread=config.weapon.maxSpread=0;
  // 模拟实际射击顺序，眼部机位在 weapon.update/shoot 前恢复。
  p.positionCamera(0); w.shoot(g);
  check(target.hp===1000,'穿过关闭的门命中');
  gate.active=false; view(-target.z1);
  p.positionCamera(0); w.shoot(g);
  check(target.hp<1000,'开门后的实际子弹未沿准星命中');
  p.thirdPerson=false; view(-target.z1);
  check(!w.aimScreen && g.ui.nodes.cross.getBoundingClientRect().x===innerWidth/2,'第一人称准星未归中');
  // 俯视脚下，近敌横穿准星；地板仍是眼部射线的有效命中面。
  // 实验室旧取样点现在是培养室设备。改从安检走廊中央检查无遮挡地面。
  if(stage==='underground-lab'){p.x=0;p.z=44;}
  p.thirdPerson=true; p.y=g.level.base(p.x,p.z)+5; p.look.rotation.x=-Math.PI/4;
  target.active=false; m.refreshHash(); p.positionCamera(0);
  const d=camera.getWorldDirection(camera.position.clone()), eye=camera.position.clone();
  const distance=(g.level.base(p.x,p.z)-eye.y)/d.y;
  const ground=(g.level.base(eye.x+d.x*distance,eye.z+d.z*distance)-eye.y)/d.y;
  check(!g.level.hash.ray(eye,d,ground-.01),'俯视地板样本被关卡实体遮挡');
  view(ground);
  target.active=true; target.x=p.x; target.z=p.z-1.7; target.y=eye.y-2.5; m.refreshHash();
  const close=(target.z1-eye.z)/d.z;
  check(close>0 && close<ground,'近身俯视目标位置'); view(close);
  // 既有后坐仍能改变画面；肩后偏移不会吞掉它，逻辑瞄准也不积累角度。
  config.player.steady=false; p.recoil=.04; p.recoilRoll=.01; p.shake=p.attackKick=p.impactLeft=0;
  p.positionCamera(0); const recoil=camera.quaternion.clone();
  check(recoil.angleTo(p.look.quaternion)>.02,'第一人称后坐丢失');
  w.render(0,p,g); check(camera.quaternion.angleTo(recoil)<1e-7,'肩后镜头改写后坐');
  return {weapon:w.skinId, shiftPixels:+(near.x-far.x).toFixed(2)};
}"""


def check_aiming(browser):
    for stage, query, shotgun in [
        ("practice", "?mode=tutorial", False),
        ("practice", "?mode=range", True),
        ("underground-lab", "", False),
    ]:
        page = browser.new_page(viewport={"width":960,"height":640})
        try:
            page.add_init_script("""window.requestAnimationFrame=()=>1;
              localStorage.setItem('super-player:preferences:v1',JSON.stringify({steady:true,gamepad:true}));
            """)
            def expose(route):
                html = (ROOT/stage/"index.html").read_text(encoding="utf-8")
                entry = "    startLevel(definition, campaign, campaignStage);"
                setup = ""
                if shotgun:
                    setup = """const s=document.getElementById('practice-weapon');
                      s.add(new Option('试验霰弹枪','shotgun-pump',true,true));"""
                html = html.replace(entry,setup+"window.run=startLevel(definition,campaign,campaignStage);")
                html = html.replace("return { game, scene, camera, renderer, config:",
                                    "return { game, scene, camera, renderer, prefs, pollPad, config:")
                route.fulfill(body=html,content_type="text/html")
            page.route(re.compile(r"/index\.html(?:\?.*)?$"),expose)
            page.goto((ROOT/stage/"index.html").as_uri()+query)
            page.wait_for_function("!!window.run",polling=100)
            page.evaluate("""() => {
              const canvas=document.getElementById('world');
              if (!Object.hasOwn(document,'pointerLockElement')) {
                let locked=null;
                Object.defineProperty(document,'pointerLockElement',{get:()=>locked});
                const signal=value=>{locked=value; document.dispatchEvent(new Event('pointerlockchange'))};
                canvas.requestPointerLock=()=>signal(canvas);
                document.exitPointerLock=()=>signal(null);
              }
              window.setLock=async on=>{
                if ((document.pointerLockElement===canvas)===on) return;
                const changed=new Promise(resolve=>document.addEventListener('pointerlockchange',resolve,{once:true}));
                if (on) await canvas.requestPointerLock(); else document.exitPointerLock();
                await changed;
              };
              return setLock(true);
            }""")
            page.evaluate(PAD)
            result = page.evaluate(SIGHTS, stage)
            assert (result["weapon"]=="shotgun-pump") == shotgun, result
            print("PASS 眼部弹道、肩后投影、手柄与重锁",stage,query,result,flush=True)
        finally:
            page.close()
