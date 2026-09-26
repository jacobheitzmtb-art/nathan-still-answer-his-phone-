const $ = (id) => document.getElementById(id==='download'?'download-button':id);
let media = null, busy = false, searching = false;
const notice = (message, error = false) => { $('notice').hidden = !message; $('notice').textContent = message; $('notice').classList.toggle('error', error); };
async function api(path, body) {
  const response = await fetch(path, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  let data;try{data=await response.json();}catch{throw new Error('The service is unavailable right now. Please try again shortly.');}
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function updateButton(){ $('download').disabled = busy || !$('rights').checked; }
$('rights').addEventListener('change', updateButton);
$('paste').addEventListener('click', async () => { try { $('url').value = (await navigator.clipboard.readText()).trim(); $('url').focus(); } catch { notice('Use Ctrl+V (or ⌘V) to paste your Instagram link.'); $('url').focus(); } });
$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if(searching || busy) return;
  let url;try{url=new URL($('url').value.trim());if(!['instagram.com','www.instagram.com','m.instagram.com'].includes(url.hostname)||!['https:','http:'].includes(url.protocol)||!/^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]{5,40}\/?$/.test(url.pathname)||url.port||url.username||url.password)throw new Error();}catch{notice('Enter a supported public Instagram post or Reel link.',true);$('url').focus();return;}
  searching = true; $('search').disabled = true; $('search').textContent = 'Fetching…';document.body.classList.add('searching');
  $('result').hidden = true; $('empty').hidden = false; $('rights').checked = false; updateButton();
  $('video').pause(); $('video').removeAttribute('src'); $('video').load(); media=null;
  notice('Finding your video and checking the available quality…');
  try {
    media = await api('/api/search', { url: $('url').value.trim() });
    $('video-title').textContent = media.title;
    $('video-meta').textContent = [media.uploader ? '@'+media.uploader.replace(/^@/,'') : 'Instagram video', media.duration ? `${Math.floor(media.duration/60)}:${String(Math.round(media.duration%60)).padStart(2,'0')}` : null, media.hasAudio ? 'Sound available' : 'No audio in source'].filter(Boolean).join(' · ');
    $('source-size').textContent = media.width && media.height ? `${media.width} × ${media.height}` : 'Source dimensions unavailable';
    $('formats').replaceChildren();
    media.qualities.forEach((q,i) => {
      const label=document.createElement('label'); label.className='format';
      const input=document.createElement('input'); input.type='radio'; input.name='quality'; input.value=q.value; input.checked=i===0;
      const text=document.createElement('span'); text.textContent=q.label;
      const small=document.createElement('small'); small.textContent=q.description; text.append(small); label.append(input,text); $('formats').append(label);
      input.addEventListener('change',()=>{ $('download').replaceChildren(document.createTextNode(q.value==='audio'?'Download audio ':'Download video ')); const arrow=document.createElement('span');arrow.textContent='↓';$('download').append(arrow); });
    });
    $('video').width = media.width || 720;
    $('video').height = media.height || 1280;
    $('video').src = `/api/preview/${media.id}`;
    $('download').innerHTML='Download video <span>↓</span>';
    $('download-status').textContent=''; $('empty').hidden = true; $('result').hidden = false; notice(media.note || '');
  } catch (error) { notice(error.message, true); }
  finally { searching=false; document.body.classList.remove('searching'); $('search').disabled = false; $('search').innerHTML='Fetch Reel <span aria-hidden="true">→</span>'; }
});
$('video').addEventListener('error',()=>{ if(media) notice('The preview could not load. You can still try preparing the download.'); });
$('download').addEventListener('click', async () => {
  if (!media || busy || !$('rights').checked) return;
  busy=true; updateButton(); $('search').disabled=true; $('download-status').textContent='Preparing your file…';
  $('another').disabled=true; $('download-progress').hidden=false; $('formats').disabled=true;
  try {
    const quality=document.querySelector('input[name="quality"]:checked').value;
    let job=await api('/api/download', {id:media.id,quality,rightsConfirmed:true});
    const deadline=Date.now()+12*60*1000;
    while(job.status!=='ready') {
      if(job.status==='failed') throw new Error(job.error);
      if(Date.now()>deadline) throw new Error('This download is taking too long. Please try again.');
      $('download-status').textContent=job.message || 'Preparing your file…';
      await new Promise(resolve=>setTimeout(resolve,300)); job=await api(`/api/jobs/${job.id}`);
    }
    const a=document.createElement('a'); a.href=job.url; a.download=job.filename; a.textContent='Save file again';
    $('download-status').replaceChildren(document.createTextNode('Your file is ready. '),a); a.click();
  } catch(error) { $('download-status').textContent=error.message; }
  finally { busy=false; updateButton(); $('search').disabled=false; $('another').disabled=false; $('download-progress').hidden=true; $('formats').disabled=false; }
});
$('another').addEventListener('click',()=>{if(busy)return;media=null;$('video').pause();$('video').removeAttribute('src');$('video').load();$('result').hidden=true;$('empty').hidden=false;$('url').value='';$('rights').checked=false;notice('');$('url').focus();});
