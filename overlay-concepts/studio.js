const stage=document.querySelector('#stage');
const choices={a:['01 · Place first','One calm cluster, low on the left. Easy to scan across the room, leaving the scene open.'],b:['02 · Wide rail','Place on the left, conditions on the right. A clean horizontal read with a shallow footprint.'],c:['03 · Open corners','Location above, conditions below, and a generous logo opposite. More of the centre stays open.']};
let paused=false,animation=null,lastFlight=0;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
function stop(){animation?.cancel();animation=null;stage.querySelector('.flyer').style.opacity='0';}
function fly(){
 if(paused||reduce.matches||document.hidden)return;
 stop();lastFlight=Date.now();
 const plane=stage.querySelector('.flyer');
 // Motion-only duplicate of the exact approved path. Original lockup is never masked or modified.
 animation=plane.animate([
 {transform:'translate(0,0) rotate(0deg)',opacity:0,offset:0},
 {transform:'translate(20%,-15%) rotate(15deg)',opacity:1,offset:.10},
 {transform:'translate(90%,120%) rotate(105deg)',opacity:1,offset:.32},
 {transform:'translate(-160%,245%) rotate(195deg)',opacity:1,offset:.56},
 {transform:'translate(-250%,60%) rotate(285deg)',opacity:1,offset:.78},
 {transform:'translate(-40%,-50%) rotate(350deg)',opacity:1,offset:.94},
 {transform:'translate(0,0) rotate(360deg)',opacity:0,offset:1}
 ],{duration:1850,easing:'cubic-bezier(.4,0,.2,1)',fill:'none'});
 animation.onfinish=()=>{animation=null;};
}
document.querySelectorAll('[data-layout]').forEach(button=>button.addEventListener('click',()=>{
 stop();stage.className='stage '+button.dataset.layout;
 document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 const [name,copy]=choices[button.dataset.layout];document.querySelector('#layout-name').textContent=name;document.querySelector('#layout-copy').textContent=copy;
}));
document.querySelector('#flight').addEventListener('click',fly);
document.querySelector('#pause').addEventListener('click',event=>{paused=!paused;stop();event.target.setAttribute('aria-pressed',String(paused));event.target.textContent=paused?'Resume motion':'Pause motion';});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
reduce.addEventListener('change',()=>{if(reduce.matches)stop();});
// No per-frame JavaScript, decoder, canvas or WebGL. Timers only run a short transform flourish.
setInterval(()=>{if(Date.now()-lastFlight>=90000)fly();},90000);
document.querySelector('#compare').addEventListener('click',event=>{
 const comparison=document.querySelector('#comparison');
 if(!comparison.children.length)for(const [key,[name,copy]]of Object.entries(choices)){
 const article=document.createElement('article');const preview=stage.cloneNode(true);preview.removeAttribute('id');preview.className='stage '+key;preview.querySelector('.flyer').remove();
 const heading=document.createElement('h3');heading.textContent=name;const text=document.createElement('p');text.textContent=copy;article.append(preview,heading,text);comparison.append(article);
 }
 comparison.hidden=!comparison.hidden;event.target.textContent=comparison.hidden?'Compare all three':'Hide comparison';
});
