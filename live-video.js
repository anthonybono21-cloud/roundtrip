/* Direct public camera feeds. HLS is loaded only for a camera that needs it. */
let hlsLibrary;
function loadHls(){
  if(globalThis.Hls) return Promise.resolve(globalThis.Hls);
  if(!hlsLibrary) hlsLibrary = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='./vendor/hls.light.min.js';
    script.onload=()=>globalThis.Hls ? resolve(globalThis.Hls) : reject(new Error('HLS player unavailable'));
    script.onerror=()=>{script.remove();reject(new Error('HLS player could not load'));};
    document.head.append(script);
  }).catch(error=>{hlsLibrary=null;throw error;});
  return hlsLibrary;
}

// The caller owns native-map coverage; document visibility is combined here.
// Return control immediately, including while the lazy library is still loading.
export function mountDirectVideo(video,cam,{onError=()=>{},load=loadHls,doc=document,
    now=()=>performance.now(),suspended=false}={}){
  let disposed=false,hls=null,mediaRecovery=false,ready=false;
  let covered=!!suspended,paused=covered||doc.hidden;
  let loadingLibrary=false,sourceLoaded=false;
  let startup=null,startupAt=0,startupRemaining=30000,started=false;
  let nativeProbe=null,nativeProbeAt=0,nativeProbeRemaining=8000;
  let nativeFallbackAttempted=false;
  const isHls=cam.kind==='hls'||/\.m3u8(?:[?#]|$)/i.test(cam.url);
  let native=!isHls||!!video.canPlayType('application/vnd.apple.mpegurl');
  const play=()=>{if(!disposed&&!paused)video.play()?.catch(()=>{});};
  const waiting=()=>{ready=false;};
  const playing=()=>{
    if(disposed)return;
    if(paused){video.pause();return;}
    ready=true;started=true;clearTimeout(startup);startup=null;
    clearTimeout(nativeProbe);nativeProbe=null;
  };
  const fail=error=>{if(!disposed){destroy();onError(error);}};
  const failed=()=>{if(!tryMse())fail(new Error('Camera video unavailable'));};
  function tryMse(){
    if(disposed||!native||!isHls||nativeFallbackAttempted)return false;
    // Native HLS can advertise support yet stall on a feed's codec mix.
    // Try the worker-backed player once, retaining the startup deadline.
    nativeFallbackAttempted=true;
    native=false;ready=false;clearTimeout(nativeProbe);nativeProbe=null;
    if(started){started=false;startupRemaining=30000;}
    sourceLoaded=false;video.pause();video.removeAttribute('src');video.load();
    activate();return true;
  }
  function pauseDeadline(){
    if(nativeProbe!==null){
      nativeProbeRemaining=Math.max(0,nativeProbeRemaining-(now()-nativeProbeAt));
      clearTimeout(nativeProbe);nativeProbe=null;
    }
    if(startup===null)return;
    startupRemaining=Math.max(0,startupRemaining-(now()-startupAt));
    clearTimeout(startup);startup=null;
  }
  function resumeDeadline(){
    if(!started&&native&&isHls&&!nativeFallbackAttempted&&nativeProbe===null){
      nativeProbeAt=now();
      nativeProbe=setTimeout(()=>{nativeProbe=null;if(!paused)tryMse();},nativeProbeRemaining);
    }
    if(started||startup!==null)return;
    startupAt=now();
    startup=setTimeout(()=>{
      startup=null;
      if(!disposed&&!paused)fail(new Error('Camera did not start'));
    },startupRemaining);
  }
  function activate(){
    if(disposed||paused)return;
    resumeDeadline();
    if(native){
      if(!sourceLoaded){video.src=cam.url;sourceLoaded=true;}
      play();
    }else if(hls){
      if(!sourceLoaded){hls.loadSource(cam.url);sourceLoaded=true;}
      hls.startLoad(-1);play();
    }else if(!loadingLibrary){
      loadingLibrary=true;
      Promise.resolve().then(()=>disposed ? null : load()).then(Hls=>{
        if(disposed)return;
        if(!Hls.isSupported()){
          // Some native-only devices can take longer to start. Keep their
          // original path and remaining deadline when MSE is unavailable.
          if(nativeFallbackAttempted){native=true;loadingLibrary=false;activate();return;}
          throw new Error('HLS playback unsupported');
        }
        hls=new Hls({enableWorker:true,autoStartLoad:false,lowLatencyMode:false,
          maxBufferLength:20,backBufferLength:10});
        hls.on(Hls.Events.MANIFEST_PARSED,play);
        hls.on(Hls.Events.ERROR,(_event,data)=>{
          if(!data.fatal||disposed)return;
          if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&!mediaRecovery){
            mediaRecovery=true;hls.recoverMediaError();
          }else fail(new Error(data.details||'Camera stream unavailable'));
        });
        hls.attachMedia(video);
        activate(); // A map/tab may have covered us while the library loaded.
      }).catch(fail);
    }
  }
  function visibility(){
    if(disposed)return;
    const next=covered||doc.hidden;
    if(next===paused)return;
    paused=next;
    if(paused){
      ready=false;pauseDeadline();video.pause();hls?.stopLoad();
      // Native HLS has no stopLoad(). Release its source to stop its requests;
      // resuming a live camera starts at the live edge rather than old footage.
      if(native&&sourceLoaded){video.removeAttribute('src');video.load();sourceLoaded=false;}
    }else activate();
  }
  function destroy(){
    if(disposed)return;
    disposed=true;ready=false;clearTimeout(startup);startup=null;
    clearTimeout(nativeProbe);nativeProbe=null;
    doc.removeEventListener('visibilitychange',visibility);
    video.removeEventListener('playing',playing);video.removeEventListener('error',failed);
    for(const event of ['waiting','pause','emptied'])video.removeEventListener(event,waiting);
    hls?.destroy();hls=null;
    video.pause();video.removeAttribute('src');video.load();
  }
  // Only play() may start playback, so a late manifest cannot bypass coverage.
  video.autoplay=false;video.muted=video.playsInline=true;
  video.addEventListener('playing',playing);video.addEventListener('error',failed);
  for(const event of ['waiting','pause','emptied'])video.addEventListener(event,waiting);
  doc.addEventListener('visibilitychange',visibility);
  activate();
  return {destroy,setSuspended(value){covered=!!value;visibility();},
    isReady:()=>!disposed&&!paused&&ready};
}
