const stage=document.querySelector('#stage');
const choices={a:['01 · Place first','One calm cluster, low on the left. Easy to scan across the room, leaving the scene open.'],b:['02 · Wide rail','Place on the left, conditions on the right. A clean horizontal read with a shallow footprint.'],c:['03 · Open corners','Location above, conditions below, and a generous logo opposite. More of the centre stays open.']};
document.querySelectorAll('[data-layout]').forEach(button=>button.addEventListener('click',()=>{
 stage.className='stage '+button.dataset.layout;
 document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 const [name,copy]=choices[button.dataset.layout];document.querySelector('#layout-name').textContent=name;document.querySelector('#layout-copy').textContent=copy;
}));
document.querySelector('#compare').addEventListener('click',event=>{
 const comparison=document.querySelector('#comparison');
 if(!comparison.children.length)for(const [key,[name,copy]]of Object.entries(choices)){
 const article=document.createElement('article');const preview=stage.cloneNode(true);preview.removeAttribute('id');preview.className='stage '+key;
 const heading=document.createElement('h3');heading.textContent=name;const text=document.createElement('p');text.textContent=copy;article.append(preview,heading,text);comparison.append(article);
 }
 comparison.hidden=!comparison.hidden;event.target.textContent=comparison.hidden?'Compare all three':'Hide comparison';
});
