// Spotify configuration
const SPOTIFY_CONFIG = {
    clientId: '86d5980bc6284ccba0515e63ddd32845', // Replace with your Spotify App Client ID
    redirectUri: window.location.origin + window.location.pathname,
    authEndpoint: 'https://accounts.spotify.com/authorize',
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
    apiBase: 'https://api.spotify.com/v1',
    scopes: ['user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state']
};

// DOM Elements
const elements = {
    loginButton: document.getElementById('login-btn'),
    playerSection: document.getElementById('player-section'),
    songTitle: document.getElementById('song-title'),
    artistName: document.getElementById('artist-name'),
    albumArt: document.getElementById('album-art'),
    playbackStatus: document.getElementById('playback-status')
};

// State management
let refreshToken = '';
let accessToken = '';
let tokenExpiration = 0;

// PKCE Code Verifier Generator
function generateCodeVerifier() {
    const array = new Uint32Array(56);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

// PKCE Code Challenge Generator
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    elements.loginButton.addEventListener('click', initiateLogin);
});

// Check if we're returning from OAuth redirect
function checkAuthStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        console.error('Auth error:', error);
        cleanupUrl();
        return;
    }

    if (code) {
        handleAuthRedirect(code);
    } else if (sessionStorage.getItem('refreshToken')) {
        refreshTokens();
    }
}

// Remove OAuth parameters from URL
function cleanupUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Step 1: Initiate OAuth Flow
async function initiateLogin() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    sessionStorage.setItem('codeVerifier', verifier);

    const authUrl = new URL(SPOTIFY_CONFIG.authEndpoint);
    authUrl.searchParams.set('client_id', SPOTIFY_CONFIG.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', SPOTIFY_CONFIG.redirectUri);
    authUrl.searchParams.set('scope', SPOTIFY_CONFIG.scopes.join(' '));
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);

    window.location.href = authUrl.toString();
}

// Step 2: Handle OAuth Redirect
async function handleAuthRedirect(code) {
    const verifier = sessionStorage.getItem('codeVerifier');
    
    try {
        const tokens = await exchangeCodeForTokens(code, verifier);
        await storeTokens(tokens);
        cleanupUrl();
        startPlayer();
    } catch (error) {
        console.error('Token exchange failed:', error);
        resetAuth();
    }
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code, verifier) {
    const response = await fetch(SPOTIFY_CONFIG.tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: SPOTIFY_CONFIG.clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: SPOTIFY_CONFIG.redirectUri,
            code_verifier: verifier,
        }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

// Store tokens and calculate expiration
async function storeTokens(tokenData) {
    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
    tokenExpiration = Date.now() + (tokenData.expires_in * 1000);

    sessionStorage.setItem('refreshToken', refreshToken);
}

// Refresh access token
async function refreshTokens() {
    const storedRefreshToken = sessionStorage.getItem('refreshToken');
    if (!storedRefreshToken) return false;

    try {
        const response = await fetch(SPOTIFY_CONFIG.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: SPOTIFY_CONFIG.clientId,
                grant_type: 'refresh_token',
                refresh_token: storedRefreshToken,
            }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const tokenData = await response.json();
        await storeTokens(tokenData);
        return true;
    } catch (error) {
        console.error('Token refresh failed:', error);
        resetAuth();
        return false;
    }
}

// Check if token needs refresh
async function ensureValidToken() {
    if (Date.now() >= tokenExpiration - 60000) {
        return await refreshTokens();
    }
    return !!accessToken;
}

// Reset authentication state
function resetAuth() {
    accessToken = '';
    refreshToken = '';
    tokenExpiration = 0;
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('codeVerifier');
    elements.playerSection.style.display = 'none';
    elements.loginButton.style.display = 'block';
}

// Start the player interface
function startPlayer() {
    elements.loginButton.style.display = 'none';
    elements.playerSection.style.display = 'block';
    startPolling();
}

// API Request with error handling
async function spotifyApiRequest(endpoint, options = {}) {
    if (!await ensureValidToken()) throw new Error('No valid token');

    const response = await fetch(SPOTIFY_CONFIG.apiBase + endpoint, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        ...options
    });

    if (response.status === 204) return null;
    if (response.status === 403) throw new Error('Premium required');
    if (response.status === 401) {
        resetAuth();
        throw new Error('Reauthentication required');
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return await response.json();
}

// Get current playback state
async function getPlaybackState() {
    try {
        return await spotifyApiRequest('/me/player');
    } catch (error) {
        if (error.message === 'Premium required') {
            showError('Spotify Premium required');
        }
        throw error;
    }
}

// Get available devices
async function getDevices() {
    return await spotifyApiRequest('/me/player/devices');
}

// Transfer playback to browser
async function transferPlayback(deviceId) {
    return await spotifyApiRequest('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: true })
    });
}

// Update DOM with track information
function updateTrackInfo(data) {
    if (!data || !data.item) {
        elements.songTitle.textContent = 'No track playing';
        elements.artistName.textContent = '';
        elements.albumArt.src = '';
        elements.playbackStatus.textContent = 'No active playback';
        return;
    }

    const { item, is_playing, device } = data;

    elements.songTitle.textContent = item.name;
    elements.artistName.textContent = item.artists.map(artist => artist.name).join(', ');
    elements.albumArt.src = item.album.images[0]?.url || '';
    elements.playbackStatus.textContent = `${is_playing ? 'Now Playing' : 'Paused'} on ${device.name}`;
}

// Show error message in playback status
function showError(message) {
    elements.playbackStatus.textContent = message;
}

// Main polling function
let pollInterval;
async function startPolling() {
    stopPolling();
    await checkPlaybackState();
    pollInterval = setInterval(checkPlaybackState, 5000);
}

function stopPolling() {
    if (pollInterval) clearInterval(pollInterval);
}

// Check playback state and handle device management
async function checkPlaybackState() {
    try {
        const playbackState = await getPlaybackState();
        
        if (playbackState?.device?.is_active) {
            updateTrackInfo(playbackState);
            return;
        }

        // No active device - try to transfer playback
        const devices = await getDevices();
        const webDevice = devices.devices.find(d => d.type === 'Computer');

        if (webDevice) {
            await transferPlayback(webDevice.id);
            const newState = await getPlaybackState();
            updateTrackInfo(newState);
        } else {
            showError('No active device available');
        }
    } catch (error) {
        if (error.message !== 'Reauthentication required') {
            console.error('Playback check failed:', error);
        }
    }
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopPolling();
    } else {
        startPolling();
    }
});