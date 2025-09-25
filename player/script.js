// Make sure this script is loaded as a module:
// <script type="module" src="script.js"></script>

const code = new URLSearchParams(window.location.search).get("code");
const codeVerifier = localStorage.getItem("spotify_code_verifier");

if (!code || !codeVerifier) {
  console.error("Missing authorization code or code verifier. User may not be logged in.");
}

// Function to get an access token using PKCE
async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: "https://bennyboy21.github.io/Lyric-Player/player/", // must match redirect URI in Spotify Dashboard
    client_id: "86d5980bc6284ccba0515e63ddd32845",
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

// Function to fetch currently playing track
async function getCurrentTrack(token) {
  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 204) return null; // no track currently playing
    if (res.status === 403) {
      console.warn("Token expired or user not active on Spotify client");
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      console.warn("Failed to fetch current track:", text);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Error fetching current track:", err);
    return null;
  }
}

// Function to update DOM with current track info
async function showCurrentTrack(token) {
  const track = await getCurrentTrack(token);
  const el = document.getElementById("track-info");

  if (!el) return;

  if (track && track.item) {
    const name = track.item.name;
    const artists = track.item.artists.map(a => a.name).join(", ");
    el.textContent = `${name} — ${artists}`;
    console.log(`Currently playing: ${name} by ${artists}`);
  } else {
    el.textContent = "No track currently playing";
    console.log("No track currently playing");
  }
}

// Main execution
(async () => {
  const token = await getAccessToken();
  if (!token) return;

  // Show track immediately and then every 5 seconds
  await showCurrentTrack(token);
  setInterval(() => showCurrentTrack(token), 5000);
})();