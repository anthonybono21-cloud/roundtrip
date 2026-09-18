import test from 'node:test';
import assert from 'node:assert/strict';
import { createSatelliteEarth } from '../satellite-earth.js';

function manifest(generation, hash='a1') {
  return {generatedAt:generation,satellites:[
    {id:'east',longitude:-75.2,half:.151872,sweep:'x',image:'east.jpg',sha256:hash,timestamp:generation},
    {id:'west',longitude:-137,half:.151872,sweep:'x',image:'west.jpg',sha256:'b1',timestamp:'original-west'},
  ],conus:{image:'conus.jpg',sha256:'c1',extent:[-.10136,.12824,.03864,.04424]}};
}
async function fixture(t, initial=manifest('first'), initialSafe=true) {
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
  t.after(()=>{globalThis.fetch=originalFetch;globalThis.window=originalWindow;});
  const state={manifest:initial,safe:initialSafe,loads:[],uploads:[],onLoad:null,failLoad:false,failUpload:false};
  globalThis.window={dispatchEvent(){}};
  globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(state.manifest)});
  class Texture {
    constructor(url){this.url=url;this.disposals=0;}
    dispose(){this.disposals++;}
  }
  class TextureLoader {
    load(url,onLoad,_progress,onError){
      const texture=new Texture(url);state.loads.push(texture);
      queueMicrotask(()=>{
        state.onLoad?.(texture);
        if(state.failLoad)onError(new Error('test load failure'));else onLoad(texture);
      });
      return texture;
    }
  }
  class Vector4 {
    constructor(...values){this.values=values;}
    set(...values){this.values=values;}
    fromArray(values){this.values=[...values];}
  }
  const THREE={
    DataTexture:Texture,TextureLoader,Vector4,SRGBColorSpace:'srgb',
    ShaderMaterial:class {constructor(options){Object.assign(this,options);}},
    SphereGeometry:class {},
    Mesh:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
  };
  const renderer={capabilities:{getMaxAnisotropy:()=>16},initTexture(texture){
    state.uploads.push({texture,safe:state.safe});
    if(state.failUpload)throw new Error('test GPU failure');
  }};
  state.earth=await createSatelliteEarth({THREE,renderer,scene:{add(){}},altitude:{value:2},sunDir:{},canInstall:()=>state.safe});
  state.uniforms=state.earth.mesh.material.uniforms;
  return state;
}

test('same image hashes across a new manifest preserve textures and update metadata',async t=>{
  const f=await fixture(t),before=f.loads.length,uploads=f.uploads.length;
  const east=f.uniforms.disk0.value,west=f.uniforms.disk1.value,conus=f.uniforms.conus.value;
  f.manifest=manifest('second');
  await f.earth.refresh(true);
  assert.equal(f.loads.length,before,'unchanged images must not be requested/decoded again');
  assert.equal(f.uploads.length,uploads,'unchanged images must not be reuploaded');
  assert.equal(f.uniforms.disk0.value,east);assert.equal(f.uniforms.disk1.value,west);assert.equal(f.uniforms.conus.value,conus);
  assert.equal(east.disposals+west.disposals+conus.disposals,0);
  assert.equal(f.earth.status.generatedAt,'second');
  assert.equal(f.earth.status.satellites[0].timestamp,'second');
});

test('a decode finishing during flight defers GPU upload and remaining image work',async t=>{
  const f=await fixture(t),beforeLoads=f.loads.length,beforeUploads=f.uploads.length;
  const old=f.uniforms.disk0.value;
  f.manifest=manifest('second','a2');
  f.manifest.satellites[1].sha256='b2';
  f.onLoad=()=>{f.safe=false;};
  await f.earth.refresh(true);
  assert.equal(f.loads.length,beforeLoads+1,'pause before starting another decode');
  assert.equal(f.uploads.length,beforeUploads,'no upload while the globe is visible');
  assert.equal(f.uniforms.disk0.value,old);assert.equal(old.disposals,0);
  await f.earth.installPending();
  assert.equal(f.loads.length,beforeLoads+1,'unsafe calls neither poll nor restart work');
  f.onLoad=null;f.safe=true;
  await f.earth.installPending();
  assert.equal(f.loads.length,beforeLoads+2,'resume remaining changed images only');
  assert.equal(f.uploads.length,beforeUploads+2);
  assert.ok(f.uploads.every(x=>x.safe));
  assert.notEqual(f.uniforms.disk0.value,old);assert.equal(old.disposals,1);
  assert.equal(f.earth.status.generatedAt,'second');
});

test('failed replacement preserves last good pixels and capture metadata, and can retry',async t=>{
  const f=await fixture(t),old=f.uniforms.disk0.value;
  f.manifest=manifest('second','a2');f.failUpload=true;
  await f.earth.refresh(true);
  const failed=f.loads.at(-1);
  assert.equal(failed.disposals,1,'failed new GPU texture is released');
  assert.equal(f.uniforms.disk0.value,old);assert.equal(old.disposals,0);
  assert.equal(f.earth.status.satellites[0].timestamp,'first','manifest time must not freshen old pixels');
  f.failUpload=false;
  await f.earth.refresh(true);
  assert.notEqual(f.uniforms.disk0.value,old);assert.equal(old.disposals,1);
  assert.equal(f.earth.status.satellites[0].timestamp,'second');
});

test('closed phase gate pauses manifest work without blocking initial fallback',async t=>{
  const f=await fixture(t,manifest('first'),false);
  assert.equal(f.loads.length,1,'only the fallback loads while the phase gate is closed');
  assert.equal(f.uploads.length,1,'the fallback still gets its initial GPU upload');
  assert.equal(f.earth.status.mode,'fallback');
  f.safe=true;await f.earth.installPending();
  assert.equal(f.loads.length,4,'satellite decoding resumes when the gate opens');
  assert.equal(f.earth.status.mode,'geocolor');
});
