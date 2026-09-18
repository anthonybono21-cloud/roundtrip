import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDirectVideo } from '../live-video.js';

const camera={kind:'hls',url:'https://example.test/live.m3u8'};
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};

function fixture(native=false){
  const doc=new EventTarget();doc.hidden=false;
  const video=new EventTarget();Object.assign(video,{src:'',plays:0,pauses:0,loads:0,
    canPlayType:()=>native?'maybe':'',play(){this.plays++;return Promise.resolve();},
    pause(){this.pauses++;},load(){this.loads++;},removeAttribute(){this.src='';}});
  return {doc,video};
}

function fakeHls(){
  let instance;
  class Hls{
    static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};
    static ErrorTypes={MEDIA_ERROR:'media'};
    static isSupported(){return true;}
    constructor(config){instance=this;this.config=config;this.handlers={};
      this.destroyed=0;this.stops=0;this.starts=0;this.sources=0;this.recoveries=0;}
    on(event,fn){this.handlers[event]=fn;}
    loadSource(){this.sources++;} attachMedia(){} destroy(){this.destroyed++;}
    stopLoad(){this.stops++;} startLoad(){this.starts++;}
    recoverMediaError(){this.recoveries++;}
  }
  return {Hls,get instance(){return instance;}};
}
test('native HLS starts without loading a second player and releases the source',()=>{
  const {doc,video}=fixture(true);
  const player=mountDirectVideo(video,camera,
    {doc,load:()=>{throw new Error('must not load JS player');}});
  assert.equal(video.src,'https://example.test/live.m3u8');assert.equal(video.plays,1);
  player.destroy();player.destroy();assert.equal(video.src,'');assert.equal(video.loads,1);
});
test('switching cameras during library loading cannot revive a disposed player',async()=>{
  const {doc,video}=fixture();let resolve,created=0;
  const pending=new Promise(r=>{resolve=r;});
  const player=mountDirectVideo(video,camera,{doc,load:()=>pending});
  player.destroy();resolve(class {static isSupported(){return true;} constructor(){created++;}});
  await flush();assert.equal(created,0);assert.equal(video.src,'');
});
test('fatal stream error destroys its worker once and reports failure once',async()=>{
  const {doc,video}=fixture();let errors=0;const mock=fakeHls();
  const player=mountDirectVideo(video,camera,
    {doc,load:()=>Promise.resolve(mock.Hls),onError:()=>errors++});
  await flush();
  mock.instance.handlers.error('error',{fatal:true,type:'network',details:'offline'});
  mock.instance.handlers.error('error',{fatal:true,type:'network',details:'offline'});
  player.destroy();assert.equal(mock.instance.destroyed,1);assert.equal(errors,1);
});

test('readiness requires playback and clears while buffering or retired',()=>{
  const {doc,video}=fixture(true);const player=mountDirectVideo(video,camera,{doc});
  assert.equal(player.isReady(),false);
  video.dispatchEvent(new Event('playing'));assert.equal(player.isReady(),true);
  video.dispatchEvent(new Event('waiting'));assert.equal(player.isReady(),false);
  video.dispatchEvent(new Event('playing'));assert.equal(player.isReady(),true);
  player.destroy();video.dispatchEvent(new Event('playing'));assert.equal(player.isReady(),false);
});

test('native map cover stops HLS and late manifest cannot restart hidden playback',async()=>{
  const {doc,video}=fixture();const mock=fakeHls();
  const player=mountDirectVideo(video,camera,{doc,load:()=>Promise.resolve(mock.Hls)});
  await flush();
  assert.equal(mock.instance.config.enableWorker,true);
  assert.equal(mock.instance.config.autoStartLoad,false);
  player.setSuspended(true);const plays=video.plays;
  mock.instance.handlers.manifest();video.dispatchEvent(new Event('playing'));
  assert.equal(video.plays,plays);assert.equal(mock.instance.stops,1);
  assert.equal(player.isReady(),false);
  // Clearing the native cover while the tab is hidden must not resume either.
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  player.setSuspended(false);assert.equal(video.plays,plays);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.plays,plays+1);assert.equal(mock.instance.starts,2);
  player.destroy();const retiredPlays=video.plays;
  mock.instance.handlers.manifest();player.setSuspended(false);
  assert.equal(video.plays,retiredPlays);
});

test('library finishing under map cover does not fetch a camera until resumed',async()=>{
  const {doc,video}=fixture();const mock=fakeHls();let resolve;
  const pending=new Promise(r=>{resolve=r;});
  const player=mountDirectVideo(video,camera,{doc,load:()=>pending});
  player.setSuspended(true);resolve(mock.Hls);await flush();
  assert.equal(mock.instance.sources,0);assert.equal(mock.instance.starts,0);
  assert.equal(video.plays,0);
  player.setSuspended(false);assert.equal(mock.instance.sources,1);
  assert.equal(mock.instance.starts,1);player.destroy();
});

test('native HLS releases network source under cover and restores it once visible',()=>{
  const {doc,video}=fixture(true);
  const player=mountDirectVideo(video,camera,{doc,suspended:true});
  assert.equal(video.src,'');assert.equal(video.plays,0);
  player.setSuspended(false);assert.equal(video.src,camera.url);
  player.setSuspended(true);assert.equal(video.src,'');assert.equal(video.loads,1);
  player.setSuspended(false);assert.equal(video.src,camera.url);assert.equal(video.plays,2);
  player.destroy();
});

test('startup budget excludes both map-covered and backgrounded time',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let elapsed=0,errors=0;
  const advance=ms=>{elapsed+=ms;t.mock.timers.tick(ms);};
  const {doc,video}=fixture(true);
  const mock=fakeHls();
  const player=mountDirectVideo(video,camera,{doc,now:()=>elapsed,
    load:()=>Promise.resolve(mock.Hls),onError:()=>errors++});
  advance(10000);await flush();player.setSuspended(true);advance(60000);
  assert.equal(errors,0);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  player.setSuspended(false);advance(60000);assert.equal(errors,0);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  advance(19999);assert.equal(errors,0);advance(1);assert.equal(errors,1);
  player.destroy();advance(60000);assert.equal(errors,1);
});

test('first playing frame clears startup timeout permanently',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let errors=0;
  const {doc,video}=fixture(true);
  const player=mountDirectVideo(video,camera,{doc,onError:()=>errors++});
  video.dispatchEvent(new Event('playing'));t.mock.timers.tick(60000);
  assert.equal(errors,0);player.destroy();
});

test('media recovery is bounded to one attempt before failing',async()=>{
  const {doc,video}=fixture();const mock=fakeHls();let errors=0;
  const player=mountDirectVideo(video,camera,
    {doc,load:()=>Promise.resolve(mock.Hls),onError:()=>errors++});
  await flush();const fault={fatal:true,type:'media',details:'decode failure'};
  mock.instance.handlers.error('error',fault);
  assert.equal(mock.instance.recoveries,1);assert.equal(errors,0);
  mock.instance.handlers.error('error',fault);
  assert.equal(mock.instance.destroyed,1);assert.equal(errors,1);player.destroy();
});

test('native decoding failure falls back to MSE once without reporting a dead camera',async()=>{
  const {doc,video}=fixture(true);const mock=fakeHls();let errors=0,loads=0;
  const player=mountDirectVideo(video,camera,{doc,onError:()=>errors++,
    load:()=>{loads++;return Promise.resolve(mock.Hls);}});
  video.dispatchEvent(new Event('error'));await flush();
  assert.equal(loads,1);assert.equal(mock.instance.sources,1);assert.equal(errors,0);
  video.dispatchEvent(new Event('playing'));assert.equal(player.isReady(),true);
  video.dispatchEvent(new Event('error'));assert.equal(errors,1);assert.equal(loads,1);
  assert.equal(mock.instance.destroyed,1);player.destroy();
});

test('native stall falls back after eight visible seconds and can play through MSE',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {doc,video}=fixture(true);const mock=fakeHls();let loads=0,errors=0;
  const player=mountDirectVideo(video,camera,{doc,onError:()=>errors++,
    load:()=>{loads++;return Promise.resolve(mock.Hls);}});
  t.mock.timers.tick(7999);await flush();assert.equal(loads,0);
  t.mock.timers.tick(1);await flush();assert.equal(loads,1);
  video.dispatchEvent(new Event('playing'));t.mock.timers.tick(60000);
  assert.equal(player.isReady(),true);assert.equal(errors,0);player.destroy();
});

test('native fallback clock pauses under cover and retirement cancels it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let elapsed=0,loads=0;
  const advance=ms=>{elapsed+=ms;t.mock.timers.tick(ms);};
  const {doc,video}=fixture(true);const mock=fakeHls();
  const player=mountDirectVideo(video,camera,{doc,now:()=>elapsed,
    load:()=>{loads++;return Promise.resolve(mock.Hls);}});
  advance(6000);player.setSuspended(true);advance(60000);await flush();
  assert.equal(loads,0);player.setSuspended(false);advance(1999);await flush();
  assert.equal(loads,0);player.destroy();advance(60000);await flush();assert.equal(loads,0);
});

test('native-only devices retain native playback if MSE is unsupported',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let errors=0;
  const {doc,video}=fixture(true);const mock=fakeHls();
  mock.Hls.isSupported=()=>false;
  const player=mountDirectVideo(video,camera,{doc,onError:()=>errors++,load:()=>Promise.resolve(mock.Hls)});
  t.mock.timers.tick(8000);await flush();
  assert.equal(video.src,camera.url);assert.equal(mock.instance,undefined);
  video.dispatchEvent(new Event('playing'));t.mock.timers.tick(60000);
  assert.equal(errors,0);assert.equal(player.isReady(),true);player.destroy();
});
