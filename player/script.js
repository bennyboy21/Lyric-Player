// Make sure this script is loaded as a module:
// <script type="module" src="script.js"></script>

const clientId = "86d5980bc6284ccba0515e63ddd32845";
const redirectUri = "https://bennyboy21.github.io/Lyric-Player/player/"; // must match Spotify dashboard
const scopes = ["user-read-playback-state","user-read-currently-playing"].join(" ");

// --- PKCE helpers ---
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

// --- Step 1: login with Spotify ---
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

// --- Step 2: exchange code for access token ---
async function getAccessToken(code, codeVerifier) {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier
    });

    try {
        const res = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Token request failed: ${errText}`);
        }

        const data = await res.json();
        return data.access_token;
    } catch (err) {
        console.error("Failed to get Spotify access token:", err);
        return null;
    }
}

// --- Step 3: fetch currently playing track safely ---
async function getCurrentTrack(token) {
    try {
        const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 204 || res.status === 403) {
            return null; // No track or inactive device
        }

        if (!res.ok) {
            const text = await res.text();
            console.warn("Failed to fetch current track:", text);
            return null;
        }

        const data = await res.json();
        return data.item ? data : null;
    } catch (err) {
        console.error("Error fetching current track:", err);
        return null;
    }
}

// --- Step 4: update DOM and keep polling until a track is playing ---
async function showCurrentTrack(token) {
    const elTrack = document.getElementById("track");
    const elArtist = document.getElementById("artist");
    const elStatus = document.getElementById("status");
    const elAlbumArt = document.getElementById("albumArt");

    if (!elTrack || !elArtist || !elStatus || !elAlbumArt) return;

    const track = await getCurrentTrack(token);

    if (track) {
        const name = track.item.name;
        const artists = track.item.artists.map(a => a.name).join(", ");
        const albumImage = track.item.album.images[0]?.url || "";

        elTrack.textContent = name;
        elArtist.textContent = artists;
        elStatus.textContent = "Now Playing";
        elAlbumArt.src = albumImage;
        elAlbumArt.style.display = "block";

        console.log(`Currently playing: ${name} by ${artists}`);
    } else {
        elTrack.textContent = "";
        elArtist.textContent = "";
        elStatus.textContent = "Start playing Spotify on a device!";
        elAlbumArt.style.display = "none";
        console.log("No track currently playing or no active device");
    }
}

// --- Main execution ---
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
    if (!token) {
        console.error("Could not get access token.");
        return;
    }

    // Poll every 5 seconds until a track is playing
    await showCurrentTrack(token);
    setInterval(() => showCurrentTrack(token), 5000);
})();
