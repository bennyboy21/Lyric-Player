const clientId = "86d5980bc6284ccba0515e63ddd32845";
const redirectUri = "https://bennyboy21.github.io/Lyric-Player/player/";
const scopes = ["user-read-playback-state","user-read-currently-playing"].join(" ");

function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i=0; i<length; i++) text += possible.charAt(Math.floor(Math.random()*possible.length));
    return text;
}

function base64encode(string) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64encode(hash);
}

async function loginWithSpotify() {
    const codeVerifier = generateRandomString(128);
    localStorage.setItem("spotify_code_verifier", codeVerifier);
    const codeChallenge = await sha256(codeVerifier);

    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.set("response_type","code");
    url.searchParams.set("client_id",clientId);
    url.searchParams.set("scope",scopes);
    url.searchParams.set("redirect_uri",redirectUri);
    url.searchParams.set("code_challenge_method","S256");
    url.searchParams.set("code_challenge",codeChallenge);

    window.location = url.toString();
}

// Check if the page has a code in the URL
const params = new URLSearchParams(window.location.search);
if (!params.get("code")) {
    document.body.innerHTML = `<button id="login">Login with Spotify</button>`;
    document.getElementById("login").onclick = loginWithSpotify;
} else {
    // The user is redirected here with ?code=...
    console.log("User redirected with code:", params.get("code"));
    // Continue with access token exchange...
}
