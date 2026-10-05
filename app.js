const form=document.getElementById("lookupForm");
const input=document.getElementById("usernameInput");
const statusEl=document.getElementById("status");
const nameEl=document.getElementById("playerName");
const uuidEl=document.getElementById("playerUuid");
const avatarEl=document.getElementById("playerAvatar");
const skinEl=document.getElementById("skinPreview");
const skinLink=document.getElementById("skinLink");
const skinStatus=document.getElementById("skinStatus");
const capeStatus=document.getElementById("capeStatus");

function setStatus(message,error=false){statusEl.textContent=message;statusEl.classList.toggle("error",error)}

function resetStats(){
  ["playtime","blocksPlaced","blocksMined","mobsKilled","itemsCrafted","deaths"].forEach(id=>document.getElementById(id).textContent="—");
}

async function lookup(username){
  setStatus("Looking up player…");
  resetStats();
  const clean=username.trim();
  if(!/^[A-Za-z0-9_]{3,16}$/.test(clean)){
    throw new Error("Enter a valid Java username (3–16 letters, numbers or underscores).");
  }

  // Mojang's public username lookup is the authoritative Java profile resolver.
  const response=await fetch("https://api.mojang.com/users/profiles/minecraft/"+encodeURIComponent(clean));
  if(!response.ok){
    if(response.status===404) throw new Error("Player not found.");
    throw new Error("Minecraft profile lookup failed.");
  }
  const profile=await response.json();
  const uuid=profile.id;
  const playerName=profile.name;

  nameEl.textContent=playerName;
  uuidEl.textContent=uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,"$1-$2-$3-$4-$5");
  avatarEl.src="https://mc-heads.net/avatar/"+encodeURIComponent(playerName)+"/160";
  avatarEl.alt=playerName+" Minecraft avatar";
  skinEl.src="https://mc-heads.net/body/"+encodeURIComponent(playerName)+"/240";
  skinEl.alt=playerName+" Minecraft skin";
  skinLink.href="https://mc-heads.net/skin/"+encodeURIComponent(playerName);
  skinStatus.textContent="Current Java skin loaded for "+playerName+".";
  capeStatus.textContent="Current Java cape data will be connected to the profile/cosmetics service.";
  setStatus("Profile loaded.");
}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  try{await lookup(input.value)}catch(error){setStatus(error.message||"Something went wrong.",true)}
});