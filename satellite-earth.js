// Real GeoColor pixels reprojected to the geographic globe. Satellite images
// already contain their day/night lighting and clouds: never light them twice.
export async function createSatelliteEarth({ THREE, renderer, scene, altitude, sunDir, lite = false, canInstall = () => true }) {
  const root = new URL('./assets/satellite/', import.meta.url);
  const placeholder = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
  placeholder.needsUpdate = true;
  const uniforms = { altitude, sunDir: {value:sunDir}, conus:{value:placeholder}, hasConus:{value:0},
    conusExtent:{value:new THREE.Vector4(-.10136,.12824,.03864,.04424)},
    fallback:{value:placeholder} };
  for(let i=0;i<5;i++) {
    uniforms['disk'+i]={value:placeholder};
    uniforms['spec'+i]={value:new THREE.Vector4(0,.151872,0,0)};
  }
  const status = { mode:'fallback', generatedAt:null, satellites:[], errors:[] };
  const loader = new THREE.TextureLoader();
  // Loading an image must not upload it. A request started behind the video
  // may finish after the next flight has made the globe visible again.
  const load = url => new Promise((resolve,reject) => {
    let settled=false, texture;
    const fail = error => {
      if(settled)return;
      settled=true;clearTimeout(deadline);texture?.dispose();reject(error);
    };
    const deadline=setTimeout(()=>fail(new Error('Satellite image timeout')),15000);
    try{
      texture=loader.load(url,t=>{
        if(settled)return; // The timed-out texture has already been disposed.
        settled=true;clearTimeout(deadline);
        t.colorSpace=THREE.SRGBColorSpace;
        t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
        resolve(t);
      },undefined,fail);
    }catch(error){fail(error);}
  });
  // Everything before main(): the uniforms and the projection. Shared by the
  // full shader and, in lite, by the bake and the per-frame shader that reads it.
  const shaderHead=`
      varying vec3 world; varying vec2 baseUv;
      uniform float altitude,hasConus; uniform vec3 sunDir;
      uniform sampler2D fallback,conus,disk0,disk1,disk2,disk3,disk4;
      uniform vec4 spec0,spec1,spec2,spec3,spec4,conusExtent;
      const float PI=3.141592653589793;
      // Ellipsoidal geostationary projection (sweep X for GOES, Y elsewhere).
      vec3 project(vec3 normal,vec4 spec){
        float lat=asin(clamp(normal.y,-1.,1.));
        float lon=atan(-normal.z,normal.x);
        float b=6356752.31414/6378137.;
        float h=42164160./6378137.;
        float pc=atan(b*b*tan(lat));
        float rc=b/sqrt(1.-(1.-b*b)*cos(pc)*cos(pc));
        float dl=lon-spec.x;
        vec3 p=vec3(rc*cos(pc)*cos(dl),rc*cos(pc)*sin(dl),rc*sin(pc));
        float sx=h-p.x;
        float len=length(vec3(sx,p.y,p.z));
        vec2 scan=spec.z<.5 ? vec2(asin(p.y/len),atan(p.z,sx))
                           : vec2(atan(p.y,sx),asin(p.z/len));
        float face=cos(lat)*cos(dl);
        float visible=step(1.,h*p.x)*smoothstep(.19,.36,face);
        return vec3(scan,visible*pow(max(face,0.),8.)*spec.w);
      }
      vec4 sampleDisk(sampler2D image,vec4 spec,vec3 n){
        vec3 p=project(n,spec); vec2 uv=.5+p.xy/(2.*spec.y);
        float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
        return vec4(texture2D(image,clamp(uv,0.,1.)).rgb,p.z*inside);
      }
`;
  const material = new THREE.ShaderMaterial({
    uniforms, toneMapped:false,
    vertexShader:`varying vec3 world; varying vec2 baseUv;
      void main(){world=position; baseUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:shaderHead+`      void main(){
        vec3 n=normalize(world);
        vec4 a=sampleDisk(disk0,spec0,n),b=sampleDisk(disk1,spec1,n),
          c=sampleDisk(disk2,spec2,n),d=sampleDisk(disk3,spec3,n),e=sampleDisk(disk4,spec4,n);
        float sum=a.a+b.a+c.a+d.a+e.a;
        vec3 base=texture2D(fallback,baseUv).rgb;
        base*=mix(.09,1.,smoothstep(-.12,.14,dot(n,sunDir)));
        vec3 actual=(a.rgb*a.a+b.rgb*b.a+c.rgb*c.a+d.rgb*d.a+e.rgb*e.a)/max(sum,.000001);
        vec3 color=mix(base,actual,smoothstep(0.,.00012,sum));
        // The original regional image includes real state outlines. Blend it
        // in before the higher-resolution destination mosaics cover it.
        vec3 p=project(n,vec4(-75.2*PI/180.,.151872,0.,1.));
        vec2 uv=(p.xy-conusExtent.xw)/(conusExtent.zy-conusExtent.xw);
        float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
        float regional=hasConus*smoothstep(0.,.025,edge)*step(.00001,p.z)
          *(1.-smoothstep(.30,.95,altitude));
        color=mix(color,texture2D(conus,clamp(uv,0.,1.)).rgb,regional);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
  // Lite. The shader above reprojects five disks for every pixel of every
  // frame, and on a Fire Stick that held the globe to 3 or 4 frames a second.
  // The disks only change when a batch installs, so here the reprojection is
  // done once per batch, into a map laid out like the sphere's own uv, and each
  // frame reads the map. The fallback's lighting and the regional image stay
  // per frame, because one follows the sun and the other fades with altitude.
  let bake=()=>{}, liteMaterial=null;
  if(lite){
    const width=Math.min(4096,renderer.capabilities.maxTextureSize);
    const target=new THREE.WebGLRenderTarget(width,width/2,{colorSpace:THREE.SRGBColorSpace,
      depthBuffer:false,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
    target.texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const bakeCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      uniforms, toneMapped:false, depthTest:false, depthWrite:false,
      vertexShader:`varying vec3 world; varying vec2 baseUv;
        void main(){world=vec3(0.);baseUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:shaderHead+`      void main(){
        // The point this texel covers, in SphereGeometry's own uv layout, so
        // the map lies on the mesh with no remapping.
        float phi=baseUv.x*2.*PI,theta=(1.-baseUv.y)*PI;
        vec3 n=vec3(-cos(phi)*sin(theta),cos(theta),sin(phi)*sin(theta));
        vec4 a=sampleDisk(disk0,spec0,n),b=sampleDisk(disk1,spec1,n),
          c=sampleDisk(disk2,spec2,n),d=sampleDisk(disk3,spec3,n),e=sampleDisk(disk4,spec4,n);
        float sum=a.a+b.a+c.a+d.a+e.a;
        vec3 actual=(a.rgb*a.a+b.rgb*b.a+c.rgb*c.a+d.rgb*d.a+e.rgb*e.a)/max(sum,.000001);
        gl_FragColor=vec4(actual,smoothstep(0.,.00012,sum));
        #include <colorspace_fragment>
      }`}));
    quad.frustumCulled=false;
    const bakeScene=new THREE.Scene().add(quad);
    // Start with no coverage, so the fallback shows until the first batch
    // lands. The empty render also builds the mip chain, without which the
    // map would be incomplete and sample as black.
    const previous=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),
      clearAlpha=renderer.getClearAlpha();
    renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();
    renderer.render(new THREE.Scene(),bakeCamera);
    renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,clearAlpha);
    // In strips, one a frame. The whole map at once is around a second of GPU
    // time on a Fire Stick, which would freeze the feed that is on screen.
    const STRIPS=16;let job=0;
    bake=()=>{
      const mine=++job;let strip=0;
      const step=()=>{
        if(mine!==job)return;            // a newer batch has started over
        const rows=target.height/STRIPS,previous=renderer.getRenderTarget();
        target.scissor.set(0,strip*rows,target.width,rows);target.scissorTest=true;
        target.texture.generateMipmaps=strip===STRIPS-1;   // once, after the last
        renderer.setRenderTarget(target);renderer.render(bakeScene,bakeCamera);
        renderer.setRenderTarget(previous);
        if(++strip<STRIPS)requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    liteMaterial=new THREE.ShaderMaterial({
      uniforms:{...uniforms,baked:{value:target.texture}}, toneMapped:false,
      vertexShader:material.vertexShader,
      fragmentShader:shaderHead+`      uniform sampler2D baked;
      void main(){
        vec3 n=normalize(world);
        vec3 base=texture2D(fallback,baseUv).rgb;
        base*=mix(.09,1.,smoothstep(-.12,.14,dot(n,sunDir)));
        vec4 satellite=texture2D(baked,baseUv);
        vec3 color=mix(base,satellite.rgb,satellite.a);
        // The regional image as the full shader blends it. It is faded out
        // from orbit, so there its one projection is skipped.
        if(hasConus>.5&&altitude<.95){
          vec3 p=project(n,vec4(-75.2*PI/180.,.151872,0.,1.));
          vec2 uv=(p.xy-conusExtent.xw)/(conusExtent.zy-conusExtent.xw);
          float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
          float regional=smoothstep(0.,.025,edge)*step(.00001,p.z)
            *(1.-smoothstep(.30,.95,altitude));
          color=mix(color,texture2D(conus,clamp(uv,0.,1.)).rgb,regional);
        }
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`});
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1,160,96),liteMaterial||material);
  mesh.name='geocolor-earth'; scene.add(mesh);
  uniforms.fallback.value=await load(new URL('./assets/earth-day.jpg',import.meta.url).href).catch(()=>placeholder);
  // The fallback is the first visible surface and must also work when callers
  // start with canInstall=false. Subsequent satellite work uses the phase gate.
  if(uniforms.fallback.value!==placeholder)renderer.initTexture(uniforms.fallback.value);
  let lastCheck=0, refreshing=false, pending=null;
  let installing=null, completedGeneration=null;
  const installedRows=new Map();
  const textureName=i=>i==='conus'?'conus':'disk'+i;
  function installPending(){
    if(installing)return installing;
    if(!pending || !canInstall())return Promise.resolve();
    installing=advancePending().finally(()=>{installing=null;});
    return installing;
  }
  async function advancePending(){
    const batch=pending;
    while(batch.next<batch.requests.length){
      // Pause both new image work and uploads until the next covered phase.
      // The app calls installPending while live; no polling timer is required.
      if(!canInstall())return;
      const request=batch.requests[batch.next],{i,row}=request,name=textureName(i);
      const previous=installedRows.get(i);
      if(!request.texture && row.sha256 && previous?.sha256===row.sha256 && previous?.id===row.id){
        batch.updates.push({i,row,texture:uniforms[name].value});
        batch.next++;continue;
      }
      try {
        if(!request.texture){
          const url=new URL(row.image,batch.imageRoot);
          url.searchParams.set('v',row.sha256?.slice(0,12)||batch.manifest.generatedAt);
          request.texture=await load(url.href);
        }
        // Recheck after decode: the user may have pressed Next meanwhile.
        if(!canInstall())return;
        renderer.initTexture(request.texture);
        batch.updates.push({i,row,texture:request.texture});
      }catch{
        request.texture?.dispose();batch.failed=true;
        status.errors.push(i==='conus'?'Regional image unavailable':'Image unavailable: '+row.id);
      }
      batch.next++;
      // One upload per task, allowing input/phase changes between large maps.
      if(batch.next<batch.requests.length)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!canInstall())return;
    for(const {i,row,texture} of batch.updates){
      const name=textureName(i),old=uniforms[name].value;
      uniforms[name].value=texture;installedRows.set(i,row);
      if(i==='conus'){
        uniforms.hasConus.value=1;uniforms.conusExtent.value.fromArray(row.extent);
      }else uniforms['spec'+i].value.set(row.longitude*Math.PI/180,row.half,row.sweep==='y'?1:0,1);
      if(old!==placeholder && old!==texture)old.dispose();
    }
    if(batch.updates.length){
      bake();                            // lite only; a no-op otherwise
      status.generatedAt=batch.manifest.generatedAt;
      // A failed replacement retains the previous capture metadata as well as
      // its pixels. A new manifest date must not falsely freshen an old image.
      status.satellites=[...installedRows].filter(([i])=>i!=='conus').map(([,row])=>row);
      if(status.satellites.length)status.mode='geocolor';
    }
    if(!batch.failed)completedGeneration=batch.manifest.generatedAt;
    status.errors=status.errors.slice(-8);
    pending=null;window.dispatchEvent(new Event('rt-credit'));
  }
  async function refresh(force=false) {
    await installPending();
    if(refreshing || pending || (!force && Date.now()-lastCheck<20*60*1000)) return;
    refreshing=true;lastCheck=Date.now();
    try {
      let manifest, imageRoot=root;
      for(const base of [root,new URL('https://anthonybono21-cloud.github.io/roundtrip/assets/satellite/')]){
        const controller=new AbortController();
        const deadline=setTimeout(()=>controller.abort(),12000);
        try{
          const response=await fetch(new URL('manifest.json',base),{cache:'no-cache',signal:controller.signal});
          if(!response.ok)continue;
          manifest=await response.json();imageRoot=base;break;
        }catch{}finally{clearTimeout(deadline);}
      }
      if(!manifest)throw new Error('Satellite imagery unavailable; keeping last good Earth');
      if(completedGeneration===manifest.generatedAt) return;
      const requests=manifest.satellites.slice(0,5).map((row,i)=>({i,row}));
      if(manifest.conus)requests.push({i:'conus',row:manifest.conus});
      pending={updates:[],requests,next:0,failed:false,manifest,imageRoot};
      await installPending();
    } catch(error){status.errors.push(error.message);}
    finally {refreshing=false;status.errors=status.errors.slice(-8);}
    window.dispatchEvent(new Event('rt-credit'));
  }
  await refresh(true);
  return {mesh,status,refresh,installPending};
}
