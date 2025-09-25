// Newest 3 Script

const clientId = "86d5980bc6284ccba0515e63ddd32845";
const redirectUri = "https://bennyboy21.github.io/Lyric-Player/player/";
const scopes = ["user-read-playback-state","user-read-currently-playing"].join(" ");
let lastTrackId = null;


function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i=0; i<length; i++) text += possible.charAt(Math.floor(Math.random()*possible.length));
    return text;
}

function base64encode(arrayBuffer) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64encode(hash);
}

// Login
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

// Get access token
async function getAccessToken(code, codeVerifier) {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.access_token;
}

// Get current track
async function getCurrentTrack(token) {
    try {
        const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 204) return null; // nothing playing
        if (res.status === 403) return null; // no active device

        if (!res.ok) return null;
        const data = await res.json();
        return data.item ? data : null;
    } catch {
        return null;
    }
}

async function showCurrentTrack(token) {
    const elTrack = document.getElementById("track");
    const elArtist = document.getElementById("artist");
    const elStatus = document.getElementById("status");
    const elAlbumArt = document.getElementById("albumArt");

    const track = await getCurrentTrack(token);

    if (track && track.item.id !== lastTrackId) {
        lastTrackId = track.item.id;
        elTrack.textContent = track.item.name;
        elArtist.textContent = track.item.artists.map(a => a.name).join(", ");
        elStatus.textContent = "Now Playing";
        elAlbumArt.src = track.item.album.images[0]?.url || "";
        elAlbumArt.style.display = "block";
    } else if (!track) {
        elStatus.textContent = "Open Spotify Web or Desktop to see your track";
    }
}


// Main
(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const codeVerifier = localStorage.getItem("spotify_code_verifier");

    if (!code || !codeVerifier) {
        document.body.innerHTML = `<button id="login">Login with Spotify</button>`;
        document.getElementById("login").onclick = loginWithSpotify;
        return;
    }

    const token = await getAccessToken(code, codeVerifier);
    await showCurrentTrack(token);
    setInterval(() => showCurrentTrack(token), 5000);
})();