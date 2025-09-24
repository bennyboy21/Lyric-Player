// ---------- CONFIG ----------
const clientId = '86d5980bc6284ccba0515e63ddd32845'; // Replace with your Spotify client ID
const redirectUri = window.location.origin + window.location.pathname; // Current page
const scopes = 'user-read-currently-playing';

// ---------- AUTH ----------
function loginSpotify() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    window.location.href = authUrl;
}

// Get Spotify access token from URL hash
function getSpotifyToken() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return params.get('access_token');
}

// ---------- SPOTIFY API ----------
async function getCurrentTrack(token) {
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 204) {
            return null; // No track is currently playing
        }

        if (!response.ok) {
            console.error('Spotify API error:', response.status);
            return null;
        }

        const data = await response.json();
        return {
            artist: data.item.artists[0].name,
            title: data.item.name
        };
    } catch (err) {
        console.error('Error fetching Spotify track:', err);
        return null;
    }
}

// ---------- LYRICS OVH API ----------
async function getLyrics(artist, title) {
    try {
        const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
        if (!response.ok) {
            console.error('Lyrics API error:', response.status);
            return null;
        }
        const data = await response.json();
        return data.lyrics || null;
    } catch (err) {
        console.error('Error fetching lyrics:', err);
        return null;
    }
}

// ---------- DISPLAY ----------
async function showLyrics() {
    const token = getSpotifyToken();
    if (!token) {
        console.log('Not logged in. Redirecting to Spotify login...');
        loginSpotify();
        return;
    }

    const track = await getCurrentTrack(token);
    if (!track) {
        document.getElementById('lyrics').innerText = 'No track currently playing.';
        return;
    }

    document.getElementById('track-info').innerText = `Currently playing: ${track.title} by ${track.artist}`;

    const lyrics = await getLyrics(track.artist, track.title);
    document.getElementById('lyrics').innerText = lyrics || 'Lyrics not found.';
}

// ---------- RUN ----------
window.addEventListener('load', () => {
    showLyrics();
});
