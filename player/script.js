// --- Config ---
const clientId = "86d5980bc6284ccba0515e63ddd32845";
const redirectUri = "https://bennyboy21.github.io/Lyric-Player/player/";
const scopes = ["user-read-playback-state","user-read-currently-playing","user-modify-playback-state"].join(" ");

// --- PKCE helpers ---
function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
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

// --- Login ---
async function loginWithSpotify() {
    const codeVerifier = generateRandomString(128);
    localStorage.setItem("spotify_code_verifier", codeVerifier);
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

// --- Exchange code for access token ---
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

// --- Get current track ---
async function getCurrentTrack(token) {
    try {
        const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 204 || res.status === 403) return null;
        if (!res.ok) return null;
        const data = await res.json();
        return data.item ? data : null;
    } catch {
        return null;
    }
}

// --- Get devices ---
async function getDevices(token) {
    try {
        const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
            headers: { Authorization: `Bearer ${token}` }
        });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            return data.devices || [];
        } catch {
            return [];
        }
    } catch {
        return [];
    }
}

// --- Transfer playback to browser ---
async function transferToBrowser(token) {
    const devices = await getDevices(token);
    const browserDevice = devices.find(d => d.type === "Computer" || d.type === "Web Player");
    if (browserDevice) {
        await fetch("https://api.spotify.com/v1/me/player", {
            method: "PUT",
            headers: { 
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ device_ids: [browserDevice.id], play: false })
        });
        return browserDevice;
    }
    return null;
}

// --- Update DOM ---
async function showCurrentTrack(token) {
    const elTrack = document.getElementById("track");
    const elArtist = document.getElementById("artist");
    const elStatus = document.getElementById("status");
    const elAlbumArt = document.getElementById("albumArt");

    if (!elTrack || !elArtist || !elStatus || !elAlbumArt) return;

    let track = await getCurrentTrack(token);

    // If 403 or no track, transfer to browser
    if (!track) {
        const device = await transferToBrowser(token);
        if (device) track = await getCurrentTrack(token);
    }

    if (track) {
        elTrack.textContent = track.item.name;
        elArtist.textContent = track.item.artists.map(a => a.name).join(", ");
        elStatus.textContent = "Now Playing";
        elAlbumArt.src = track.item.album.images[0]?.url || "";
        elAlbumArt.style.display = "block";
    } else {
        elTrack.textContent = "";
        elArtist.textContent = "";
        elStatus.textContent = "Open Spotify Web or Desktop to see your track";
        elAlbumArt.style.display = "none";
    }
}

// --- Main ---
(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const codeVerifier = localStorage.getItem("spotify_code_verifier");

    if (!code || !codeVerifier) {
        document.body.innerHTML = `<button id="login">Login with Spotify</button>`;
        document.getElementById("login").onclick = loginWithSpotify;
        return;
    }

    try {
        const token = await getAccessToken(code, codeVerifier);
        await showCurrentTrack(token);
        setInterval(() => showCurrentTrack(token), 5000);
    } catch (err) {
        console.error("Failed to get Spotify token or show track:", err);
    }
})();