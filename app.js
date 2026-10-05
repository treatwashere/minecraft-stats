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
const capeImage=document.getElementById("capeImage");
const loginButton=document.getElementById("loginButton");
const loginNotice=document.getElementById("loginNotice");
const accountAvatar=document.getElementById("accountAvatar");
const accountName=document.getElementById("accountName");
const accountStatus=document.getElementById("accountStatus");
const accountAction=document.getElementById("accountAction");
const entitlementList=document.getElementById("entitlementList");

function setStatus(message,error=false){
  statusEl.textContent=message;
  statusEl.classList.toggle("error",error);
}
function resetStats(){
  ["playtime","blocksPlaced","blocksMined","mobsKilled","itemsCrafted","deaths"]
    .forEach(id=>document.getElementById(id).textContent="—");
}
function formatUuid(uuid){
  return uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,"$1-$2-$3-$4-$5");
}
function setProfile(profile){
  nameEl.textContent=profile.name;
  uuidEl.textContent=formatUuid(profile.id);
  if(profile.skinUrl){
    skinEl.src=profile.skinUrl;
    skinLink.href=profile.skinUrl;
    skinStatus.textContent="Current Java skin loaded from Minecraft Services.";
  }else{
    skinStatus.textContent="No active skin was returned by Minecraft Services.";
  }
  if(profile.cape){
    capeStatus.textContent=profile.cape.alias ? "Current cape: "+profile.cape.alias+"." : "A current Java cape is active.";
    capeImage.src=profile.cape.url;
    capeImage.hidden=false;
  }else{
    capeStatus.textContent="No current Java cape was returned.";
    capeImage.hidden=true;
  }
}
async function lookup(username){
  setStatus("Looking up player…");
  resetStats();
  const clean=username.trim();
  if(!/^[A-Za-z0-9_]{3,16}$/.test(clean)){
    throw new Error("Enter a valid Java username (3–16 letters, numbers or underscores).");
  }
  const response=await fetch("https://api.mojang.com/users/profiles/minecraft/"+encodeURIComponent(clean));
  if(!response.ok){
    if(response.status===404) throw new Error("Player not found.");
    throw new Error("Minecraft profile lookup failed.");
  }
  const profile=await response.json();
  const sessionResponse=await fetch("https://sessionserver.mojang.com/session/minecraft/profile/"+encodeURIComponent(profile.id)+"?unsigned=false");
  let textures={};
  if(sessionResponse.ok){
    const sessionProfile=await sessionResponse.json();
    const textureProperty=sessionProfile.properties?.find(p=>p.name==="textures");
    if(textureProperty){
      try{ textures=JSON.parse(atob(textureProperty.value)).textures || {}; }catch{}
    }
  }
  setProfile({
    id:profile.id,
    name:profile.name,
    skinUrl:textures.SKIN?.url || "https://mc-heads.net/body/"+encodeURIComponent(profile.name)+"/240",
    cape:textures.CAPE ? {url:textures.CAPE.url,alias:"Current Java cape"} : null
  });
  setStatus("Profile loaded.");
}
async function loadAccount(){
  const response=await fetch("/api/me");
  if(!response.ok) return;
  const data=await response.json();
  if(!data.authenticated) return;
  const mc=data.minecraft;
  loginButton.textContent="Sign out";
  loginButton.href="/api/logout";
  loginNotice.hidden=true;
  accountAction.textContent="Sign out";
  accountAction.href="/api/logout";
  accountName.textContent=mc.name;
  accountStatus.textContent="Connected to Minecraft Services. Account-authorized data is loaded server-side.";
  accountAvatar.src=mc.skinUrl || "https://mc-heads.net/avatar/"+encodeURIComponent(mc.name)+"/120";
  accountAvatar.alt=mc.name+" Minecraft avatar";
  document.querySelector("#account .pill").textContent="CONNECTED";
  if(mc.cape){
    capeStatus.textContent="Current cape: "+(mc.cape.alias || "Active cape")+".";
    capeImage.src=mc.cape.url;
    capeImage.hidden=false;
  }
  entitlementList.innerHTML="";
  if(data.entitlements.length){
    data.entitlements.forEach(item=>{
      const pill=document.createElement("span");
      pill.className="entitlement";
      pill.textContent=item.name;
      entitlementList.appendChild(pill);
    });
  }else{
    const empty=document.createElement("span");
    empty.className="muted";
    empty.textContent="No Minecraft entitlements were returned.";
    entitlementList.appendChild(empty);
  }
  input.value=mc.name;
  setProfile(mc);
  setStatus("Microsoft account connected.");
}
const loginError=new URLSearchParams(location.search).get("login_error");
if(loginError) setStatus(decodeURIComponent(loginError),true);
form.addEventListener("submit",async e=>{
  e.preventDefault();
  try{await lookup(input.value)}catch(error){setStatus(error.message||"Something went wrong.",true)}
});
loadAccount().catch(()=>{});
