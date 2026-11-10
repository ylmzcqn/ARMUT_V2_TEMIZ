import {newId} from './browser-crypto.mjs?v=cloud20261110-16';
// Modül seçimi ve cihaz filtresi aynı erişilebilir, mobil alt paneli kullanır.
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
export function createChoiceDialog({title,onSelect,returnFocus,renderIcon}) {
 const dialog=node('dialog',null,'module-chooser-dialog');
 const headingId=`choice-${newId()}`;dialog.setAttribute('aria-labelledby',headingId);
 const header=node('div',null,'module-chooser-header'),heading=node('h2',title);heading.id=headingId;
 const close=node('button','Kapat');close.type='button';close.autofocus=true;close.addEventListener('click',()=>dialog.close());
 header.append(heading,close);const list=node('div',null,'module-choice-list');dialog.append(header,list);
 dialog.addEventListener('close',()=>{const trigger=returnFocus?.();if(trigger?.isConnected)trigger.focus({preventScroll:true});});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 return {
  element:dialog,
  open(){dialog.showModal();},
  setChoices(choices,selected){
   list.replaceChildren();
   for(const choice of choices){
    const button=node('button',null,'module-choice');button.type='button';button.setAttribute('aria-pressed',String(choice.value===selected));
    const copy=node('span',null,'module-choice-copy');copy.append(node('strong',choice.name));if(choice.description)copy.append(node('span',choice.description));
    if(renderIcon)button.append(renderIcon(choice));button.append(copy);
    if(choice.value===selected)button.append(node('span','Seçili','choice-selected'));
    button.addEventListener('click',()=>{dialog.close();onSelect(choice.value);});list.append(button);
   }
  }
 };
}
