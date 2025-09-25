// Newest 3 Script

const clientId = "86d5980bc6284ccba0515e63ddd32845";
const redirectUri = "https://bennyboy21.github.io/Lyric-Player/player/";
const scopes = ["user-read-playback-state","user-read-currently-playing","user-modify-playback-state"].join(" ");

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

// --- Spotify login ---
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

// --- Exchange code for access token ---
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

// --- Get list of devices ---
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
            console.warn("Spotify devices response was not JSON:", text);
            return [];
        }
    } catch (err) {
        console.error("Error fetching devices:", err);
        return [];
    }
}


// --- Transfer playback to a device ---
async function transferPlayback(token, deviceId, play = false) {
    try {
        await fetch(`https://api.spotify.com/v1/me/player`, {
            method: "PUT",
            headers: { 
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ device_ids: [deviceId], play })
        });
        console.log(`Transferred playback to device ID: ${deviceId}`);
    } catch (err) {
        console.error("Failed to transfer playback:", err);
    }
}

// --- Start playback on a device (if no track is playing) ---
async function startPlayback(token, deviceId) {
    try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Playback started automatically.");
    } catch (err) {
        console.error("Failed to start playback:", err);
    }
}

// --- Get currently playing track ---
async function getCurrentTrack(token) {
    try {
        const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 204 || res.status === 403) {
            // No track / no active device: silently return null
            return null;
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

// --- Update DOM ---
async function showCurrentTrack(token) {
    const elTrack = document.getElementById("track");
    const elArtist = document.getElementById("artist");
    const elStatus = document.getElementById("status");
    const elAlbumArt = document.getElementById("albumArt");

    if (!elTrack || !elArtist || !elStatus || !elAlbumArt) return;

    let devices = await getDevices(token);
    let active = devices.find(d => d.is_active);

    // If no active device, pick your phone and start playback
    if (!active) {
        const phoneDevice = devices.find(d => d.name.toLowerCase().includes("phone")) || devices[0];
        if (phoneDevice) {
            await transferPlayback(token, phoneDevice.id, true); // transfer and start
            active = phoneDevice;
        }
    }

    const track = await getCurrentTrack(token);

    if (track && active) {
        const name = track.item.name;
        const artists = track.item.artists.map(a => a.name).join(", ");
        const albumImage = track.item.album.images[0]?.url || "";

        elTrack.textContent = name;
        elArtist.textContent = artists;
        elStatus.textContent = `Now Playing on ${active.name}`;
        elAlbumArt.src = albumImage;
        elAlbumArt.style.display = "block";

        console.log(`Currently playing: ${name} by ${artists} on ${active.name}`);
    } else if (active) {
        elTrack.textContent = "";
        elArtist.textContent = "";
        elStatus.textContent = `Waiting for track on ${active.name}...`;
        elAlbumArt.style.display = "none";
        // Start playback automatically
        await startPlayback(token, active.id);
    } else {
        elTrack.textContent = "";
        elArtist.textContent = "";
        elStatus.textContent = "No active device found.";
        elAlbumArt.style.display = "none";
        console.log("No active device found. Waiting for playback...");
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

    // Poll every 5 seconds
    await showCurrentTrack(token);
    setInterval(() => showCurrentTrack(token), 5000);
})();