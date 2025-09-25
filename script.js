const clientId = "86d5980bc6284ccba0515e63ddd32845"; // from Spotify dashboard
const redirectUri = "https://github.com/bennyboy21/Lyric-Player/player"; 
 // your page URL
const scopes = [
  "user-read-playback-state",
  "user-read-currently-playing",
].join(" ");

function generateRandomString(length) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function base64encode(string) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64encode(hash);
}

// Step 1: redirect to Spotify login
async function loginWithSpotify() {
  const codeVerifier = generateRandomString(128);
  localStorage.setItem("code_verifier", codeVerifier);

  const codeChallenge = await sha256(codeVerifier);

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", codeChallenge);

  window.location = url.toString();
}

// Step 2: get access token after redirect
async function getAccessToken() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const codeVerifier = localStorage.getItem("code_verifier");

  const body = new URLSearchParams();
  body.append("client_id", clientId);
  body.append("grant_type", "authorization_code");
  body.append("code", code);
  body.append("redirect_uri", redirectUri);
  body.append("code_verifier", codeVerifier);

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await response.json();
  return data.access_token;
}

// Step 3: get currently playing track
async function getCurrentTrack(token) {
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null; // no track playing
  return await res.json();
}

// Example usage
(async () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("code")) {
    document.body.innerHTML = `<button id="login">Login with Spotify</button>`;
    document.getElementById("login").onclick = loginWithSpotify;
  } else {
    const token = await getAccessToken();
    const track = await getCurrentTrack(token);
    if (track) {
      console.log("Currently playing:", track.item.name, "by", track.item.artists.map(a => a.name).join(", "));
    } else {
      console.log("No track currently playing");
    }
  }
})();