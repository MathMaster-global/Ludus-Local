// Capture the native window.open reference before any sandboxed iframe
// (which has allow-scripts + allow-same-origin) can escape and overwrite it.
// NOTE: Do NOT use .bind() here — pre-bound wrappers break Chromium's user-gesture
// popup trust check. Use .call(window, ...) at the call site instead.
const _nativeOpen = window.open;

(function() {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;

    if (window._customConsoleInitialized) return;
    window._customConsoleInitialized = true;

    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
    };

    function formatArgs(args) {
        return Array.from(args).map(arg => {
            if (arg instanceof Error) return arg.stack || arg.message;
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg, null, 2); } catch(e) { return String(arg); }
            }
            return String(arg);
        }).join(' ');
    }

    function appendLog(level, source, message) {
        const el = document.createElement('div');
        el.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        el.style.padding = '4px 0';
        el.style.wordBreak = 'break-word';
        el.style.display = 'flex';
        el.style.gap = '12px';
        el.style.fontFamily = 'monospace';

        let color = '#fff';
        if (level === 'error') color = '#ff453a';
        else if (level === 'warn') color = '#ffd60a';
        else if (level === 'info') color = '#00aeff';
        el.style.color = color;

        const sourceSpan = document.createElement('span');
        sourceSpan.style.opacity = '0.5';
        sourceSpan.style.minWidth = '80px';
        sourceSpan.style.flexShrink = '0';
        sourceSpan.textContent = source;

        const msgSpan = document.createElement('span');
        msgSpan.style.whiteSpace = 'pre-wrap';
        msgSpan.textContent = message;

        el.appendChild(sourceSpan);
        el.appendChild(msgSpan);
        consoleOutput.appendChild(el);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    function getSourceLine() {
        try { throw new Error(); } catch(e) {
            const stack = e.stack.split('\n');
            if (stack[3]) {
                const match = stack[3].match(/\/([^\/]+\.(?:js|html):\d+)/);
                if (match) return match[1];
            }
        }
        return 'app';
    }

    ['log', 'warn', 'error', 'info'].forEach(method => {
        console[method] = function(...args) {
            originalConsole[method].apply(console, args);
            appendLog(method, getSourceLine(), formatArgs(args));
        };
    });

    window.addEventListener('error', function(e) {
        if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK' || e.target.tagName === 'IMG')) {
            const src = e.target.src || e.target.href;
            const file = src ? src.split('/').pop() : e.target.tagName.toLowerCase();
            appendLog('error', `${file}:1`, `Failed to load resource: the server responded with a status of 404 (Not Found)`);
        } else {
            const source = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : 'window';
            appendLog('error', source, e.message);
        }
    }, true); 

    window.addEventListener('unhandledrejection', function(e) {
        const reason = e.reason;
        const msg = reason instanceof Error ? reason.stack : String(reason);
        appendLog('error', 'Uncaught (in promise)', msg);
    });

    window.pipeLogToParent = function(level, source, message) {
        appendLog(level, `[iframe] ${source}`, message);
    };

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : 'unknown');
        try {
            const res = await origFetch(...args);
            if (!res.ok) appendLog('error', 'NETWORK', `GET ${url} net::ERR_FAILED ${res.status}`);
            return res;
        } catch (err) {
            appendLog('error', 'NETWORK', `Access to fetch at '${url}' has been blocked by CORS policy or net::ERR_FAILED`);
            throw err;
        }
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('error', () => { appendLog('error', 'NETWORK', `${method} ${url} net::ERR_FAILED (CORS or Network Error)`); });
        this.addEventListener('load', () => { if(this.status >= 400) appendLog('error', 'NETWORK', `${method} ${url} ${this.status} (${this.statusText})`); });
        origOpen.apply(this, arguments);
    };
})();

// === GLOBAL VARIABLES (Hoisted to prevent crashes) ===
let currentSrc = ""; // MUST be defined before UI tries to render!
const frame = document.getElementById("gameFrame");
const viewer = document.getElementById("viewer");
const grid = document.getElementById("gameGrid");

// === PREMIUM & DEV UI CONTROL ===

window.checkDevAndPremiumUI = function() {
    const isPremium = localStorage.getItem("mathmaster_premium") === "true";
    const isDev = localStorage.getItem("mathmaster_dev") === "true";
    
    const premiumBanner = document.getElementById('premiumUpgradeBanner');
    const devAppBtn = document.getElementById('devControlsBtn'); // The 'app-files' dock button
    
    // 1. Handle Premium Banner
    if (premiumBanner) {
        premiumBanner.style.display = isPremium ? 'none' : 'flex';
    }

    // 2. Handle Dev Controls App
    if (devAppBtn) {
        // Unhide the dock button if they are a developer
        devAppBtn.style.display = isDev ? 'flex' : 'none';
    }
};

window.showPremiumBanner = function() {
    const banner = document.getElementById('premiumUpgradeBanner');
    if (banner) {
        banner.style.display = 'flex';
        banner.animate([
            { transform: 'translateX(-50%)' },
            { transform: 'translateX(calc(-50% - 10px))' },
            { transform: 'translateX(calc(-50% + 10px))' },
            { transform: 'translateX(-50%)' }
        ], { duration: 300, iterations: 1 });
    }
};

// --- NEW ROUTING LOGIC ---
// --- NEW ROUTING LOGIC ---

window.handlePremiumUpgradeClick = function() {
    // In auth.js, 'mathmaster_premium' is added on login and removed on logout.
    // So if it exists at all (even as "false"), the user is signed in.
    const isLoggedIn = localStorage.getItem('mathmaster_premium') !== null;

    if (isLoggedIn) {
        // They are logged in, show the payment details directly
        showPremiumInfo();
    } else {
        // They need to sign up first. Route to the actual auth modal.
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.style.display = 'flex';
    }
};

// Default content for the premium banner — restored after any custom message
const _bannerDefaults = {
    title: 'Premium Content Locked',
    subtitle: 'Upgrade to unlock all premium games, proxies, and the chatbot.',
    btnText: 'Upgrade Now',
    btnAction: 'handlePremiumUpgradeClick()'
};

// Show the premium banner with a "not available on this build" message instead
window.openAppUnavailable = function(appName) {
    const titleEl   = document.getElementById('premiumBannerTitle');
    const subEl     = document.getElementById('premiumBannerSubtitle');
    const btnEl     = document.getElementById('premiumBannerAction');

    if (titleEl) titleEl.textContent = 'Unavailable on This Build';
    if (subEl)   subEl.textContent   = `${appName} isn't available here. Visit the Domains Hub to access the full experience.`;
    if (btnEl) {
        btnEl.textContent = 'Go to Domains Hub';
        btnEl.setAttribute('onclick', "window.open('https://sites.google.com/view/mathmaster-tx/domains', '_blank')");
    }

    window.showPremiumBanner();
};

// Show info modal explaining which build this is
window.showBuildInfo = function(type) {
    const modal    = document.getElementById('buildInfoModal');
    const backdrop = document.getElementById('buildInfoBackdrop');
    const iconEl   = document.getElementById('buildInfoIcon');
    const titleEl  = document.getElementById('buildInfoTitle');
    const bodyEl   = document.getElementById('buildInfoBody');
    if (!modal) return;

    if (type === 'local') {
        if (iconEl) iconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,201,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
        if (titleEl) titleEl.textContent = 'Local Build (Beta)';
        if (bodyEl)  bodyEl.textContent  = 'This build was created using CDN jsDelivr to serve assets and libraries. Because of that, some features may behave unexpectedly or not work at all.';
    } else {
        if (iconEl) iconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,201,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
        if (titleEl) titleEl.textContent = 'Official Build';
        if (bodyEl)  bodyEl.textContent  = "This site's build comes directly from the official developer. It receives regular maintenance, has more features enabled, and is the most stable version of Ludus.";
    }

    if (backdrop) backdrop.style.display = 'block';
    modal.style.display = 'block';
};

// I noticed your HTML calls closePremiumBanner() on the 'X' button, but the function was missing!
window.closePremiumBanner = function() {
    const banner = document.getElementById('premiumUpgradeBanner');
    if (banner) banner.style.display = 'none';

    // Restore original banner text in case openAppUnavailable modified it
    const titleEl = document.getElementById('premiumBannerTitle');
    const subEl   = document.getElementById('premiumBannerSubtitle');
    const btnEl   = document.getElementById('premiumBannerAction');
    if (titleEl) titleEl.textContent = _bannerDefaults.title;
    if (subEl)   subEl.textContent   = _bannerDefaults.subtitle;
    if (btnEl) {
        btnEl.textContent = _bannerDefaults.btnText;
        btnEl.setAttribute('onclick', _bannerDefaults.btnAction);
    }
};

window.completeSignup = function() {
    // Hide the sign-up modal
    document.getElementById('authModal').style.display = 'none';
    
    // Immediately forward them to the premium info modal
    showPremiumInfo();
};

window.showPremiumInfo = function() {
    const infoModal = document.getElementById('premiumInfoModal');
    if (infoModal) infoModal.style.display = 'block';
};
window.completeSignup = function() {
    // Basic local storage flag to simulate a successful sign-up/login
    localStorage.setItem('mathmaster_logged_in', 'true');
    
    // Hide the sign-up modal
    document.getElementById('premiumSignupModal').style.display = 'none';
    
    // Immediately forward them to the premium info modal
    showPremiumInfo();
};

window.showPremiumInfo = function() {
    const infoModal = document.getElementById('premiumInfoModal');
    if (infoModal) infoModal.style.display = 'block';
};

// Triggered when a user clicks a locked premium app/asset
window.openPremiumApp = function(appId, btnElement) {
    const isPremium = localStorage.getItem('mathmaster_premium') === 'true';
    
    if (!isPremium) {
        // If not premium, trigger the sign-up/payment routing instead of just shaking the banner
        handlePremiumUpgradeClick();
        return;
    }
    
    if (typeof switchSection === 'function') {
        switchSection(appId, btnElement);
    }
};

// Run the check when the page initially loads
document.addEventListener('DOMContentLoaded', window.checkDevAndPremiumUI);

document.addEventListener('DOMContentLoaded', checkDevAndPremiumUI);
// === Unified Settings & Canvas System ===
let viewerControlsConfig = JSON.parse(localStorage.getItem('mathmaster_controls')) || [
    { id: 'dashboard', label: '← Dashboard', action: 'goHome()', key: 'h' },
    { id: 'reload', label: 'Reload', action: 'reloadGame()', key: 'r' }
];
// Remove legacy fullscreen/newtab entries if present from a saved config
viewerControlsConfig = viewerControlsConfig.filter(c => c.id !== 'fullscreen' && c.id !== 'newtab');

let viewerControlsVisibility = JSON.parse(localStorage.getItem('mathmaster_controls_vis')) || {
    'dashboard': true, 'reload': true
};
// Clean up legacy keys from saved visibility state
delete viewerControlsVisibility['fullscreen'];
delete viewerControlsVisibility['newtab'];

let favControl = viewerControlsConfig.find(c => c.id === 'favorite');
if (!favControl) {
    viewerControlsConfig.push({ id: 'favorite', label: 'Favorite', action: 'toggleFavorite()', key: 'v' });
} else if (favControl.label === '⭐ Favorite') {
    favControl.label = 'Favorite';
    localStorage.setItem('mathmaster_controls', JSON.stringify(viewerControlsConfig));
}

if (viewerControlsVisibility['favorite'] === undefined) {
    viewerControlsVisibility['favorite'] = true;
    localStorage.setItem('mathmaster_controls_vis', JSON.stringify(viewerControlsVisibility));
}

function toggleFavorite() {
    if (!currentSrc) return;
    let favoriteGames = JSON.parse(localStorage.getItem('mathmaster_favs')) || [];

    if (favoriteGames.includes(currentSrc)) {
        favoriteGames = favoriteGames.filter(src => src !== currentSrc);
    } else {
        favoriteGames.push(currentSrc);
    }

    localStorage.setItem('mathmaster_favs', JSON.stringify(favoriteGames));
    renderViewerButtons(); 
    
    const filterDropdown = document.getElementById('filterDropdown');
    if (filterDropdown && filterDropdown.value === 'favs') {
        if (typeof renderGamesGrid === 'function') renderGamesGrid();
    }
}

// SVG icons for each viewer control — matched by id
const _VIEWER_ICONS = {
    dashboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    reload:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
};

// These button ids go in the top-bar (quickControlsContainer); all others go in the dropdown
const _QUICK_CTRL_IDS = ['dashboard'];

function _makeViewerBtn(ctrl, index, isFav) {
    const btn = document.createElement('button');
    btn.className = `viewer-btn-spot spot-${index}`;
    btn.setAttribute('onclick', ctrl.action);
    btn.title = ctrl.label;
    btn.dataset.iconized = 'true'; // prevent the MutationObserver from re-processing
    // Icon button shared styles
    Object.assign(btn.style, {
        padding: '8px', borderRadius: '8px', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        width: '36px', height: '36px', minWidth: '36px',
        flexShrink: '0', margin: '0',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative', top: 'auto', bottom: 'auto',
        left: 'auto', right: 'auto', transform: 'none',
        cursor: 'pointer',
    });

    if (ctrl.id === 'favorite') {
        const filled   = isFav ? '#FFD700' : 'none';
        const stroked  = isFav ? '#FFD700' : 'white';
        btn.innerHTML  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled}" stroke="${stroked}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        btn.title = isFav ? 'Unfavorite' : 'Favorite';
    } else {
        btn.innerHTML = _VIEWER_ICONS[ctrl.id] || `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 15z"></path></svg>`;
    }
    return btn;
}

function renderViewerButtons() {
    const container      = document.getElementById('viewerControlsContainer');
    const quickContainer = document.getElementById('quickControlsContainer');
    if (!container) return;

    // Wipe both zones cleanly — no stale buttons, no duplicates
    container.innerHTML = '';
    if (quickContainer) quickContainer.innerHTML = '';

    const favoriteGames = JSON.parse(localStorage.getItem('mathmaster_favs')) || [];
    const isFav = favoriteGames.includes(currentSrc);

    viewerControlsConfig.forEach((ctrl, index) => {
        if (!viewerControlsVisibility[ctrl.id]) return;
        const btn = _makeViewerBtn(ctrl, index, isFav);
        if (_QUICK_CTRL_IDS.includes(ctrl.id) && quickContainer) {
            quickContainer.appendChild(btn);
        } else {
            container.appendChild(btn);
        }
    });
}

function renderSettingsList() {
    const list = document.getElementById('controlsList');
    if (!list) return;
    
    const positionLabels = ["Top Left", "Bottom Left", "Bottom Middle", "Bottom Right"];
    
    let html = '';
    viewerControlsConfig.forEach((ctrl, index) => {
        const isVisible = viewerControlsVisibility[ctrl.id];
        const upDisabled = index === 0;
        const downDisabled = index === viewerControlsConfig.length - 1;
        const currentPosition = positionLabels[index] || "Unassigned";

        html += `
            <div class="settings-row">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="settings-arrows" style="display: flex; flex-direction: column; gap: 4px;">
                        <svg onclick="event.stopPropagation(); ${upDisabled ? '' : `moveControl(${index}, -1)`}" class="settings-arrow-icon ${upDisabled ? 'disabled' : ''}" viewBox="0 0 24 24" style="width:16px; height:16px; stroke:white; stroke-width:2; fill:none; cursor:pointer; opacity:0.6;"><polyline points="18 15 12 9 6 15"></polyline></svg>
                        <svg onclick="event.stopPropagation(); ${downDisabled ? '' : `moveControl(${index}, 1)`}" class="settings-arrow-icon ${downDisabled ? 'disabled' : ''}" viewBox="0 0 24 24" style="width:16px; height:16px; stroke:white; stroke-width:2; fill:none; cursor:pointer; opacity:0.6;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="settings-info">
                        <span class="settings-label">${ctrl.label}</span>
                        <span class="settings-desc" style="color: var(--accent-color); font-size: 11px; font-weight: 600; text-transform: uppercase;">${currentPosition}</span>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 15px;">
                    <input type="text" class="settings-input" maxlength="1" value="${ctrl.key || ''}" 
                           onchange="updateControlKey('${ctrl.id}', this.value)" 
                           placeholder="Key" 
                           style="width: 45px; text-align: center; font-weight: bold; text-transform: lowercase;">
                    <label class="ios-switch">
                        <input type="checkbox" onchange="toggleControlVis('${ctrl.id}', this.checked)" ${isVisible ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function moveControl(index, direction) {
    const target = viewerControlsConfig[index];
    viewerControlsConfig.splice(index, 1); 
    viewerControlsConfig.splice(index + direction, 0, target); 
    saveAndRenderControls();
}

function toggleControlVis(id, isVisible) {
    viewerControlsVisibility[id] = isVisible;
    saveAndRenderControls();
    checkSecretTrigger(); 
}

function updateControlKey(id, newKey) {
    const ctrl = viewerControlsConfig.find(c => c.id === id);
    if (ctrl) {
        ctrl.key = newKey.toLowerCase();
        localStorage.setItem('mathmaster_controls', JSON.stringify(viewerControlsConfig));
    }
}

function saveAndRenderControls() {
    localStorage.setItem('mathmaster_controls', JSON.stringify(viewerControlsConfig));
    localStorage.setItem('mathmaster_controls_vis', JSON.stringify(viewerControlsVisibility));
    renderSettingsList();
    renderViewerButtons();
}

function toggleSettingsUI() {
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const isActive = settingsPanel.classList.contains("active");
    
    closePopups(); 
    
    if (!isActive) {
        settingsPanel.classList.add("active");
        settingsBtn.classList.add("active-mode");
        renderSettingsList(); 
    }
}

renderViewerButtons();

/* ================= LOGIC ================= */

async function exportSave() {
    const saveData = {
        meta: { date: new Date().toISOString(), version: "2.5-FullBackup" },
        storage: { local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie },
        indexedDB: {} 
    };

    if (window.indexedDB.databases) {
        const dbs = await window.indexedDB.databases();
        saveData.meta.dbCount = dbs.length;
    }

    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `mathmaster_backup_${Date.now()}.json`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

function importSave(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.storage) throw new Error("Invalid Backup Format");

            if (confirm("This will RESTORE all settings, cookies, and session data, then reload. Continue?")) {
                localStorage.clear();
                Object.entries(data.storage.local).forEach(([k, v]) => localStorage.setItem(k, v));
                sessionStorage.clear();
                Object.entries(data.storage.session).forEach(([k, v]) => sessionStorage.setItem(k, v));
                if (data.storage.cookies) {
                    data.storage.cookies.split(";").forEach(cookie => { document.cookie = cookie.trim() + ";path=/;max-age=31536000"; });
                }
                alert("Restore successful! Reloading site...");
                window.location.reload(); 
            }
        } catch (err) {
            alert("Error: Invalid .json backup file.");
            console.error(err);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

const searchBar = document.getElementById('spotlightSearch');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBtn = document.getElementById('settingsBtn');

function closePopups() {
    if (typeof searchBar !== 'undefined' && searchBar) searchBar.classList.remove('active');
    if (typeof searchBtn !== 'undefined' && searchBtn) searchBtn.classList.remove('active-mode');
    if (settingsPanel) settingsPanel.classList.remove('active');
    if (settingsBtn) settingsBtn.classList.remove('active-mode');
}

function toggleSearch() {
    const isActive = searchBar.classList.contains("active");
    closePopups(); 
    if (!isActive) {
        searchBar.classList.add("active");
        searchBtn.classList.add("active-mode");
        searchInput.focus();
    } else {
        searchInput.value = "";
        searchInput.dispatchEvent(new Event('input')); 
    }
}

function levenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) {
    m[i] = [i];
    if (i === 0) for (let j = 1; j <= a.length; j++) m[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[j - 1] === a[i - 1]
        ? m[i - 1][j - 1]
        : 1 + Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]);
    }
  }
  return m[b.length][a.length];
}

function scoreMatch(query, name) {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n.includes(q)) return 0;
  const dist = levenshtein(q, n);
  return dist + (n.startsWith(q[0]) ? -1 : 0);
}

// 1. Define the debounce helper
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 2. Apply it to the search input
if (searchInput) {
    searchInput.addEventListener('input', debounce(e => filterGames(e.target.value), 250));
}

function filterGames(query) {
  const q = query.toLowerCase().trim();
  const cards = [...document.querySelectorAll('#gameGrid .card')];
  if (suggestionsEl) suggestionsEl.innerHTML = "";

  if (!q) {
    cards.forEach(c => c.style.display = 'block');
    return;
  }

  let visible = cards.filter(c =>
    c.querySelector('h3').textContent.toLowerCase().includes(q)
  );

  if (visible.length === 0 && typeof games !== "undefined") {
    const guesses = games.map(g => ({
      name: g.name,
      score: scoreMatch(q, g.name)
    })).sort((a, b) => a.score - b.score).slice(0, 3);

    if (suggestionsEl) {
        suggestionsEl.innerHTML = "Did you mean:<br>" + guesses.map(g => `<b>${g.name}</b>`).join("<br>");
    }

    const best = guesses.map(g => g.name.toLowerCase());
    visible = cards.filter(c => best.includes(c.querySelector('h3').textContent.toLowerCase()));
  }

  cards.forEach(c => c.style.display = 'none');
  visible.forEach(c => c.style.display = 'block');
}

document.addEventListener('click', (e) => {
    const isDock = e.target.closest('.dock-container');
    const isTour = e.target.closest('#tourWelcomeModal') || e.target.closest('#tourTooltip');
    const isVersion = e.target.closest('.version-container'); 

    if (!isDock && !isTour) closePopups();

    if (!isVersion) {
        const bubble = document.getElementById('versionInputBubble');
        if (bubble && bubble.style.display === 'flex') {
            bubble.style.display = 'none';
        }
    }
});

const cloudOverwriteToggle = document.getElementById("settingsCloudOverwriteToggle");
let allowCloudOverwrite = localStorage.getItem("mathmaster_cloud_overwrite") !== "false";

if (cloudOverwriteToggle) {
    cloudOverwriteToggle.checked = allowCloudOverwrite;
    cloudOverwriteToggle.addEventListener('change', (e) => {
        allowCloudOverwrite = e.target.checked;
        localStorage.setItem("mathmaster_cloud_overwrite", allowCloudOverwrite);
    });
}

const tourWelcomeModal = document.getElementById('tourWelcomeModal');
const tourOverlay = document.getElementById('tourOverlay');
const tourTooltip = document.getElementById('tourTooltip');
const tourTextEl = document.getElementById('tourText');
const tourNextBtn = document.getElementById('tourNextBtn');
const tourEndBtn = document.getElementById('tourEndBtn');
if (tourNextBtn) tourNextBtn.addEventListener("click", nextTourStep);

let currentStep = 0;

const tourSteps = [
    { element: 'h1 .version', text: 'This is the **Version Number (v2.8)**, check here for update information!', position: 'bottom', adjust: {y: 10, x: 0} },
    { element: '.header p a:nth-child(1)', text: 'The **Game Request** link is where you can request new games to be added!', position: 'bottom', adjust: {y: 10, x: 0} },
    { element: '.header p a:nth-child(2)', text: 'The **Contact Us** link is where you can send a message, primarily for **Game Requests**!', position: 'bottom', adjust: {y: 10, x: 0} },
    { element: '.header p a:nth-child(3)', text: 'The **Unblock Form** is a way to request access if the site is blocked.', position: 'bottom', adjust: {y: 10, x: 0} },
    { element: '.header p a:nth-child(4)', text: 'The **Github** link is where you can view the source code and contribute!', position: 'bottom', adjust: {y: 10, x: 0} },
    { element: '.collapsible-header', text: 'This is the **Credits Panel**. Click it to see the original creators of the games.', position: 'left', adjust: {y: 0, x: -10} },
    { element: '#searchBtn', text: 'This is the **Search** button. It opens a quick search bar above the dock.', position: 'top', adjust: {y: -10, x: 0} },
    { element: '#settingsBtn', text: 'This is **Site Settings**. Click it to open the settings panel, where the canvas mode, export and import buttons, and viewer controls can be customized!', position: 'top', adjust: {y: -10, x: 0} }
];

function checkSecretTrigger() {
    const allButtonsOff = Object.values(viewerControlsVisibility).every(val => val === false);
    if (isCanvasMode && allButtonsOff) {
        document.getElementById("loginGate").style.display = "flex";
        closePopups();
    }
}

function startTour() {
    tourWelcomeModal.style.display = 'none';
    tourOverlay.style.display = 'block';
    currentStep = 0;
    showTourStep(currentStep);
}

function nextTourStep() {
    if (currentStep < tourSteps.length - 1) {
        currentStep++;
        showTourStep(currentStep);
    } else {
        endTour(true);
    }
}

function endTour(completed) {
    localStorage.setItem("mathmaster_tour_completed", "true");
    if(tourWelcomeModal) tourWelcomeModal.style.display = 'none';
    if(tourOverlay) tourOverlay.style.display = 'none';
    if(tourTooltip) tourTooltip.style.opacity = '0';
    const highlight = document.querySelector('.tour-highlight');
    if (highlight) highlight.remove();
}

function showTourStep(stepIndex) {
    const step = tourSteps[stepIndex];
    const targetElement = document.querySelector(step.element);

    if (!targetElement) {
        nextTourStep(); 
        return;
    }
    
    tourTextEl.innerHTML = step.text;
    if (stepIndex === tourSteps.length - 1) {
        tourNextBtn.style.display = 'none';
        tourEndBtn.style.display = 'block';
    } else {
        tourNextBtn.style.display = 'block';
        tourEndBtn.style.display = 'none';
    }

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        const rect = targetElement.getBoundingClientRect();
        let highlight = document.querySelector('.tour-highlight');
        if (!highlight) {
            highlight = document.createElement('div');
            highlight.className = 'tour-highlight';
            tourOverlay.appendChild(highlight);
        }

        highlight.style.width = `${rect.width + 10}px`;
        highlight.style.height = `${rect.height + 10}px`;
        highlight.style.top = `${rect.top + window.scrollY - 5}px`;
        highlight.style.left = `${rect.left + window.scrollX - 5}px`;
        
        let tooltipX, tooltipY;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        switch (step.position) {
            case 'top': tooltipX = centerX - tourTooltip.offsetWidth / 2; tooltipY = rect.top - tourTooltip.offsetHeight - 15 + (step.adjust.y || 0); break;
            case 'bottom': tooltipX = centerX - tourTooltip.offsetWidth / 2; tooltipY = rect.bottom + 15 + (step.adjust.y || 0); break;
            case 'left': tooltipX = rect.left - tourTooltip.offsetWidth - 15 + (step.adjust.x || 0); tooltipY = centerY - tourTooltip.offsetHeight / 2; break;
            case 'right': tooltipX = rect.right + 15 + (step.adjust.x || 0); tooltipY = centerY - tourTooltip.offsetHeight / 2; break;
            default: tooltipX = centerX - tourTooltip.offsetWidth / 2; tooltipY = rect.bottom + 15;
        }
        
        if (tooltipX < 10) tooltipX = 10;
        if (tooltipX + tourTooltip.offsetWidth > window.innerWidth - 10) {
            tooltipX = window.innerWidth - tourTooltip.offsetWidth - 10;
        }
        
        tourTooltip.style.left = `${tooltipX + window.scrollX}px`;
        tourTooltip.style.top = `${tooltipY + window.scrollY}px`;
        tourTooltip.style.opacity = '1';
    }, 400); 
}

// Patch script injected before ytgame.js / PixiJS in srcdoc games.
// Fixes: (1) /undefined/ in CDN fetch/XHR/script-tag paths, (2) WebGL crash via forceCanvas.
const GAME_PATCH_SCRIPT = `<script>
(function(){
  var LOCALE = 'en';
  var UNDEF_RE = /\\/undefined\\//g;

  // --- Fix 1a: Patch fetch + XHR (catches most requests) ---
  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string') url = url.replace(UNDEF_RE, '/' + LOCALE + '/');
    return _fetch.call(this, url, opts);
  };
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url) {
    if (typeof url === 'string') arguments[1] = url.replace(UNDEF_RE, '/' + LOCALE + '/');
    return _open.apply(this, arguments);
  };

  // --- Fix 1b: Patch dynamically created <script>/<link>/<img> src/href ---
  // ytgame.js loads its home page via an injected <script src> tag which bypasses fetch/XHR.
  var _createElement = document.createElement.bind(document);
  document.createElement = function(tag) {
    var el = _createElement(tag);
    var t = (tag || '').toLowerCase();
    if (t === 'script' || t === 'link' || t === 'img') {
      ['src', 'href'].forEach(function(attr) {
        var proto = Object.getPrototypeOf(el);
        // Walk prototype chain to find the real descriptor
        var desc;
        var p = proto;
        while (p && !desc) { desc = Object.getOwnPropertyDescriptor(p, attr); p = Object.getPrototypeOf(p); }
        if (!desc || !desc.set) return;
        Object.defineProperty(el, attr, {
          get: desc.get ? desc.get.bind(el) : undefined,
          set: function(v) {
            if (typeof v === 'string') v = v.replace(UNDEF_RE, '/' + LOCALE + '/');
            desc.set.call(el, v);
          },
          configurable: true
        });
      });
    }
    return el;
  };

  // --- Fix 1c: Synthetic ytgame locale dispatch ---
  // ytgame.js waits for a postMessage from YouTube with {type:'ytgame:set_data', hl:'en'}.
  // That message never arrives in our iframe, so hl stays undefined.
  // We dispatch it after a tick (once ytgame.js has registered its 'message' listener).
  setTimeout(function() {
    var payload = JSON.stringify({ type: 'ytgame:set_data', hl: LOCALE, countryCode: 'US' });
    window.dispatchEvent(new MessageEvent('message', { data: payload, origin: window.location.origin }));
    // Some ytgame versions parse the object directly (not JSON-stringified)
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'ytgame:set_data', hl: LOCALE, countryCode: 'US' }, origin: window.location.origin }));
  }, 0);

  // --- Fix 2: Force PixiJS canvas renderer (WebGL unavailable in sandboxed iframe) ---
  var _PIXI;
  Object.defineProperty(window, 'PIXI', {
    get: function() { return _PIXI; },
    set: function(v) {
      _PIXI = v;
      if (!v || !v.Application) return;
      var OrigApp = v.Application;
      v.Application = function(opts) {
        opts = Object.assign({}, opts || {}, { forceCanvas: true });
        return new OrigApp(opts);
      };
      Object.setPrototypeOf(v.Application, OrigApp);
      v.Application.prototype = OrigApp.prototype;
    },
    configurable: true
  });
})();
<\/script>`;

// ── Content Warning System ─────────────────────────────────────────────────────
const CONTENT_WARNINGS = (() => {
    const map = {};

    // Violence / disturbing content
    const violent = [
        "Versions/Assets/Game Data/Five Nights at Epsteins.html",
        "Versions/Assets/Game Data/Five Nights at Last Breath.html",
        "./Versions/Assets/Game Data/751.html",
        "./Versions/Assets/Game Data/187.html",
        "./Versions/Assets/Game Data/687.html",
        "./Versions/Assets/Game Data/554.html",
        "./Versions/Assets/Game Data/445.html",
        "./Versions/Assets/Game Data/446.html",
        "./Versions/Assets/Game Data/501.html",
        "./Versions/Assets/Game Data/205-f.html",
        "./Versions/Assets/Game Data/308.html",
        "./Versions/Assets/Game Data/706-fix.html",
        "./Versions/Assets/Game Data/617-a.html",
        "./Versions/Assets/Game Data/426.html",
        "./Versions/Assets/Game Data/434.html",
        "./Versions/Assets/Game Data/814.html",
    ];
    violent.forEach(p => { map[p] = "violence"; });

    // Self-harm / suicide themes
    const selfharm = [
        "./Versions/Assets/Game Data/708-fix.html",
        "./Versions/Assets/Game Data/427-z.html",
        "./Versions/Assets/Game Data/650-f.html",
        "./Versions/Assets/Game Data/651.html",
        "./Versions/Assets/Game Data/778.html",
        "./Versions/Assets/Game Data/433.html",
    ];
    selfharm.forEach(p => { map[p] = "selfharm"; });

    return map;
})();

// Normalise path so both "./foo" and "foo" hit the map
function _normPath(p) {
    return p.replace(/^\.\//,'');
}

function loadGameSafe(p) {
    const key = CONTENT_WARNINGS[p] || CONTENT_WARNINGS['./' + _normPath(p)] || CONTENT_WARNINGS[_normPath(p)];
    if (!key) { loadGame(p); return; }

    const modal = document.getElementById('contentWarnModal');
    const bodyViolence = document.getElementById('cwBodyViolence');
    const bodySelfharm = document.getElementById('cwBodySelfharm');
    const proceedBtn = document.getElementById('cwProceedBtn');

    if (!modal) { loadGame(p); return; }

    // Show the right body
    bodyViolence.style.display = key === 'violence' ? 'block' : 'none';
    bodySelfharm.style.display = key === 'selfharm' ? 'block' : 'none';

    // Wire the proceed button for this specific path
    proceedBtn.onclick = () => {
        modal.style.display = 'none';
        loadGame(p);
    };

    modal.style.display = 'flex';
}

async function loadGame(p) {
    currentSrc = p;
    // Save scroll position so we can restore it when returning to the game grid
    try { localStorage.setItem('mathmaster_scroll_pos', window.scrollY); } catch(e) {}

    grid.style.display = "none";
    viewer.style.display = "flex";
    viewer.style.position = "fixed";
    viewer.style.top = "0";
    viewer.style.left = "0";
    viewer.style.width = "100vw";
    viewer.style.height = "100vh";
    viewer.style.zIndex = "9999";
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.border = "none";
    frame.style.flex = "1";
    document.querySelector('.dock-container').style.transform = "translate(-50%, 200%)";

    let recentlyPlayed = JSON.parse(localStorage.getItem('mathmaster_recent')) || [];
    recentlyPlayed = recentlyPlayed.filter(src => src !== p);
    recentlyPlayed.unshift(p); 
    if (recentlyPlayed.length > 50) recentlyPlayed.pop(); 
    localStorage.setItem('mathmaster_recent', JSON.stringify(recentlyPlayed));

    // Attempt srcdoc injection for ytgame/Pixi games so patches run before those libs.
    // Falls back to direct src= if the file can't be fetched (e.g. cross-origin blob URLs).
    let usedSrcdoc = false;
    try {
        const resp = await fetch(p);
        if (resp.ok) {
            let html = await resp.text();
            if (html.includes('ytgame.js') || html.includes('pixi') || html.includes('PIXI')) {
                html = html.replace(/(<head[^>]*>)/i, '$1' + GAME_PATCH_SCRIPT);
                frame.removeAttribute('src');
                frame.srcdoc = html;
                usedSrcdoc = true;
            }
        }
    } catch(e) { /* fetch failed — fall through to direct src */ }

    if (!usedSrcdoc) {
        frame.removeAttribute('srcdoc');
        frame.src = p;
    }

    renderViewerButtons(); 
}

function goHome() {
    if (document.fullscreenElement) document.exitFullscreen();
    viewer.style.display = "none";
    viewer.style.position = "";
    viewer.style.top = "";
    viewer.style.left = "";
    viewer.style.width = "";
    viewer.style.height = "";
    viewer.style.zIndex = "";
    frame.style.width = "";
    frame.style.height = "";
    frame.style.border = "";
    frame.style.flex = "";
    grid.style.display = "grid";
    frame.src = "";
    document.querySelector('.dock-container').style.transform = "translateX(-50%)";
    // Restore the scroll position saved when the user opened this game
    try {
        const saved = localStorage.getItem('mathmaster_scroll_pos');
        if (saved !== null) {
            requestAnimationFrame(() => window.scrollTo(0, parseInt(saved)));
        }
    } catch(e) {}
}

function isSecretUnlocked() {
    const deviceId = localStorage.getItem("mathmaster_device_id");
    const list = JSON.parse(localStorage.getItem("mathmaster_registered_devices") || "[]");
    const sessionUnlocked = sessionStorage.getItem("mathmaster_session_unlocked") === "true";
    return sessionUnlocked || (deviceId && list.includes(deviceId));
}

function getCustomGames() {
    return new Promise((resolve) => {
        if (!window.indexedDB) { resolve([]); return; }
        try {
            const request = indexedDB.open("GlassExplorerDB", 1);
            request.onupgradeneeded = () => resolve([]); 
            request.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("files")) { resolve([]); return; }
                const transaction = db.transaction(["files"], "readonly");
                const store = transaction.objectStore("files");
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const files = getAllRequest.result || [];
                    resolve(files.filter(f => f.path && f.path.startsWith("Games/") && f.name.endsWith(".html")));
                };
                getAllRequest.onerror = () => resolve([]);
            };
            request.onerror = () => resolve([]);
        } catch (error) { resolve([]); }
    });
}

const PASSWORD = "CabinTime2026!";
const MAX_DEVICES = 10;
const DEVICE_KEY = "mathmaster_device_id";
const MASTER_LIST_KEY = "mathmaster_registered_devices";

function checkPassword() {
    const input = document.getElementById("passwordInput").value;
    const remember = document.getElementById("rememberToggle").checked;
    const error = document.getElementById("loginError");
    const limit = document.getElementById("loginLimit");
    error.style.display = "none"; limit.style.display = "none";

    if (input !== PASSWORD) { error.style.display = "block"; return; }

    let deviceId = localStorage.getItem(DEVICE_KEY);
    let list = JSON.parse(localStorage.getItem(MASTER_LIST_KEY) || "[]");

    if (remember) {
        if (!deviceId || !list.includes(deviceId)) {
            if (list.length >= MAX_DEVICES) { limit.style.display = "block"; return; }
            deviceId = crypto.randomUUID();
            list.push(deviceId);
            localStorage.setItem(DEVICE_KEY, deviceId);
            localStorage.setItem(MASTER_LIST_KEY, JSON.stringify(list));
        }
    } else {
        sessionStorage.setItem("mathmaster_session_unlocked", "true");
    }

    document.getElementById("loginGate").style.display = "none";
    renderGamesGrid(); 
}

function toggleCredits() {
    const panel = document.getElementById("creditsPanel");
    if (panel) panel.style.display = (panel.style.display === "block") ? "none" : "block";
}

function reloadGame() {
    if (currentSrc) {
        loadGame(currentSrc); // re-runs fetch+srcdoc injection
    } else {
        const gameFrame = document.getElementById("gameFrame");
        if (gameFrame && gameFrame.src) gameFrame.src = gameFrame.src;
    }
}

function toggleFullscreen() {
    const viewerElement = document.getElementById("viewer");
    if (!document.fullscreenElement) viewerElement.requestFullscreen().catch(err => console.error(err));
    else document.exitFullscreen();
}

function openInNewTab() {
    // Resolve the URL from currentSrc (always set by loadGame, works for both
    // direct-src and srcdoc-injected games where gameFrame.src would be blank).
    if (!currentSrc) return;
    const url = new URL(currentSrc, window.location.href).href;
    // Use .call(window, ...) rather than the pre-bound form so Chromium's
    // user-gesture popup trust check sees a direct window.open invocation.
    // _nativeOpen is still the reference captured before any iframe could
    // clobber window.open, so we keep that protection too.
    _nativeOpen.call(window, url, '_blank');
}

// ==============================================
// === PASTE YOUR ENTIRE GAMES ARRAY HERE! ======
// ==============================================
const games = [

  {name:"Love Meter", path:"Versions/Assets/Game Data/love_meter.html", logo:"Versions/Assets/Pictures/Non-edited/LoveMeter-n.webp"},
  {name:"12 Mini Battles", path:"Versions/Assets/Game Data/12 Mini Battles.html", logo:"Versions/Assets/Pictures/Non-edited/12MiniBattles-n.webp"},
  {name:"1v1.lol", path:"Versions/Assets/Game Data/1v1.LoL.html", logo:"Versions/Assets/Pictures/Non-edited/1v1.lol-n.webp"},
  {name:"2048", path:"Versions/Assets/Game Data/2048.html", logo:"Versions/Assets/Pictures/Non-edited/2048-n.webp"},
  {name:"Among Us", path:"Versions/Assets/Game Data/Among Us.html", logo:"Versions/Assets/Pictures/Non-edited/AmongUs-n.webp"},
  {name:"Arthur's Nightmare", path:"Versions/Assets/Game Data/Arthur Nightmare.html", logo:"Versions/Assets/Pictures/Non-edited/Arthur-Nightmare-n.webp"},
  {name:"Backrooms", path:"Versions/Assets/Game Data/Backrooms.html", logo:"Versions/Assets/Pictures/Non-edited/Backrooms-n.webp"},
  {name:"Brawl Stars", path:"Versions/Assets/Game Data/Brawl Simulator 3D.html", logo:"Versions/Assets/Pictures/Non-edited/Brawl-n.webp"},
  {name:"Bad Ice Cream", path:"Versions/Assets/Game Data/Bad Ice Cream.html", logo:"Versions/Assets/Pictures/Non-edited/BadIceCream-n.webp"},
  {name:"Baseball Bros", path:"Versions/Assets/Game Data/Baseball Bros.html", logo:"Versions/Assets/Pictures/Non-edited/Baseball-n.webp"},
  {name: "Basket Bros", path: "Versions/Assets/Game Data/Basket Bros.html", logo: "Versions/Assets/Pictures/Non-edited/Basket-n.webp"},
  {name:"Basketball Stars", path:"Versions/Assets/Game Data/Basketball Stars.html", logo:"Versions/Assets/Pictures/Non-edited/BasketballStars-n.webp"},
  {name:"Block Blast", path:"Versions/Assets/Game Data/Block Blast.html", logo:"Versions/Assets/Pictures/Non-edited/BlockBlast-n.webp"},
  {name:"Bridge Race", path:"Versions/Assets/Game Data/Bridge Race.html", logo:"Versions/Assets/Pictures/Non-edited/BridgeRace-n.webp"},
  {name:"Candy Crush", path: "Versions/Assets/Game Data/Candy Crush.html", logo: "Versions/Assets/Pictures/Non-edited/CandyCrush-n.webp"},
  {name:"Cluster Rush", path:"Versions/Assets/Game Data/Cluster Rush.html", logo:"Versions/Assets/Pictures/Non-edited/ClusterTruck-n.webp"},
  {name:"Cookie Clicker", path:"Versions/Assets/Game Data/Cookie Clicker.html", logo:"Versions/Assets/Pictures/Non-edited/CookieClicker-n.ico", external:true},
  {name:"Coreball",path:"Versions/Assets/Game Data/Coreball.html", logo:"Versions/Assets/Pictures/Non-edited/Core-n.webp"},
  {name:"Crossyroad", path:"Versions/Assets/Game Data/Crossy Road.html", logo:"Versions/Assets/Pictures/Non-edited/CrossyRoad-n.webp"},
  {name:"Drift Hunters",path:"Versions/Assets/Game Data/Drift Hunters.html", logo:"Versions/Assets/Pictures/Non-edited/Drift-Hunters-n.webp"},
  {name:"Drive Mad", path:"Versions/Assets/Game Data/Drive Mad.html", logo:"Versions/Assets/Pictures/Non-edited/DriveMad-n.webp"},
  {name:"Duck Life 4", path:"Versions/Assets/Game Data/Duck Life 4.html", logo:"Versions/Assets/Pictures/Non-edited/DuckLife4-n.webp"},
  {name:"Five Nights at Freddy's", path:"Versions/Assets/Game Data/Five Nights at Freddys.html", logo:"Versions/Assets/Pictures/Non-edited/FNAF-n.webp"},
  {name:"Five Nights at Freddy's 2", path:"Versions/Assets/Game Data/Five Nights at Freddys 2.html", logo:"Versions/Assets/Pictures/Non-edited/FNAF2-n.webp"},
  {name:"Five Nights at Freddy's 3", path:"Versions/Assets/Game Data/Five Nights at Freddys 3.html", logo:"Versions/Assets/Pictures/Non-edited/FNAF3-n.webp"},
  {name:"Five Nights at Freddy's 4", path:"Versions/Assets/Game Data/Five Nights at Freddys 4.html", logo:"Versions/Assets/Pictures/Non-edited/FNAF4-n.webp"},
  {name:"Five Nights at Freddy's Sister Location", path:"Versions/Assets/Game Data/Five Nights at Freddys Sister Location.html", logo: "Versions/Assets/Pictures/Non-edited/Sister-Location-n.webp"},
  {name:"Five Nights at Freddy's Ultimate Customs Night", path:"Versions/Assets/Game Data/Five Nights at Freddys Ultimate Custom Night.html", logo: "Versions/Assets/Pictures/Non-edited/Customs-Night-n.webp"},
  {name: "Five Nights at Winston's", path: "Versions/Assets/Game Data/Five Nights at Winstons.html", logo: "Versions/Assets/Pictures/Non-edited/Winston-n.webp"},
  {name:"FNAF World", path:"Versions/Assets/Game Data/FNAF World.html", logo:"Versions/Assets/Pictures/Non-edited/FNAF-World.webp"},
  {name: "Free Rider Jumps", path: "Versions/Assets/Game Data/Free Rider Jumps.html", logo: "Versions/Assets/Pictures/Non-edited/Free-n.webp"},
  {name:"Fruit Ninja", path:"Versions/Assets/Game Data/Fruit Ninja.html", logo:"Versions/Assets/Pictures/Non-edited/FruitNinja-n.webp"},
  {name:"Football Bros", path:"Versions/Assets/Game Data/Football Bros (1).html", logo:"Versions/Assets/Pictures/Non-edited/Football-n.webp"},
  {name:"Granny", path:"Versions/Assets/Game Data/Granny.html", logo:"Versions/Assets/Pictures/Non-edited/Granny-n.webp"},
  {name:"Granny 2", path:"Versions/Assets/Game Data/Granny 2.html", logo:"Versions/Assets/Pictures/Non-edited/Granny-2-n.webp"},
  {name:"Granny 3", path:"Versions/Assets/Game Data/Granny 3.html", logo:"Versions/Assets/Pictures/Non-edited/Granny-3-n.webp"},
  {name:"Hill Climb Racing Lite", path:"Versions/Assets/Game Data/Hill Climb Racing Lite.html", logo:"Versions/Assets/Pictures/Non-edited/Hill-n.webp", external:true},
  {name:"Idle Lumber Inc.", path:"Versions/Assets/Game Data/Idle Lumber Inc.html", logo:"Versions/Assets/Pictures/Non-edited/Lumber-n.webp"},
  {name:"Line Rider", path:"Versions/Assets/Game Data/Line Rider.html", logo: "Versions/Assets/Pictures/Non-edited/Line-Rider-n.webp"},
  {name:"Minecraft", path:"Versions/Assets/Game Data/Minecraft 1.8.8.html", logo:"Versions/Assets/Pictures/Non-edited/Minecraft-n.webp",external:true},
  {name:"Moto X3M 2", path:"Versions/Assets/Game Data/motox3m2/index.html", logo:"Versions/Assets/Pictures/Non-edited/Motox3m2-n.webp"},
  {name:"Moto X3M Pool Party", path:"Versions/Assets/Game Data/Moto X3M Pool Party.html", logo:"Versions/Assets/Pictures/Non-edited/Motox3mPool-n.webp"},
  {name:"Moto X3M Spooky", path:"Versions/Assets/Game Data/Moto X3M Spooky.html", logo:"Versions/Assets/Pictures/Non-edited/Motox3mSpooky-n.webp"},
  {name:"Moto X3M Winter", path:"Versions/Assets/Game Data/Moto X3M Winter.html", logo:"Versions/Assets/Pictures/Non-edited/Motox3mWinter-n.webp"},
  {name:"Ovo 2", path:"Versions/Assets/Game Data/OvO 2.html", logo:"Versions/Assets/Pictures/Non-edited/OvO-2-n.webp"},
  {name:"Plants Vs Zombies", path:"Versions/Assets/Game Data/Plants vs Zombies.html", logo:"Versions/Assets/Pictures/Non-edited/PlantsVsZombies-n.webp"},
  {name: "Poly Track", path: "Versions/Assets/Game Data/Poly Track Real.html", logo: "Versions/Assets/Pictures/Non-edited/Poly-n.webp"},
  {name:"Red Ball 4", path:"Versions/Assets/Game Data/Red Ball 4.html", logo:"Versions/Assets/Pictures/Non-edited/RedBall4-n.webp"},
  {name:"Red Ball 4 Vol. 2", path:"Versions/Assets/Game Data/Red Ball 4 Vol. 2.html", logo:"Versions/Assets/Pictures/Non-edited/RedBall4-2-n.webp"},
  {name:"Red Ball 4 Vol. 3", path:"Versions/Assets/Game Data/Red Ball 4 Vol. 3.html", logo:"Versions/Assets/Pictures/Non-edited/RedBall4-3-n.webp"},
  {name:"Retro Bowl", path:"Versions/Assets/Game Data/Retro Bowl.html", logo:"Versions/Assets/Pictures/Non-edited/Retrobowl-n.webp"},
  {name:"Riddle School", path:"Versions/Assets/Game Data/Riddle School.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-n.webp"},
  {name:"Riddle School 2", path:"Versions/Assets/Game Data/Riddle School 2.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-2-n.webp"},
  {name:"Riddle School 3", path:"Versions/Assets/Game Data/Riddle School 3.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-3-n.webp"},
  {name:"Riddle School 4", path:"Versions/Assets/Game Data/Riddle School 4.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-4-n.webp"},
  {name:"Riddle School 5", path:"Versions/Assets/Game Data/Riddle School 5.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-5-n.webp"},
  {name:"Riddle School 6", path:"Versions/Assets/Game Data/Riddle Transfer.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-6-n.webp"},
  {name:"Riddle School 7", path:"Versions/Assets/Game Data/Riddle Transfer 2.html", logo:"Versions/Assets/Pictures/Non-edited/Riddle-7-n.webp"},
  {name:"Rolly Vortex", path:"Versions/Assets/Game Data/Rolly Vortex.html", logo:"Versions/Assets/Pictures/Non-edited/RollyVortex-n.webp"},
  {name:"Rooftop Snipers", path:"Versions/Assets/Game Data/Rooftop Snipers.html", logo:"Versions/Assets/Pictures/Non-edited/RooftopSnipers-n.webp"},
  {name:"Run", path:"Versions/Assets/Game Data/Run 1.html", logo:" Versions/Assets/Pictures/Non-edited/Run1-n.webp"},
  {name: "Run 2", path: "Versions/Assets/Game Data/Run 2.html", logo: "Versions/Assets/Pictures/Non-edited/Run-2-n.webp"},
  {name:"Run 3", path:"Versions/Assets/Game Data/Run 3.html", logo:"Versions/Assets/Pictures/Non-edited/Run3-n.webp"},
  {name: "Schoolboy Runaway", path: "Versions/Assets/Game Data/Schoolboy Runaway.html", logo: "Versions/Assets/Pictures/Non-edited/Runaway-n.webp", external:true},
  {name: "Soccer Random", path: "Versions/Assets/Game Data/Soccer Random.html", logo: "Versions/Assets/Pictures/Non-edited/SoccerRandom-n.webp"},
  {name: "Soundboard", path: "Versions/Assets/Game Data/Soundboard.html", logo: "Versions/Assets/Pictures/Non-edited/Soundboard-n.webp"},
  {name:"Slope 2", path:"Versions/Assets/Game Data/Slope 2.html", logo:"Versions/Assets/Pictures/Non-edited/Slope2-n.webp"},
  {name:"Solar Smash", path:"Versions/Assets/Game Data/Solar Smash.html", logo:"Versions/Assets/Pictures/Non-edited/SolarSmash-n.webp"},
  {name:"Station Saturn", path:"Versions/Assets/Game Data/Station Saturn.html", logo:"Versions/Assets/Pictures/Non-edited/StationSaturn-n.webp"},
  {name:"Steal A Brainrot", path:"Versions/Assets/Game Data/Steal A Brainrot.html", logo:"Versions/Assets/Pictures/Non-edited/StealABrainrot-n.webp"},
  {name:"Subway Surfers", path:"Versions/Assets/Game Data/Subway Surfers.html", logo:"Versions/Assets/Pictures/Non-edited/SubwaySurfers-n.webp"},
  {name:"Stickman Hook", path:"Versions/Assets/Game Data/Stickman Hook.html", logo:"Versions/Assets/Pictures/Non-edited/Stickman-n.webp"},
  {name:"Space Waves", path:"Versions/Assets/Game Data/Space Waves.html", logo:"Versions/Assets/Pictures/Non-edited/Space-Waves-n.webp"},
  {name:"Temple Run 2", path:"Versions/Assets/Game Data/Temple Run 2.html", logo:"Versions/Assets/Pictures/Non-edited/TempleRun2-n.webp"},
  {name:"Tunnel Rush", path: "Versions/Assets/Game Data/Tunnel Rush.html", logo: "Versions/Assets/Pictures/Non-edited/TunnelRush-n.webp"},
  {name:"The Impossible Quiz", path:"Versions/Assets/Game Data/The Impossible Quiz.html", logo:"Versions/Assets/Pictures/Non-edited/ImpossibleQuiz-n.webp"},
  {name:"The Man In The Window", path:"Versions/Assets/Game Data/The Man In The Window.html", logo:"Versions/Assets/Pictures/Non-edited/ManFromWindow-n.webp"},
  {name:"Tomb of the Mask", path:"Versions/Assets/Game Data/Tomb Of The Mask.html", logo:"Versions/Assets/Pictures/Non-edited/TombOfMask-n.webp"},
  {name:"Volleyball Random", path:"Versions/Assets/Game Data/Volley Random.html", logo:"Versions/Assets/Pictures/Non-edited/VolleyRandom-n.webp"},
  {name:"Wrestle Bros", path:"Versions/Assets/Game Data/Wrestle Bros.html", logo:"Versions/Assets/Pictures/Non-edited/wrestle-n.webp"},
  {name:"Wordle", path:"Versions/Assets/Game Data/Wordle.html", logo:"Versions/Assets/Pictures/Non-edited/Wordle-n.webp"},
  {name:"Yohoho.io", path:"Versions/Assets/Game Data/YoHoHo.io.html", logo: "Versions/Assets/Pictures/Non-edited/yohoho-n.webp"},
  {name:"Bowmasters", path:"./Versions/Assets/Game Data/0.html", logo:"./Versions/Assets/Pictures/Non-edited/0.webp", external:true},
  {name:"OvO", path:"./Versions/Assets/Game Data/1-fde.html", logo:"./Versions/Assets/Pictures/Non-edited/1.webp"},
  {name:"Gladihoppers", path:"./Versions/Assets/Game Data/4.html", logo:"./Versions/Assets/Pictures/Non-edited/4.webp"},
  {name:"Ice Dodo", path:"./Versions/Assets/Game Data/5.html", logo:"./Versions/Assets/Pictures/Non-edited/5.webp"},
  {name:"Jetpack Joyride", path:"./Versions/Assets/Game Data/7.html", logo:"./Versions/Assets/Pictures/Non-edited/7.webp"},
  {name:"Friday Night Funkin", path:"./Versions/Assets/Game Data/8-wow.html", logo:"./Versions/Assets/Pictures/Non-edited/8.webp"},
  {name:"Sprunki", path:"./Versions/Assets/Game Data/9.html", logo:"./Versions/Assets/Pictures/Non-edited/9.webp"},
  {name:"Attack Hole", path:"./Versions/Assets/Game Data/13.html", logo:"./Versions/Assets/Pictures/Non-edited/13.webp", external:true},
  {name:"Color Water Sort 3D", path:"./Versions/Assets/Game Data/15.html", logo:"./Versions/Assets/Pictures/Non-edited/15.webp", external:true},
  {name:"Magic Tiles 3", path:"./Versions/Assets/Game Data/17.html", logo:"./Versions/Assets/Pictures/Non-edited/17.webp", external:true},
  {name:"Stacky Dash", path:"./Versions/Assets/Game Data/18.html", logo:"./Versions/Assets/Pictures/Non-edited/18.webp", external:true},
  {name:"Turbo Stars", path:"./Versions/Assets/Game Data/21.html", logo:"./Versions/Assets/Pictures/Non-edited/21.webp", external:true},
  {name:"Basket Battle", path:"./Versions/Assets/Game Data/25.html", logo:"./Versions/Assets/Pictures/Non-edited/25.webp"},
  {name:"Amaze", path:"./Versions/Assets/Game Data/26.html", logo:"./Versions/Assets/Pictures/Non-edited/26.webp", external:true},
  {name:"Basketball Frvr", path:"./Versions/Assets/Game Data/28.html", logo:"./Versions/Assets/Pictures/Non-edited/28.webp"},
  {name:"Bazooka Boy", path:"./Versions/Assets/Game Data/29.html", logo:"./Versions/Assets/Pictures/Non-edited/29.webp", external:true},
  {name:"Bottle Jump 3D", path:"./Versions/Assets/Game Data/30.html", logo:"./Versions/Assets/Pictures/Non-edited/30.webp", external:true},
  {name:"Color Match", path:"./Versions/Assets/Game Data/31.html", logo:"./Versions/Assets/Pictures/Non-edited/31.webp"},
  {name:"Retro Bowl College", path:"./Versions/Assets/Game Data/Retro Bowl College.html", logo:"./Versions/Assets/Pictures/Non-edited/34.webp"},
  {name:"Monster Tracks", path:"./Versions/Assets/Game Data/36.html", logo:"./Versions/Assets/Pictures/Non-edited/36.webp"},
  {name:"Gobble", path:"./Versions/Assets/Game Data/37.html", logo:"./Versions/Assets/Pictures/Non-edited/37.webp"},
  {name:"Road of Fury", path:"./Versions/Assets/Game Data/42.html", logo:"./Versions/Assets/Pictures/Non-edited/42.webp"},
  {name:"Driven Wild", path:"./Versions/Assets/Game Data/43.html", logo:"./Versions/Assets/Pictures/Non-edited/43.webp"},
  {name:"Ragdoll Hit", path:"./Versions/Assets/Game Data/44-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/44.webp"},
  {name:"Vex 1", path:"./Versions/Assets/Game Data/45.html", logo:"./Versions/Assets/Pictures/Non-edited/45.webp"},
  {name:"Vex 2", path:"./Versions/Assets/Game Data/46.html", logo:"./Versions/Assets/Pictures/Non-edited/46.webp"},
  {name:"Vex 3", path:"./Versions/Assets/Game Data/47.html", logo:"./Versions/Assets/Pictures/Non-edited/47.webp"},
  {name:"Vex 3 XMAS", path:"./Versions/Assets/Game Data/48.html", logo:"./Versions/Assets/Pictures/Non-edited/48.webp"},
  {name:"Vex 5", path:"./Versions/Assets/Game Data/50.html", logo:"./Versions/Assets/Pictures/Non-edited/50.webp"},
  {name:"Vex 6", path:"./Versions/Assets/Game Data/51.html", logo:"./Versions/Assets/Pictures/Non-edited/51.webp"},
  {name:"Vex 7", path:"./Versions/Assets/Game Data/52.html", logo:"./Versions/Assets/Pictures/Non-edited/52.webp"},
  {name:"Vex 8", path:"./Versions/Assets/Game Data/53.html", logo:"./Versions/Assets/Pictures/Non-edited/53.webp"},
  {name:"Vex Challenges", path:"./Versions/Assets/Game Data/54.html", logo:"./Versions/Assets/Pictures/Non-edited/54.webp"},
  {name:"Vex X3M", path:"./Versions/Assets/Game Data/55.html", logo:"./Versions/Assets/Pictures/Non-edited/55.webp"},
  {name:"Vex X3M 2", path:"./Versions/Assets/Game Data/56.html", logo:"./Versions/Assets/Pictures/Non-edited/56.webp"},
  {name:"A Dance of Fire and Ice", path:"./Versions/Assets/Game Data/59.html", logo:"./Versions/Assets/Pictures/Non-edited/59.webp"},
  {name:"Achievement Unlocked", path:"./Versions/Assets/Game Data/60.html", logo:"./Versions/Assets/Pictures/Non-edited/60.webp"},
  {name:"Achievement Unlocked 2", path:"./Versions/Assets/Game Data/61.html", logo:"./Versions/Assets/Pictures/Non-edited/61.webp"},
  {name:"Achievement Unlocked 3", path:"./Versions/Assets/Game Data/62.html", logo:"./Versions/Assets/Pictures/Non-edited/62.webp"},
  {name:"Baldi's Basics", path:"./Versions/Assets/Game Data/65-fixed.html", logo:"./Versions/Assets/Pictures/Non-edited/65.webp"},
  {name:"Basket Random", path:"./Versions/Assets/Game Data/66.html", logo:"./Versions/Assets/Pictures/Non-edited/66.webp"},
  {name:"Big NEON Tower Tiny Square", path:"./Versions/Assets/Game Data/68.html", logo:"./Versions/Assets/Pictures/Non-edited/68.webp"},
  {name:"Big ICE Tower Tiny Square", path:"./Versions/Assets/Game Data/69.html", logo:"./Versions/Assets/Pictures/Non-edited/69.webp"},
  {name:"BitLife", path:"./Versions/Assets/Game Data/70.html", logo:"./Versions/Assets/Pictures/Non-edited/70.webp"},
  {name:"Bloons TD 2", path:"./Versions/Assets/Game Data/72.html", logo:"./Versions/Assets/Pictures/Non-edited/72.webp"},
  {name:"Bloons TD 4", path:"./Versions/Assets/Game Data/74.html", logo:"./Versions/Assets/Pictures/Non-edited/74.webp"},
  {name:"Bloons TD 5", path:"./Versions/Assets/Game Data/75-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/75.webp"},
  {name:"Bob The Robber 2", path:"./Versions/Assets/Game Data/76-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/76.webp"},
  {name:"Boxing Random", path:"./Versions/Assets/Game Data/77.html", logo:"./Versions/Assets/Pictures/Non-edited/77.webp"},
  {name:"Burrito Bison: Launcha Libre", path:"./Versions/Assets/Game Data/78.html", logo:"./Versions/Assets/Pictures/Non-edited/78.webp"},
  {name:"Cannon Basketball", path:"./Versions/Assets/Game Data/79.html", logo:"./Versions/Assets/Pictures/Non-edited/79.webp"},
  {name:"Cannon Basketball 2", path:"./Versions/Assets/Game Data/80.html", logo:"./Versions/Assets/Pictures/Non-edited/80.webp"},
  {name:"Cubefield", path:"./Versions/Assets/Game Data/84.html", logo:"./Versions/Assets/Pictures/Non-edited/84.webp"},
  {name:"Cut the Rope", path:"./Versions/Assets/Game Data/85-f.html", logo:"./Versions/Assets/Pictures/Non-edited/85.webp"},
  {name:"Gunspin", path:"./Versions/Assets/Game Data/91.html", logo:"./Versions/Assets/Pictures/Non-edited/91.webp"},
  {name:"Highway Racer 2", path:"./Versions/Assets/Game Data/92.html", logo:"./Versions/Assets/Pictures/Non-edited/92.webp"},
  {name:"Johnny Trigger", path:"./Versions/Assets/Game Data/93.html", logo:"./Versions/Assets/Pictures/Non-edited/93.webp"},
  {name:"Moto X3M", path:"./Versions/Assets/Game Data/96.html", logo:"./Versions/Assets/Pictures/Non-edited/96.webp"},
  {name:"Ninja vs EvilCorp", path:"./Versions/Assets/Game Data/101.html", logo:"./Versions/Assets/Pictures/Non-edited/101.webp"},
  {name:"Paper.io 2", path:"./Versions/Assets/Game Data/102.html", logo:"./Versions/Assets/Pictures/Non-edited/102.webp"},
  {name:"The World's Hardest Game", path:"./Versions/Assets/Game Data/103.html", logo:"./Versions/Assets/Pictures/Non-edited/103.webp"},
  {name:"The World's Hardest Game 3", path:"./Versions/Assets/Game Data/104.html", logo:"./Versions/Assets/Pictures/Non-edited/104.webp"},
  {name:"The World's Hardest Game 4", path:"./Versions/Assets/Game Data/105.html", logo:"./Versions/Assets/Pictures/Non-edited/105.webp"},
  {name:"This Is The Only Level", path:"./Versions/Assets/Game Data/106.html", logo:"./Versions/Assets/Pictures/Non-edited/106.webp"},
  {name:"This Is The Only Level 2", path:"./Versions/Assets/Game Data/107.html", logo:"./Versions/Assets/Pictures/Non-edited/107.webp"},
  {name:"Tiny Fishing", path:"./Versions/Assets/Game Data/108.html", logo:"./Versions/Assets/Pictures/Non-edited/108.webp"},
  {name:"Toss The Turtle", path:"./Versions/Assets/Game Data/110-f.html", logo:"./Versions/Assets/Pictures/Non-edited/110.webp"},
  {name:"Tube Jumpers", path:"./Versions/Assets/Game Data/111.html", logo:"./Versions/Assets/Pictures/Non-edited/111.webp"},
  {name:"Ruffle", path:"./Versions/Assets/Game Data/113.html", logo:"./Versions/Assets/Pictures/Non-edited/113.webp"},
  {name:"8 Ball Pool", path:"./Versions/Assets/Game Data/115.html", logo:"./Versions/Assets/Pictures/Non-edited/115.webp"},
  {name:"Snow Rider 3D", path:"./Versions/Assets/Game Data/119.html", logo:"./Versions/Assets/Pictures/Non-edited/119.webp"},
  {name:"Fashion Battle", path:"./Versions/Assets/Game Data/127.html", logo:"./Versions/Assets/Pictures/Non-edited/127.webp", external:true},
  {name:"Slice it All", path:"./Versions/Assets/Game Data/128.html", logo:"./Versions/Assets/Pictures/Non-edited/128.webp"},
  {name:"Flappy Bird", path:"./Versions/Assets/Game Data/129.html", logo:"./Versions/Assets/Pictures/Non-edited/129.webp"},
  {name:"osu!", path:"./Versions/Assets/Game Data/130.html", logo:"./Versions/Assets/Pictures/Non-edited/130.webp"},
  {name:"8 Ball Classic", path:"./Versions/Assets/Game Data/146.html", logo:"./Versions/Assets/Pictures/Non-edited/146.webp", external:true},
  {name:"Angry Birds Showdown", path:"./Versions/Assets/Game Data/147.html", logo:"./Versions/Assets/Pictures/Non-edited/147.webp", external:true},
  {name:"Archery World Tour", path:"./Versions/Assets/Game Data/148.html", logo:"./Versions/Assets/Pictures/Non-edited/148.webp", external:true},
  {name:"Ball Blast", path:"./Versions/Assets/Game Data/149.html", logo:"./Versions/Assets/Pictures/Non-edited/149.webp", external:true},
  {name:"Cannon Balls 3D", path:"./Versions/Assets/Game Data/150.html", logo:"./Versions/Assets/Pictures/Non-edited/150.webp"},
  {name:"Chess Classic", path:"./Versions/Assets/Game Data/151.html", logo:"./Versions/Assets/Pictures/Non-edited/151.webp"},
  {name:"Draw the Line", path:"./Versions/Assets/Game Data/152.html", logo:"./Versions/Assets/Pictures/Non-edited/152.webp"},
  {name:"Flappy Dunk", path:"./Versions/Assets/Game Data/153.html", logo:"./Versions/Assets/Pictures/Non-edited/153.webp", external:true},
  {name:"Guess Their Answer", path:"./Versions/Assets/Game Data/155.html", logo:"./Versions/Assets/Pictures/Non-edited/155.webp", external:true},
  {name:"Harvest.io", path:"./Versions/Assets/Game Data/156.html", logo:"./Versions/Assets/Pictures/Non-edited/156.webp", external:true},
  {name:"State.io", path:"./Versions/Assets/Game Data/161.html", logo:"./Versions/Assets/Pictures/Non-edited/161.webp", external:true},
  {name:"Tower Crash 3D", path:"./Versions/Assets/Game Data/162.html", logo:"./Versions/Assets/Pictures/Non-edited/162.webp", external:true},
  {name:"Trivia Crack", path:"./Versions/Assets/Game Data/163.html", logo:"./Versions/Assets/Pictures/Non-edited/163.webp", external:true},
  {name:"Crazy Cattle 3D", path:"./Versions/Assets/Game Data/164-temp2.html", logo:"./Versions/Assets/Pictures/Non-edited/164.webp"},
  {name:"Bad Parenting 1", path:"./Versions/Assets/Game Data/166.html", logo:"./Versions/Assets/Pictures/Non-edited/166.webp"},
  {name:"Blade Ball", path:"./Versions/Assets/Game Data/167.html", logo:"./Versions/Assets/Pictures/Non-edited/167.webp"},
  {name:"Blocky Snakes", path:"./Versions/Assets/Game Data/168.html", logo:"./Versions/Assets/Pictures/Non-edited/168.webp"},
  {name:"Bloxorz", path:"./Versions/Assets/Game Data/169.html", logo:"./Versions/Assets/Pictures/Non-edited/169.webp"},
  {name:"Big Tower Tiny Square 2", path:"./Versions/Assets/Game Data/170.html", logo:"./Versions/Assets/Pictures/Non-edited/170.webp"},
  {name:"Melon Playground", path:"./Versions/Assets/Game Data/172.html", logo:"./Versions/Assets/Pictures/Non-edited/172.webp"},
  {name:"World Box", path:"./Versions/Assets/Game Data/174.html", logo:"./Versions/Assets/Pictures/Non-edited/174.webp"},
  {name:"Run 1", path:"./Versions/Assets/Game Data/175.html", logo:"./Versions/Assets/Pictures/Non-edited/175.webp"},
  {name:"Swords and Souls", path:"./Versions/Assets/Game Data/178.html", logo:"./Versions/Assets/Pictures/Non-edited/178.webp"},
  {name:"n-gon", path:"./Versions/Assets/Game Data/180.html", logo:"./Versions/Assets/Pictures/Non-edited/180.webp"},
  {name:"Five Nights at Freddy's: Sister Location", path:"./Versions/Assets/Game Data/185.html", logo:"./Versions/Assets/Pictures/Non-edited/185.webp"},
  {name:"Ragdoll Archers", path:"./Versions/Assets/Game Data/186.html", logo:"./Versions/Assets/Pictures/Non-edited/186.webp"},
  {name:"Scrap Metal 3", path:"./Versions/Assets/Game Data/188e.html", logo:"./Versions/Assets/Pictures/Non-edited/188.webp"},
  {name:"Five Nights at Freddy's: World", path:"./Versions/Assets/Game Data/190.html", logo:"./Versions/Assets/Pictures/Non-edited/190.webp"},
  {name:"Five Nights at Freddy's: Pizza Simulator", path:"./Versions/Assets/Game Data/191.html", logo:"./Versions/Assets/Pictures/Non-edited/191.webp"},
  {name:"Do NOT Take This Cat Home", path:"./Versions/Assets/Game Data/193.html", logo:"./Versions/Assets/Pictures/Non-edited/193.webp"},
  {name:"People Playground", path:"./Versions/Assets/Game Data/194-a.html", logo:"./Versions/Assets/Pictures/Non-edited/194-m.webp", external:true},
  {name:"R.E.P.O", path:"./Versions/Assets/Game Data/195.html", logo:"./Versions/Assets/Pictures/Non-edited/195.webp"},
  {name:"ULTRAKILL", path:"./Versions/Assets/Game Data/196-fixed.html", logo:"./Versions/Assets/Pictures/Non-edited/196.webp", external:true},
  {name:"Elastic Man", path:"./Versions/Assets/Game Data/197.html", logo:"./Versions/Assets/Pictures/Non-edited/197.webp"},
  {name:"Slope", path:"./Versions/Assets/Game Data/Slope.html", logo:"./Versions/Assets/Pictures/Non-edited/198.webp"},
  {name:"Time Shooter 1", path:"./Versions/Assets/Game Data/199.html", logo:"./Versions/Assets/Pictures/Non-edited/199.webp"},
  {name:"Time Shooter 2", path:"./Versions/Assets/Game Data/200.html", logo:"./Versions/Assets/Pictures/Non-edited/200.webp"},
  {name:"Time Shooter 3: SWAT", path:"./Versions/Assets/Game Data/201.html", logo:"./Versions/Assets/Pictures/Non-edited/201.webp"},
  {name:"DOOM", path:"./Versions/Assets/Game Data/203-a.html", logo:"./Versions/Assets/Pictures/Non-edited/203.webp"},
  {name:"Snowbattle.io", path:"./Versions/Assets/Game Data/207.html", logo:"./Versions/Assets/Pictures/Non-edited/207.webp"},
  {name:"Dragon vs Bricks", path:"./Versions/Assets/Game Data/210.html", logo:"./Versions/Assets/Pictures/Non-edited/210.webp"},
  {name:"Death Run 3D", path:"./Versions/Assets/Game Data/211.html", logo:"./Versions/Assets/Pictures/Non-edited/211.webp"},
  {name:"Cut the Rope", path:"./Versions/Assets/Game Data/212-f.html", logo:"./Versions/Assets/Pictures/Non-edited/212.webp"},
  {name:"Cut the Rope: Time Travel", path:"./Versions/Assets/Game Data/213-f.html", logo:"./Versions/Assets/Pictures/Non-edited/213.webp"},
  {name:"Cut the Rope: Holiday Gift", path:"./Versions/Assets/Game Data/214-fi.html", logo:"./Versions/Assets/Pictures/Non-edited/214.webp"},
  {name:"Bendy and the Ink Machine", path:"./Versions/Assets/Game Data/215.html", logo:"./Versions/Assets/Pictures/Non-edited/215.webp"},
  {name:"That's Not My Neighbor", path:"./Versions/Assets/Game Data/216.html", logo:"./Versions/Assets/Pictures/Non-edited/216.webp"},
  {name:"Hotline Miami", path:"./Versions/Assets/Game Data/217-c.html", logo:"./Versions/Assets/Pictures/Non-edited/217.webp"},
  {name:"Papa's Bakeria", path:"./Versions/Assets/Game Data/218.html", logo:"./Versions/Assets/Pictures/Non-edited/218.webp"},
  {name:"Papa's Burgeria", path:"./Versions/Assets/Game Data/219.html", logo:"./Versions/Assets/Pictures/Non-edited/219.webp"},
  {name:"Papa's Cheeseria", path:"./Versions/Assets/Game Data/220.html", logo:"./Versions/Assets/Pictures/Non-edited/220.webp"},
  {name:"Papa's Cupcakeria", path:"./Versions/Assets/Game Data/221.html", logo:"./Versions/Assets/Pictures/Non-edited/221.webp"},
  {name:"Papa's Donuteria", path:"./Versions/Assets/Game Data/222.html", logo:"./Versions/Assets/Pictures/Non-edited/222.webp"},
  {name:"Papa's Freezeria", path:"./Versions/Assets/Game Data/223.html", logo:"./Versions/Assets/Pictures/Non-edited/223.webp"},
  {name:"Papa's Hot Doggeria", path:"./Versions/Assets/Game Data/224.html", logo:"./Versions/Assets/Pictures/Non-edited/224.webp"},
  {name:"Papa's Pancakeria", path:"./Versions/Assets/Game Data/225.html", logo:"./Versions/Assets/Pictures/Non-edited/225.webp"},
  {name:"Papa's Pastaria", path:"./Versions/Assets/Game Data/226.html", logo:"./Versions/Assets/Pictures/Non-edited/226.webp"},
  {name:"Papa's Pizeria", path:"./Versions/Assets/Game Data/227.html", logo:"./Versions/Assets/Pictures/Non-edited/227.webp"},
  {name:"Papa's Scooperia", path:"./Versions/Assets/Game Data/228.html", logo:"./Versions/Assets/Pictures/Non-edited/228.webp"},
  {name:"Papa's Sushiria", path:"./Versions/Assets/Game Data/229.html", logo:"./Versions/Assets/Pictures/Non-edited/229.webp"},
  {name:"Papa's Taco Mia", path:"./Versions/Assets/Game Data/230.html", logo:"./Versions/Assets/Pictures/Non-edited/230.webp"},
  {name:"Papa's Wingeria", path:"./Versions/Assets/Game Data/231.html", logo:"./Versions/Assets/Pictures/Non-edited/231.webp"},
  {name:"Superhot", path:"./Versions/Assets/Game Data/233.html", logo:"./Versions/Assets/Pictures/Non-edited/233.webp"},
  {name:"Duck Life", path:"./Versions/Assets/Game Data/234.html", logo:"./Versions/Assets/Pictures/Non-edited/234.webp"},
  {name:"Duck Life 2", path:"./Versions/Assets/Game Data/235.html", logo:"./Versions/Assets/Pictures/Non-edited/235.webp"},
  {name:"Duck Life 3", path:"./Versions/Assets/Game Data/236.html", logo:"./Versions/Assets/Pictures/Non-edited/236.webp"},
  {name:"Duck Life 5", path:"./Versions/Assets/Game Data/238.html", logo:"./Versions/Assets/Pictures/Non-edited/238.webp"},
  {name:"Red Ball 3", path:"./Versions/Assets/Game Data/241.html", logo:"./Versions/Assets/Pictures/Non-edited/241.webp"},
  {name:"Wheely", path:"./Versions/Assets/Game Data/245.html", logo:"./Versions/Assets/Pictures/Non-edited/245.webp"},
  {name:"Wheely 2", path:"./Versions/Assets/Game Data/246.html", logo:"./Versions/Assets/Pictures/Non-edited/246.webp"},
  {name:"Wheely 3", path:"./Versions/Assets/Game Data/247.html", logo:"./Versions/Assets/Pictures/Non-edited/247.webp"},
  {name:"Wheely 4", path:"./Versions/Assets/Game Data/248.html", logo:"./Versions/Assets/Pictures/Non-edited/248.webp"},
  {name:"Wheely 5", path:"./Versions/Assets/Game Data/249.html", logo:"./Versions/Assets/Pictures/Non-edited/249.webp"},
  {name:"Wheely 6", path:"./Versions/Assets/Game Data/250.html", logo:"./Versions/Assets/Pictures/Non-edited/250.webp"},
  {name:"Wheely 7", path:"./Versions/Assets/Game Data/251.html", logo:"./Versions/Assets/Pictures/Non-edited/251.webp"},
  {name:"Wheely 8", path:"./Versions/Assets/Game Data/252.html", logo:"./Versions/Assets/Pictures/Non-edited/252.webp"},
  {name:"Crazy Kitty 3D", path:"./Versions/Assets/Game Data/256.html", logo:"./Versions/Assets/Pictures/Non-edited/256.webp"},
  {name:"Google Baseball", path:"./Versions/Assets/Game Data/257.html", logo:"./Versions/Assets/Pictures/Non-edited/257.webp"},
  {name:"A Bite at Freddy's", path:"./Versions/Assets/Game Data/258.html", logo:"./Versions/Assets/Pictures/Non-edited/258.webp"},
  {name:"Class of '09", path:"./Versions/Assets/Game Data/259.html", logo:"./Versions/Assets/Pictures/Non-edited/259.webp"},
  {name:"RE:RUN", path:"./Versions/Assets/Game Data/260.html", logo:"./Versions/Assets/Pictures/Non-edited/260.webp"},
  {name:"Half Life", path:"./Versions/Assets/Game Data/262.html", logo:"./Versions/Assets/Pictures/Non-edited/262.webp"},
  {name:"Escape Road", path:"./Versions/Assets/Game Data/264.html", logo:"./Versions/Assets/Pictures/Non-edited/264.webp"},
  {name:"Escape Road 2", path:"./Versions/Assets/Game Data/265-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/265.webp"},
  {name:"Pizza Tower", path:"./Versions/Assets/Game Data/267.html", logo:"./Versions/Assets/Pictures/Non-edited/267.webp"},
  {name:"Bacon May Die", path:"./Versions/Assets/Game Data/268.html", logo:"./Versions/Assets/Pictures/Non-edited/268.webp"},
  {name:"Bad Ice Cream 2", path:"./Versions/Assets/Game Data/270.html", logo:"./Versions/Assets/Pictures/Non-edited/270.webp"},
  {name:"Bad Ice Cream 3", path:"./Versions/Assets/Game Data/271.html", logo:"./Versions/Assets/Pictures/Non-edited/271.webp"},
  {name:"BlockPost", path:"./Versions/Assets/Game Data/273.html", logo:"./Versions/Assets/Pictures/Non-edited/273.webp"},
  {name:"CircloO", path:"./Versions/Assets/Game Data/274.html", logo:"./Versions/Assets/Pictures/Non-edited/274.webp"},
  {name:"CircloO 2", path:"./Versions/Assets/Game Data/275.html", logo:"./Versions/Assets/Pictures/Non-edited/275.webp"},
  {name:"Evil Glitch", path:"./Versions/Assets/Game Data/277.html", logo:"./Versions/Assets/Pictures/Non-edited/277.webp"},
  {name:"Madalin Stunt Cars 2", path:"./Versions/Assets/Game Data/278.html", logo:"./Versions/Assets/Pictures/Non-edited/278.webp"},
  {name:"Madalin Stunt Cars 3", path:"./Versions/Assets/Game Data/279.html", logo:"./Versions/Assets/Pictures/Non-edited/279.webp"},
  {name:"Papery Planes", path:"./Versions/Assets/Game Data/280.html", logo:"./Versions/Assets/Pictures/Non-edited/280.webp"},
  {name:"Pixel Gun Survival", path:"./Versions/Assets/Game Data/281.html", logo:"./Versions/Assets/Pictures/Non-edited/281.webp"},
  {name:"Protektor", path:"./Versions/Assets/Game Data/282.html", logo:"./Versions/Assets/Pictures/Non-edited/282.webp"},
  {name:"War The Knights", path:"./Versions/Assets/Game Data/284.html", logo:"./Versions/Assets/Pictures/Non-edited/284.webp"},
  {name:"Endoparasitic", path:"./Versions/Assets/Game Data/286.html", logo:"./Versions/Assets/Pictures/Non-edited/286.webp"},
  {name:"Riddle Transfer", path:"./Versions/Assets/Game Data/292.html", logo:"./Versions/Assets/Pictures/Non-edited/292.webp"},
  {name:"Riddle Transfer 2", path:"./Versions/Assets/Game Data/293.html", logo:"./Versions/Assets/Pictures/Non-edited/293.webp"},
  {name:"Idle Dice", path:"./Versions/Assets/Game Data/294.html", logo:"./Versions/Assets/Pictures/Non-edited/294.webp"},
  {name:"Little Runmo", path:"./Versions/Assets/Game Data/302.html", logo:"./Versions/Assets/Pictures/Non-edited/302.webp"},
  {name:"Territorial.io", path:"./Versions/Assets/Game Data/303.html", logo:"./Versions/Assets/Pictures/Non-edited/303.webp", external:true},
  {name:"Alien Hominid", path:"./Versions/Assets/Game Data/304.html", logo:"./Versions/Assets/Pictures/Non-edited/304.webp"},
  {name:"Tanuki Sunset", path:"./Versions/Assets/Game Data/305.html", logo:"./Versions/Assets/Pictures/Non-edited/305.webp"},
  {name:"Shipo.io", path:"./Versions/Assets/Game Data/306.html", logo:"./Versions/Assets/Pictures/Non-edited/306.webp"},
  {name:"Sandboxels", path:"./Versions/Assets/Game Data/309.html", logo:"./Versions/Assets/Pictures/Non-edited/309.webp"},
  {name:"Dreadhead Parkour", path:"./Versions/Assets/Game Data/310.html", logo:"./Versions/Assets/Pictures/Non-edited/310.webp"},
  {name:"Sandtris", path:"./Versions/Assets/Game Data/311.html", logo:"./Versions/Assets/Pictures/Non-edited/311.webp"},
  {name:"BlackJack", path:"./Versions/Assets/Game Data/312.html", logo:"./Versions/Assets/Pictures/Non-edited/312.webp"},
  {name:"Minesweeper Mania", path:"./Versions/Assets/Game Data/313.html", logo:"./Versions/Assets/Pictures/Non-edited/313.webp"},
  {name:"Jelly Mario", path:"./Versions/Assets/Game Data/315.html", logo:"./Versions/Assets/Pictures/Non-edited/315.webp"},
  {name:"Angry Birds Chrome", path:"./Versions/Assets/Game Data/316.html", logo:"./Versions/Assets/Pictures/Non-edited/316.webp", external:true},
  {name:"sandspiel", path:"./Versions/Assets/Game Data/317.html", logo:"./Versions/Assets/Pictures/Non-edited/317.webp"},
  {name:"Side Effects", path:"./Versions/Assets/Game Data/318.html", logo:"./Versions/Assets/Pictures/Non-edited/318.webp", external:true},
  {name:"Build a Queen", path:"./Versions/Assets/Game Data/319.html", logo:"./Versions/Assets/Pictures/Non-edited/319.webp"},
  {name:"3D Bowling", path:"./Versions/Assets/Game Data/320.html", logo:"./Versions/Assets/Pictures/Non-edited/320.webp", external:true},
  {name:"Sushi Roll", path:"./Versions/Assets/Game Data/322.html", logo:"./Versions/Assets/Pictures/Non-edited/322.webp", external:true},
  {name:"Find the Alien", path:"./Versions/Assets/Game Data/323.html", logo:"./Versions/Assets/Pictures/Non-edited/323.webp", external:true},
  {name:"Kitchen Bazar", path:"./Versions/Assets/Game Data/325.html", logo:"./Versions/Assets/Pictures/Non-edited/325.webp"},
  {name:"Pokey Ball", path:"./Versions/Assets/Game Data/326.html", logo:"./Versions/Assets/Pictures/Non-edited/326.webp", external:true},
  {name:"Slime.io", path:"./Versions/Assets/Game Data/327.html", logo:"./Versions/Assets/Pictures/Non-edited/327.webp", external:true},
  {name:"Om Nom Run", path:"./Versions/Assets/Game Data/328.html", logo:"./Versions/Assets/Pictures/Non-edited/328.webp", external:true},
  {name:"TileTopia", path:"./Versions/Assets/Game Data/329a.html", logo:"./Versions/Assets/Pictures/Non-edited/329.webp"},
  {name:"BitPlanes", path:"./Versions/Assets/Game Data/330.html", logo:"./Versions/Assets/Pictures/Non-edited/330.webp"},
  {name:"Crazy Cars", path:"./Versions/Assets/Game Data/331.html", logo:"./Versions/Assets/Pictures/Non-edited/331.webp"},
  {name:"Fancy Pants Adventure 2", path:"./Versions/Assets/Game Data/334.html", logo:"./Versions/Assets/Pictures/Non-edited/334.webp"},
  {name:"Fancy Pants Adventure 4 Part 2", path:"./Versions/Assets/Game Data/337.html", logo:"./Versions/Assets/Pictures/Non-edited/337.webp"},
  {name:"Getaway Shootout", path:"./Versions/Assets/Game Data/338.html", logo:"./Versions/Assets/Pictures/Non-edited/338.webp"},
  {name:"Learn to Fly", path:"./Versions/Assets/Game Data/340.html", logo:"./Versions/Assets/Pictures/Non-edited/340.webp"},
  {name:"Learn to Fly 3", path:"./Versions/Assets/Game Data/342.html", logo:"./Versions/Assets/Pictures/Non-edited/342.webp"},
  {name:"Learn to Fly Idle", path:"./Versions/Assets/Game Data/343.html", logo:"./Versions/Assets/Pictures/Non-edited/343.webp"},
  {name:"Raft Wars", path:"./Versions/Assets/Game Data/Raft Wars.html", logo:"./Versions/Assets/Pictures/Non-edited/344.webp"},
  {name:"Raft Wars 2", path:"./Versions/Assets/Game Data/345.html", logo:"./Versions/Assets/Pictures/Non-edited/345.webp"},
  {name:"Sort the Court", path:"./Versions/Assets/Game Data/346.html", logo:"./Versions/Assets/Pictures/Non-edited/346.webp"},
  {name:"They Are Coming", path:"./Versions/Assets/Game Data/348.html", logo:"./Versions/Assets/Pictures/Non-edited/348.webp"},
  {name:"Spiral Roll", path:"./Versions/Assets/Game Data/349.html", logo:"./Versions/Assets/Pictures/Non-edited/349.webp"},
  {name:"Binding of Issac: Wrath of the Lamb", path:"./Versions/Assets/Game Data/350.html", logo:"./Versions/Assets/Pictures/Non-edited/350.webp"},
  {name:"DON'T YOU LECTURE ME", path:"./Versions/Assets/Game Data/352.html", logo:"./Versions/Assets/Pictures/Non-edited/352.webp"},
  {name:"Adventure Capatalist", path:"./Versions/Assets/Game Data/354-a.html", logo:"./Versions/Assets/Pictures/Non-edited/354.webp"},
  {name:"Dadish 2", path:"./Versions/Assets/Game Data/355.html", logo:"./Versions/Assets/Pictures/Non-edited/355.webp"},
  {name:"Dadish 3", path:"./Versions/Assets/Game Data/356.html", logo:"./Versions/Assets/Pictures/Non-edited/356.webp"},
  {name:"Dadish", path:"./Versions/Assets/Game Data/357.html", logo:"./Versions/Assets/Pictures/Non-edited/357.webp"},
  {name:"Dadish 3D", path:"./Versions/Assets/Game Data/358.html", logo:"./Versions/Assets/Pictures/Non-edited/358.webp"},
  {name:"Daily Dadish", path:"./Versions/Assets/Game Data/359.html", logo:"./Versions/Assets/Pictures/Non-edited/359.webp"},
  {name:"Google Feud", path:"./Versions/Assets/Game Data/361.html", logo:"./Versions/Assets/Pictures/Non-edited/361.webp"},
  {name:"Idle Breakout", path:"./Versions/Assets/Game Data/362.html", logo:"./Versions/Assets/Pictures/Non-edited/362.webp"},
  {name:"Idle Mining Empire", path:"./Versions/Assets/Game Data/364.html", logo:"./Versions/Assets/Pictures/Non-edited/364.webp"},
  {name:"JustFall.lol", path:"./Versions/Assets/Game Data/365.html", logo:"./Versions/Assets/Pictures/Non-edited/365.webp"},
  {name:"Slowroads", path:"./Versions/Assets/Game Data/369.html", logo:"./Versions/Assets/Pictures/Non-edited/369.webp"},
  {name:"Smash Karts", path:"./Versions/Assets/Game Data/370-f.html", logo:"./Versions/Assets/Pictures/Non-edited/370.webp"},
  {name:"Stickman Fight Ragdoll", path:"./Versions/Assets/Game Data/371e.html", logo:"./Versions/Assets/Pictures/Non-edited/371.webp"},
  {name:"Stickman Boost", path:"./Versions/Assets/Game Data/372.html", logo:"./Versions/Assets/Pictures/Non-edited/372.webp"},
  {name:"Stickman Climb", path:"./Versions/Assets/Game Data/373.html", logo:"./Versions/Assets/Pictures/Non-edited/373.webp"},
  {name:"Stickman Golf", path:"./Versions/Assets/Game Data/374e.html", logo:"./Versions/Assets/Pictures/Non-edited/374.webp"},
  {name:"Build a Big Army", path:"./Versions/Assets/Game Data/376.html", logo:"./Versions/Assets/Pictures/Non-edited/376.webp"},
  {name:"Build a Plane", path:"./Versions/Assets/Game Data/377.html", logo:"./Versions/Assets/Pictures/Non-edited/377.webp"},
  {name:"Camouflage and Sniper", path:"./Versions/Assets/Game Data/378.html", logo:"./Versions/Assets/Pictures/Non-edited/378.webp"},
  {name:"Car Survival 3D", path:"./Versions/Assets/Game Data/379.html", logo:"./Versions/Assets/Pictures/Non-edited/379.webp"},
  {name:"City Defense", path:"./Versions/Assets/Game Data/380.html", logo:"./Versions/Assets/Pictures/Non-edited/380.webp"},
  {name:"Clothing Shop 3D", path:"./Versions/Assets/Game Data/381.html", logo:"./Versions/Assets/Pictures/Non-edited/381.webp"},
  {name:"Cool Cars Run 3D", path:"./Versions/Assets/Game Data/382.html", logo:"./Versions/Assets/Pictures/Non-edited/382.webp"},
  {name:"Crush Cars 3D", path:"./Versions/Assets/Game Data/383.html", logo:"./Versions/Assets/Pictures/Non-edited/383.webp"},
  {name:"Destiny Run 3D", path:"./Versions/Assets/Game Data/384.html", logo:"./Versions/Assets/Pictures/Non-edited/384.webp"},
  {name:"Destroy The Car 3D", path:"./Versions/Assets/Game Data/385.html", logo:"./Versions/Assets/Pictures/Non-edited/385.webp"},
  {name:"Draw Joust", path:"./Versions/Assets/Game Data/387.html", logo:"./Versions/Assets/Pictures/Non-edited/387.webp"},
  {name:"Evolving Bombs 3D", path:"./Versions/Assets/Game Data/388.html", logo:"./Versions/Assets/Pictures/Non-edited/388.webp"},
  {name:"Fire and Frost Master", path:"./Versions/Assets/Game Data/389.html", logo:"./Versions/Assets/Pictures/Non-edited/389.webp", external:true},
  {name:"Fitness Empire", path:"./Versions/Assets/Game Data/390.html", logo:"./Versions/Assets/Pictures/Non-edited/390.webp"},
  {name:"Flick Goal", path:"./Versions/Assets/Game Data/391.html", logo:"./Versions/Assets/Pictures/Non-edited/391.webp"},
  {name:"Flip Master", path:"./Versions/Assets/Game Data/392.html", logo:"./Versions/Assets/Pictures/Non-edited/392.webp"},
  {name:"Giant Wanted", path:"./Versions/Assets/Game Data/393.html", logo:"./Versions/Assets/Pictures/Non-edited/393.webp"},
  {name:"Gun Clone", path:"./Versions/Assets/Game Data/394.html", logo:"./Versions/Assets/Pictures/Non-edited/394.webp"},
  {name:"Gun Runner", path:"./Versions/Assets/Game Data/395.html", logo:"./Versions/Assets/Pictures/Non-edited/395.webp"},
  {name:"Make a SuperBoat", path:"./Versions/Assets/Game Data/397.html", logo:"./Versions/Assets/Pictures/Non-edited/397.webp"},
  {name:"Makeover Run", path:"./Versions/Assets/Game Data/398.html", logo:"./Versions/Assets/Pictures/Non-edited/398.webp"},
  {name:"Mega Car Jumps", path:"./Versions/Assets/Game Data/399.html", logo:"./Versions/Assets/Pictures/Non-edited/399.webp"},
  {name:"Money Rush", path:"./Versions/Assets/Game Data/400.html", logo:"./Versions/Assets/Pictures/Non-edited/400.webp"},
  {name:"Office Fight", path:"./Versions/Assets/Game Data/402.html", logo:"./Versions/Assets/Pictures/Non-edited/402.webp"},
  {name:"Robot Invasion", path:"./Versions/Assets/Game Data/403.html", logo:"./Versions/Assets/Pictures/Non-edited/403.webp"},
  {name:"Shooting Master", path:"./Versions/Assets/Game Data/405.html", logo:"./Versions/Assets/Pictures/Non-edited/405.webp"},
  {name:"Supermarket 3D", path:"./Versions/Assets/Game Data/406.html", logo:"./Versions/Assets/Pictures/Non-edited/406.webp"},
  {name:"Survive to Victory", path:"./Versions/Assets/Game Data/407.html", logo:"./Versions/Assets/Pictures/Non-edited/407.webp"},
  {name:"Telekinesis Car", path:"./Versions/Assets/Game Data/409.html", logo:"./Versions/Assets/Pictures/Non-edited/409.webp"},
  {name:"Telekinesis Drive", path:"./Versions/Assets/Game Data/410.html", logo:"./Versions/Assets/Pictures/Non-edited/410.webp"},
  {name:"Telekinesis", path:"./Versions/Assets/Game Data/411.html", logo:"./Versions/Assets/Pictures/Non-edited/411.webp"},
  {name:"Tug of War with Cars", path:"./Versions/Assets/Game Data/413.html", logo:"./Versions/Assets/Pictures/Non-edited/413.webp"},
  {name:"Twerk Race 3D", path:"./Versions/Assets/Game Data/414.html", logo:"./Versions/Assets/Pictures/Non-edited/414.webp"},
  {name:"Wall Crawler", path:"./Versions/Assets/Game Data/416.html", logo:"./Versions/Assets/Pictures/Non-edited/416.webp"},
  {name:"Weapon Craft Run", path:"./Versions/Assets/Game Data/418.html", logo:"./Versions/Assets/Pictures/Non-edited/418.webp"},
  {name:"Weapon Upgrade Rush", path:"./Versions/Assets/Game Data/419.html", logo:"./Versions/Assets/Pictures/Non-edited/419.webp"},
  {name:"Weapon Scale", path:"./Versions/Assets/Game Data/420.html", logo:"./Versions/Assets/Pictures/Non-edited/420.webp", external:true},
  {name:"Rich Run 3D", path:"./Versions/Assets/Game Data/421.html", logo:"./Versions/Assets/Pictures/Non-edited/421.webp"},
  {name:"High Heels", path:"./Versions/Assets/Game Data/422.html", logo:"./Versions/Assets/Pictures/Non-edited/422.webp"},
  {name:"WebFishing", path:"./Versions/Assets/Game Data/423.html", logo:"./Versions/Assets/Pictures/Non-edited/423.webp"},
  {name:"Five Nights at Freddy's 4: Halloween", path:"./Versions/Assets/Game Data/428.html", logo:"./Versions/Assets/Pictures/Non-edited/428.webp"},
  {name:"10 Minutes Till Dawn", path:"./Versions/Assets/Game Data/430.html", logo:"./Versions/Assets/Pictures/Non-edited/430.webp"},
  {name:"99 Balls", path:"./Versions/Assets/Game Data/431.html", logo:"./Versions/Assets/Pictures/Non-edited/431.webp"},
  {name:"Abandoned", path:"./Versions/Assets/Game Data/432.html", logo:"./Versions/Assets/Pictures/Non-edited/432.webp"},
  {name:"A Small World Cup", path:"./Versions/Assets/Game Data/435.html", logo:"./Versions/Assets/Pictures/Non-edited/435.webp"},
  {name:"Awesome Tanks", path:"./Versions/Assets/Game Data/436.html", logo:"./Versions/Assets/Pictures/Non-edited/436.webp"},
  {name:"Bouncemasters", path:"./Versions/Assets/Game Data/437.html", logo:"./Versions/Assets/Pictures/Non-edited/437.webp"},
  {name:"Awesome Tanks 2", path:"./Versions/Assets/Game Data/438.html", logo:"./Versions/Assets/Pictures/Non-edited/438.webp"},
  {name:"Bank Robbery 2", path:"./Versions/Assets/Game Data/439.html", logo:"./Versions/Assets/Pictures/Non-edited/439.webp"},
  {name:"Celeste PICO", path:"./Versions/Assets/Game Data/440.html", logo:"./Versions/Assets/Pictures/Non-edited/440.webp"},
  {name:"Kitty Toy", path:"./Versions/Assets/Game Data/441.html", logo:"./Versions/Assets/Pictures/Non-edited/441.webp"},
  {name:"Infinimoes", path:"./Versions/Assets/Game Data/442.html", logo:"./Versions/Assets/Pictures/Non-edited/442.webp"},
  {name:"Adventure Drivers", path:"./Versions/Assets/Game Data/443.html", logo:"./Versions/Assets/Pictures/Non-edited/443.webp"},
  {name:"Ages of Conflict", path:"./Versions/Assets/Game Data/444.html", logo:"./Versions/Assets/Pictures/Non-edited/444.webp"},
  {name:"Aquapark.io", path:"./Versions/Assets/Game Data/448.html", logo:"./Versions/Assets/Pictures/Non-edited/448.webp", external:true},
  {name:"Slender: The 8 Pages", path:"./Versions/Assets/Game Data/451.html", logo:"./Versions/Assets/Pictures/Non-edited/451.webp"},
  {name:"Station 141", path:"./Versions/Assets/Game Data/452.html", logo:"./Versions/Assets/Pictures/Non-edited/452.webp"},
  {name:"BLOODMONEY!", path:"./Versions/Assets/Game Data/454.html", logo:"./Versions/Assets/Pictures/Non-edited/454.webp"},
  {name:"BERGENTRUCK 201x", path:"./Versions/Assets/Game Data/455.html", logo:"./Versions/Assets/Pictures/Non-edited/455.webp"},
  {name:"Undertale Yellow", path:"./Versions/Assets/Game Data/456.html", logo:"./Versions/Assets/Pictures/Non-edited/456.webp"},
  {name:"Raft", path:"./Versions/Assets/Game Data/457.html", logo:"./Versions/Assets/Pictures/Non-edited/457.webp"},
  {name:"The Deadseat", path:"./Versions/Assets/Game Data/458.html", logo:"./Versions/Assets/Pictures/Non-edited/458.webp"},
  {name:"Fears to Fathom: Home Alone", path:"./Versions/Assets/Game Data/460.html", logo:"./Versions/Assets/Pictures/Non-edited/460.webp"},
  {name:"DEAD PLATE", path:"./Versions/Assets/Game Data/462.html", logo:"./Versions/Assets/Pictures/Non-edited/462.webp"},
  {name:"Choppy Orc", path:"./Versions/Assets/Game Data/464.html", logo:"./Versions/Assets/Pictures/Non-edited/464.webp"},
  {name:"Cuphead", path:"./Versions/Assets/Game Data/465-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/465.webp"},
  {name:"Baldi's Basics Classic Remastered", path:"./Versions/Assets/Game Data/466.html", logo:"./Versions/Assets/Pictures/Non-edited/466.webp"},
  {name:"Baldi's Basics Plus", path:"./Versions/Assets/Game Data/467-updatee.html", logo:"./Versions/Assets/Pictures/Non-edited/467.webp"},
  {name:"Doodle Jump", path:"./Versions/Assets/Game Data/470.html", logo:"./Versions/Assets/Pictures/Non-edited/470.webp"},
  {name:"Madness Combat: Project Nexus (classic)", path:"./Versions/Assets/Game Data/471.html", logo:"./Versions/Assets/Pictures/Non-edited/471.webp"},
  {name:"Bad Time Simulator", path:"./Versions/Assets/Game Data/472.html", logo:"./Versions/Assets/Pictures/Non-edited/472.webp"},
  {name:"Spacebar Clicker", path:"./Versions/Assets/Game Data/473.html", logo:"./Versions/Assets/Pictures/Non-edited/473.webp"},
  {name:"Friday Night Funkin': V.S. Whitty", path:"./Versions/Assets/Game Data/474.html", logo:"./Versions/Assets/Pictures/Non-edited/474.webp"},
  {name:"Friday Night Funkin': B-Sides", path:"./Versions/Assets/Game Data/475.html", logo:"./Versions/Assets/Pictures/Non-edited/475.webp"},
  {name:"Friday Night Funkin': Vs. Hex", path:"./Versions/Assets/Game Data/476.html", logo:"./Versions/Assets/Pictures/Non-edited/476.webp"},
  {name:"Friday Night Funkin': Vs. Hatsune Miku", path:"./Versions/Assets/Game Data/477.html", logo:"./Versions/Assets/Pictures/Non-edited/477.webp"},
  {name:"Friday Night Funkin': Neo", path:"./Versions/Assets/Game Data/478.html", logo:"./Versions/Assets/Pictures/Non-edited/478.webp"},
  {name:"Friday Night Funkin': Sarvente's Mid-Fight Masses", path:"./Versions/Assets/Game Data/480.html", logo:"./Versions/Assets/Pictures/Non-edited/480.webp"},
  {name:"Friday Night Funkin': vs. Tricky", path:"./Versions/Assets/Game Data/481.html", logo:"./Versions/Assets/Pictures/Non-edited/481.webp"},
  {name:"Human Expenditure Program", path:"./Versions/Assets/Game Data/482-2.html", logo:"./Versions/Assets/Pictures/Non-edited/482.webp"},
  {name:"Friday Night Funkin': Hit Single Real", path:"./Versions/Assets/Game Data/483.html", logo:"./Versions/Assets/Pictures/Non-edited/483.webp"},
  {name:"Friday Night Funkin': Creepypasta JP", path:"./Versions/Assets/Game Data/484.html", logo:"./Versions/Assets/Pictures/Non-edited/484.webp"},
  {name:"Friday Night Funkin': vs. Garcello", path:"./Versions/Assets/Game Data/485.html", logo:"./Versions/Assets/Pictures/Non-edited/485.webp"},
  {name:"Friday Night Funkin': Sonic Legacy", path:"./Versions/Assets/Game Data/486.html", logo:"./Versions/Assets/Pictures/Non-edited/486.webp"},
  {name:"Friday Night Funkin': vs. QT", path:"./Versions/Assets/Game Data/487.html", logo:"./Versions/Assets/Pictures/Non-edited/487.webp"},
  {name:"Friday Night Funkin': Mistful Crimson Morning Reboot", path:"./Versions/Assets/Game Data/488.html", logo:"./Versions/Assets/Pictures/Non-edited/488.webp"},
  {name:"Friday Night Funkin': Indie Cross", path:"./Versions/Assets/Game Data/489.html", logo:"./Versions/Assets/Pictures/Non-edited/489.webp"},
  {name:"Rooftop Snipers 2", path:"./Versions/Assets/Game Data/490.html", logo:"./Versions/Assets/Pictures/Non-edited/490.webp"},
  {name:"RigBMX", path:"./Versions/Assets/Game Data/493.html", logo:"./Versions/Assets/Pictures/Non-edited/493.webp"},
  {name:"RigBMX 2", path:"./Versions/Assets/Game Data/494.html", logo:"./Versions/Assets/Pictures/Non-edited/494.webp"},
  {name:"groon groon, babey!", path:"./Versions/Assets/Game Data/495.html", logo:"./Versions/Assets/Pictures/Non-edited/495.webp"},
  {name:"Friday Night Funkin': Jeffy's Endless Aethos", path:"./Versions/Assets/Game Data/496.html", logo:"./Versions/Assets/Pictures/Non-edited/496.webp"},
  {name:"Friday Night Funkin': vs. BOPCITY", path:"./Versions/Assets/Game Data/497.html", logo:"./Versions/Assets/Pictures/Non-edited/497.webp"},
  {name:"Friday Night Funkin': 17 Bucks: Floor 1", path:"./Versions/Assets/Game Data/498.html", logo:"./Versions/Assets/Pictures/Non-edited/498.webp"},
  {name:"Friday Night Funkin': FIRE IN THE HOLE: Lobotomy Dash Funkin'", path:"./Versions/Assets/Game Data/499.html", logo:"./Versions/Assets/Pictures/Non-edited/499.webp"},
  {name:"Friday Night Funkin': TWIDDLEFINGER", path:"./Versions/Assets/Game Data/500.html", logo:"./Versions/Assets/Pictures/Non-edited/500.webp"},
  {name:"Stick With It", path:"./Versions/Assets/Game Data/502-fixed.html", logo:"./Versions/Assets/Pictures/Non-edited/502.webp", external:true},
  {name:"Five Nights at Candy's", path:"./Versions/Assets/Game Data/503.html", logo:"./Versions/Assets/Pictures/Non-edited/503.webp"},
  {name:"Five Nights at Candy's 2", path:"./Versions/Assets/Game Data/504.html", logo:"./Versions/Assets/Pictures/Non-edited/504.webp"},
  {name:"Pokemon Red", path:"./Versions/Assets/Game Data/505.html", logo:"./Versions/Assets/Pictures/Non-edited/505.webp"},
  {name:"Pokemon Emerald", path:"./Versions/Assets/Game Data/506.html", logo:"./Versions/Assets/Pictures/Non-edited/506.webp"},
  {name:"Super Mario Bros", path:"./Versions/Assets/Game Data/508.html", logo:"./Versions/Assets/Pictures/Non-edited/508.webp"},
  {name:"Friday Night Funkin’ Soft", path:"./Versions/Assets/Game Data/509.html", logo:"./Versions/Assets/Pictures/Non-edited/509.webp"},
  {name:"Tomodachi Collection", path:"./Versions/Assets/Game Data/510.html", logo:"./Versions/Assets/Pictures/Non-edited/510.webp"},
  {name:"Doge Miner", path:"./Versions/Assets/Game Data/511.html", logo:"./Versions/Assets/Pictures/Non-edited/511.webp"},
  {name:"Final Earth 2", path:"./Versions/Assets/Game Data/512.html", logo:"./Versions/Assets/Pictures/Non-edited/512.webp"},
  {name:"Swordfight!!", path:"./Versions/Assets/Game Data/513.html", logo:"./Versions/Assets/Pictures/Non-edited/513.webp"},
  {name:"PortaBoy+", path:"./Versions/Assets/Game Data/514.html", logo:"./Versions/Assets/Pictures/Non-edited/514.webp"},
  {name:"Oshi Oshi Punch!", path:"./Versions/Assets/Game Data/516.html", logo:"./Versions/Assets/Pictures/Non-edited/516.webp"},
  {name:"Nubby's Number Factory", path:"./Versions/Assets/Game Data/517.html", logo:"./Versions/Assets/Pictures/Non-edited/517.webp"},
  {name:"Touhou: Luminous Strike", path:"./Versions/Assets/Game Data/518.html", logo:"./Versions/Assets/Pictures/Non-edited/518.webp"},
  {name:"Bust a Loop", path:"./Versions/Assets/Game Data/521.html", logo:"./Versions/Assets/Pictures/Non-edited/521.webp"},
  {name:"Bad Monday Simulator", path:"./Versions/Assets/Game Data/522.html", logo:"./Versions/Assets/Pictures/Non-edited/522.webp"},
  {name:"Touhou Mother", path:"./Versions/Assets/Game Data/523-f.html", logo:"./Versions/Assets/Pictures/Non-edited/523.webp"},
  {name:"Friday Night Funkin': Darkness Takeover", path:"./Versions/Assets/Game Data/525.html", logo:"./Versions/Assets/Pictures/Non-edited/525.webp"},
  {name:"SpongeBob SquarePants: Land Ho!", path:"./Versions/Assets/Game Data/526.html", logo:"./Versions/Assets/Pictures/Non-edited/526.webp", external:true},
  {name:"SpongeBob SquarePants: Sandy's Sponge Stacker", path:"./Versions/Assets/Game Data/529.html", logo:"./Versions/Assets/Pictures/Non-edited/529.webp", external:true},
  {name:"SpongeBob SquarePants: WereSquirrel", path:"./Versions/Assets/Game Data/532.html", logo:"./Versions/Assets/Pictures/Non-edited/532.webp"},
  {name:"Teen Titans GO!: Jump Jousts", path:"./Versions/Assets/Game Data/534.html", logo:"./Versions/Assets/Pictures/Non-edited/534.webp"},
  {name:"Chiikawa Puzzle", path:"./Versions/Assets/Game Data/539.html", logo:"./Versions/Assets/Pictures/Non-edited/539.webp"},
  {name:"myTeardrop", path:"./Versions/Assets/Game Data/540.html", logo:"./Versions/Assets/Pictures/Non-edited/540.webp", external:true},
  {name:"Friday Night Funkin': Pibby: Apocalypse", path:"./Versions/Assets/Game Data/541.html", logo:"./Versions/Assets/Pictures/Non-edited/541.webp"},
  {name:"Karlson", path:"./Versions/Assets/Game Data/542-a.html", logo:"./Versions/Assets/Pictures/Non-edited/542.webp"},
  {name:"Jelly Drift", path:"./Versions/Assets/Game Data/543-a.html", logo:"./Versions/Assets/Pictures/Non-edited/543.webp"},
  {name:"Plinko", path:"./Versions/Assets/Game Data/544.html", logo:"./Versions/Assets/Pictures/Non-edited/544.webp"},
  {name:"Clash Of Vikings", path:"./Versions/Assets/Game Data/545.html", logo:"./Versions/Assets/Pictures/Non-edited/545.webp"},
  {name:"Recoil", path:"./Versions/Assets/Game Data/546.html", logo:"./Versions/Assets/Pictures/Non-edited/546.webp"},
  {name:"Sonic the Hedgehog 2: Community's Cut", path:"./Versions/Assets/Game Data/549.html", logo:"./Versions/Assets/Pictures/Non-edited/549.webp"},
  {name:"Sonic the Hedgehog 3: Angel Island Remastered", path:"./Versions/Assets/Game Data/550.html", logo:"./Versions/Assets/Pictures/Non-edited/550.webp", external:true},
  {name:"Aviamasters", path:"./Versions/Assets/Game Data/552.html", logo:"./Versions/Assets/Pictures/Non-edited/552.webp"},
  {name:"Friday Night Funkin VS. KAPI", path:"./Versions/Assets/Game Data/555.html", logo:"./Versions/Assets/Pictures/Non-edited/555.webp"},
  {name:"Friday Night Funkin VS. Sky", path:"./Versions/Assets/Game Data/556.html", logo:"./Versions/Assets/Pictures/Non-edited/556.webp"},
  {name:"Getting Over It with Bennett Foddy", path:"./Versions/Assets/Game Data/557.html", logo:"./Versions/Assets/Pictures/Non-edited/557.webp"},
  {name:"Friday Night Funkin Vs. Cyber Sensation", path:"./Versions/Assets/Game Data/558.html", logo:"./Versions/Assets/Pictures/Non-edited/558.webp"},
  {name:"Friday Night Funkin vs Shaggy", path:"./Versions/Assets/Game Data/559.html", logo:"./Versions/Assets/Pictures/Non-edited/559.webp"},
  {name:"Deltatraveler", path:"./Versions/Assets/Game Data/560.html", logo:"./Versions/Assets/Pictures/Non-edited/560.webp"},
  {name:"Boom Slingers: Reboom", path:"./Versions/Assets/Game Data/562.html", logo:"./Versions/Assets/Pictures/Non-edited/562.webp"},
  {name:"Count Masters: Stickman Games", path:"./Versions/Assets/Game Data/564.html", logo:"./Versions/Assets/Pictures/Non-edited/564.webp"},
  {name:"Dalgona Candy Honeycomb Cookie", path:"./Versions/Assets/Game Data/565.html", logo:"./Versions/Assets/Pictures/Non-edited/565.webp"},
  {name:"Highway Racer", path:"./Versions/Assets/Game Data/567.html", logo:"./Versions/Assets/Pictures/Non-edited/567.webp"},
  {name:"Highway Racer 2 REMASTERED", path:"./Versions/Assets/Game Data/568.html", logo:"./Versions/Assets/Pictures/Non-edited/568.webp"},
  {name:"Hula Hoop Race", path:"./Versions/Assets/Game Data/569.html", logo:"./Versions/Assets/Pictures/Non-edited/569.webp"},
  {name:"Jelly Restaurant", path:"./Versions/Assets/Game Data/570.html", logo:"./Versions/Assets/Pictures/Non-edited/570.webp"},
  {name:"Layers Roll", path:"./Versions/Assets/Game Data/571.html", logo:"./Versions/Assets/Pictures/Non-edited/571.webp", external:true},
  {name:"Lazy Jumper", path:"./Versions/Assets/Game Data/572.html", logo:"./Versions/Assets/Pictures/Non-edited/572.webp"},
  {name:"Man Runner 2048", path:"./Versions/Assets/Game Data/573.html", logo:"./Versions/Assets/Pictures/Non-edited/573.webp", external:true},
  {name:"Pottery Master", path:"./Versions/Assets/Game Data/574.html", logo:"./Versions/Assets/Pictures/Non-edited/574.webp", external:true},
  {name:"Sky Riders", path:"./Versions/Assets/Game Data/576.html", logo:"./Versions/Assets/Pictures/Non-edited/576.webp"},
  {name:"Super Star Car", path:"./Versions/Assets/Game Data/579.html", logo:"./Versions/Assets/Pictures/Non-edited/579.webp"},
  {name:"BuildNow.gg", path:"./Versions/Assets/Game Data/581.html", logo:"./Versions/Assets/Pictures/Non-edited/581.webp"},
  {name:"Friday Night Funkin': Mario's Madness", path:"./Versions/Assets/Game Data/582.html", logo:"./Versions/Assets/Pictures/Non-edited/582.webp"},
  {name:"Friday Night Funkin' vs Hypno Lullaby", path:"./Versions/Assets/Game Data/583.html", logo:"./Versions/Assets/Pictures/Non-edited/583.webp"},
  {name:"Fallout", path:"./Versions/Assets/Game Data/585.html", logo:"./Versions/Assets/Pictures/Non-edited/585.webp"},
  {name:"The Oregon Trail", path:"./Versions/Assets/Game Data/586.html", logo:"./Versions/Assets/Pictures/Non-edited/586.webp"},
  {name:"Newgrounds Rumble", path:"./Versions/Assets/Game Data/587.html", logo:"./Versions/Assets/Pictures/Non-edited/587.webp"},
  {name:"Super Mario 64", path:"./Versions/Assets/Game Data/588.html", logo:"./Versions/Assets/Pictures/Non-edited/588.webp"},
  {name:"Sonic CD", path:"./Versions/Assets/Game Data/589-f.html", logo:"./Versions/Assets/Pictures/Non-edited/589.webp"},
  {name:"Sonic Mania", path:"./Versions/Assets/Game Data/590-f.html", logo:"./Versions/Assets/Pictures/Non-edited/590.webp", external:true},
  {name:"Slime Rancher", path:"./Versions/Assets/Game Data/591-awe.html", logo:"./Versions/Assets/Pictures/Non-edited/591.webp"},
  {name:"Pac Man World", path:"./Versions/Assets/Game Data/592.html", logo:"./Versions/Assets/Pictures/Non-edited/592.webp"},
  {name:"Pac Man World 2", path:"./Versions/Assets/Game Data/593-f.html", logo:"./Versions/Assets/Pictures/Non-edited/593.webp"},
  {name:"Waterworks!", path:"./Versions/Assets/Game Data/594.html", logo:"./Versions/Assets/Pictures/Non-edited/594.webp"},
  {name:"Shapez.io", path:"./Versions/Assets/Game Data/595.html", logo:"./Versions/Assets/Pictures/Non-edited/595.webp"},
  {name:"Plants vs. Zombies 2 Gardenless", path:"./Versions/Assets/Game Data/597-a.html", logo:"./Versions/Assets/Pictures/Non-edited/597.webp"},
  {name:"Sonic.EXE", path:"./Versions/Assets/Game Data/598.html", logo:"./Versions/Assets/Pictures/Non-edited/598.webp"},
  {name:"FNF Vs. Hypno's Lullaby v2", path:"./Versions/Assets/Game Data/600.html", logo:"./Versions/Assets/Pictures/Non-edited/600.webp"},
  {name:"FNF Vs. Sonic.EXE 3.0/4.0", path:"./Versions/Assets/Game Data/601.html", logo:"./Versions/Assets/Pictures/Non-edited/601.webp"},
  {name:"Doom 2", path:"./Versions/Assets/Game Data/602.html", logo:"./Versions/Assets/Pictures/Non-edited/602.webp"},
  {name:"Growden.io", path:"./Versions/Assets/Game Data/603-aa.html", logo:"./Versions/Assets/Pictures/Non-edited/603.webp"},
  {name:"Minesweeper Plus", path:"./Versions/Assets/Game Data/604-a.html", logo:"./Versions/Assets/Pictures/Non-edited/604.webp"},
  {name:"Sonic.EXE (ORIGINAL)", path:"./Versions/Assets/Game Data/606-e.html", logo:"./Versions/Assets/Pictures/Non-edited/606.webp"},
  {name:"Tattletail", path:"./Versions/Assets/Game Data/607-e.html", logo:"./Versions/Assets/Pictures/Non-edited/607.webp"},
  {name:"Friday Night Funkin VS Impostor v4", path:"./Versions/Assets/Game Data/608.html", logo:"./Versions/Assets/Pictures/Non-edited/608.webp"},
  {name:"Friday Night Funkin vs Sunday Remastered HD", path:"./Versions/Assets/Game Data/609-a.html", logo:"./Versions/Assets/Pictures/Non-edited/609.webp"},
  {name:"Friday Night Funkin vs Carol V2", path:"./Versions/Assets/Game Data/610.html", logo:"./Versions/Assets/Pictures/Non-edited/610.webp"},
  {name:"The Legend of Zelda Ocarina of Time", path:"./Versions/Assets/Game Data/611.html", logo:"./Versions/Assets/Pictures/Non-edited/611.webp"},
  {name:"The Legend of Zelda Majora's Mask", path:"./Versions/Assets/Game Data/612.html", logo:"./Versions/Assets/Pictures/Non-edited/612.webp"},
  {name:"Friday Night Funkin' Drop and Roll, but Playable", path:"./Versions/Assets/Game Data/613.html", logo:"./Versions/Assets/Pictures/Non-edited/613.webp"},
  {name:"Toy Rider", path:"./Versions/Assets/Game Data/614.html", logo:"./Versions/Assets/Pictures/Non-edited/614.webp", external:true},
  {name:"Friday Night Funkin Vs. Dave and Bambi v3", path:"./Versions/Assets/Game Data/615-a.html", logo:"./Versions/Assets/Pictures/Non-edited/615.webp"},
  {name:"Friday Night Funkin’ Wednesday's Infidelity", path:"./Versions/Assets/Game Data/616.html", logo:"./Versions/Assets/Pictures/Non-edited/616.webp"},
  {name:"FNF vs Bob v2.0 (Bob’s Onslaught)", path:"./Versions/Assets/Game Data/618.html", logo:"./Versions/Assets/Pictures/Non-edited/618.webp"},
  {name:"Friday Night Funkin': Rev-Mixed", path:"./Versions/Assets/Game Data/619.html", logo:"./Versions/Assets/Pictures/Non-edited/619.webp"},
  {name:"Three Goblets", path:"./Versions/Assets/Game Data/620.html", logo:"./Versions/Assets/Pictures/Non-edited/620.webp"},
  {name:"Friday Night Funkin': Gumballs", path:"./Versions/Assets/Game Data/621.html", logo:"./Versions/Assets/Pictures/Non-edited/621.webp"},
  {name:"Oneshot (LEGACY)", path:"./Versions/Assets/Game Data/622.html", logo:"./Versions/Assets/Pictures/Non-edited/622.webp"},
  {name:"Celeste", path:"./Versions/Assets/Game Data/623-work.html", logo:"./Versions/Assets/Pictures/Non-edited/623.webp"},
  {name:"Happy Wheels", path:"./Versions/Assets/Game Data/624.html", logo:"./Versions/Assets/Pictures/Non-edited/624.webp"},
  {name:"Get Yoked", path:"./Versions/Assets/Game Data/625.html", logo:"./Versions/Assets/Pictures/Non-edited/625.webp"},
  {name:"Tag", path:"./Versions/Assets/Game Data/627.html", logo:"./Versions/Assets/Pictures/Non-edited/627.webp"},
  {name:"Off", path:"./Versions/Assets/Game Data/629.html", logo:"./Versions/Assets/Pictures/Non-edited/629.webp"},
  {name:"Space Funeral", path:"./Versions/Assets/Game Data/630.html", logo:"./Versions/Assets/Pictures/Non-edited/630.webp"},
  {name:"Endroll", path:"./Versions/Assets/Game Data/631-a.html", logo:"./Versions/Assets/Pictures/Non-edited/631.webp"},
  {name:"Cave Story", path:"./Versions/Assets/Game Data/632-a.html", logo:"./Versions/Assets/Pictures/Non-edited/632.webp"},
  {name:"Friday Night Funkin': VS. Impostor: Alternated", path:"./Versions/Assets/Game Data/633.html", logo:"./Versions/Assets/Pictures/Non-edited/633.webp"},
  {name:"Friday Night Funkin': Chaos Nightmare - Sonic Vs. Fleetway", path:"./Versions/Assets/Game Data/634.html", logo:"./Versions/Assets/Pictures/Non-edited/634.webp"},
  {name:"Friday Night Funkin' D-Sides", path:"./Versions/Assets/Game Data/636.html", logo:"./Versions/Assets/Pictures/Non-edited/636.webp"},
  {name:"BFDIA 5b: 5*30", path:"./Versions/Assets/Game Data/638-f.html", logo:"./Versions/Assets/Pictures/Non-edited/638.gif"},
  {name:"Friday Night Funkin' VS Impostor B-Sides", path:"./Versions/Assets/Game Data/639.html", logo:"./Versions/Assets/Pictures/Non-edited/639.webp"},
  {name:"Mutilate a Doll 2", path:"./Versions/Assets/Game Data/640.html", logo:"./Versions/Assets/Pictures/Non-edited/640.webp"},
  {name:"Godzilla Daikaiju Battle Royale", path:"./Versions/Assets/Game Data/641.html", logo:"./Versions/Assets/Pictures/Non-edited/641.webp"},
  {name:"Friday Night Funkin' Sunday Night Suicide: Rookies Edition", path:"./Versions/Assets/Game Data/642.html", logo:"./Versions/Assets/Pictures/Non-edited/642.webp"},
  {name:"Friday Night Funkin vs Nonsense", path:"./Versions/Assets/Game Data/644.html", logo:"./Versions/Assets/Pictures/Non-edited/644.webp"},
  {name:"Super Smash Flash", path:"./Versions/Assets/Game Data/647.html", logo:"./Versions/Assets/Pictures/Non-edited/647.webp"},
  {name:"Mindwave", path:"./Versions/Assets/Game Data/648-el.html", logo:"./Versions/Assets/Pictures/Non-edited/648.webp"},
  {name:"Look Outside", path:"./Versions/Assets/Game Data/649.html", logo:"./Versions/Assets/Pictures/Non-edited/649.webp"},
  {name:"1 Date Danger", path:"./Versions/Assets/Game Data/653-f.html", logo:"./Versions/Assets/Pictures/Non-edited/653.webp"},
  {name:"Rogue Sergeant The Final Operation", path:"./Versions/Assets/Game Data/656.html", logo:"./Versions/Assets/Pictures/Non-edited/656.webp"},
  {name:"Friday Night Funkin vs Undertale", path:"./Versions/Assets/Game Data/657.html", logo:"./Versions/Assets/Pictures/Non-edited/657.webp"},
  {name:"Midnight Shift", path:"./Versions/Assets/Game Data/658.html", logo:"./Versions/Assets/Pictures/Non-edited/658.webp"},
  {name:"Orange Roulette", path:"./Versions/Assets/Game Data/659.html", logo:"./Versions/Assets/Pictures/Non-edited/659.webp"},
  {name:"Please Dont Touch Anything", path:"./Versions/Assets/Game Data/660.html", logo:"./Versions/Assets/Pictures/Non-edited/660.webp"},
  {name:"Tall.io", path:"./Versions/Assets/Game Data/664.html", logo:"./Versions/Assets/Pictures/Non-edited/664.webp", external:true},
  {name:"Match Triple 3D", path:"./Versions/Assets/Game Data/665.html", logo:"./Versions/Assets/Pictures/Non-edited/665.webp"},
  {name:"In Stars and Time", path:"./Versions/Assets/Game Data/667-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/667.webp"},
  {name:"Gorilla Tag", path:"./Versions/Assets/Game Data/668-fix2.html", logo:"./Versions/Assets/Pictures/Non-edited/668.webp"},
  {name:"Terraria", path:"./Versions/Assets/Game Data/669.html", logo:"./Versions/Assets/Pictures/Non-edited/669.webp", external:true},
  {name:"Raldi's Crackhouse", path:"./Versions/Assets/Game Data/670.html", logo:"./Versions/Assets/Pictures/Non-edited/670.webp"},
  {name:"We Become What We Behold", path:"./Versions/Assets/Game Data/671.html", logo:"./Versions/Assets/Pictures/Non-edited/671.webp"},
  {name:"A Difficult Game About Climbing", path:"./Versions/Assets/Game Data/672-2.html", logo:"./Versions/Assets/Pictures/Non-edited/672.webp"},
  {name:"Hobo 1", path:"./Versions/Assets/Game Data/673.html", logo:"./Versions/Assets/Pictures/Non-edited/673.webp"},
  {name:"Hobo 2", path:"./Versions/Assets/Game Data/674.html", logo:"./Versions/Assets/Pictures/Non-edited/674.webp"},
  {name:"Hobo 3", path:"./Versions/Assets/Game Data/675.html", logo:"./Versions/Assets/Pictures/Non-edited/675.webp"},
  {name:"Hobo 4", path:"./Versions/Assets/Game Data/676.html", logo:"./Versions/Assets/Pictures/Non-edited/676.webp"},
  {name:"Hobo 5", path:"./Versions/Assets/Game Data/677.html", logo:"./Versions/Assets/Pictures/Non-edited/677.webp"},
  {name:"Hobo 6", path:"./Versions/Assets/Game Data/678.html", logo:"./Versions/Assets/Pictures/Non-edited/678.webp"},
  {name:"Hobo 7", path:"./Versions/Assets/Game Data/679.html", logo:"./Versions/Assets/Pictures/Non-edited/679.webp"},
  {name:"Kirby Super Star Ultra", path:"./Versions/Assets/Game Data/680.html", logo:"./Versions/Assets/Pictures/Non-edited/680.webp"},
  {name:"Cooking Mama", path:"./Versions/Assets/Game Data/681.html", logo:"./Versions/Assets/Pictures/Non-edited/681.webp"},
  {name:"Cooking Mama 2", path:"./Versions/Assets/Game Data/682.html", logo:"./Versions/Assets/Pictures/Non-edited/682.webp"},
  {name:"Cooking Mama 3", path:"./Versions/Assets/Game Data/683.html", logo:"./Versions/Assets/Pictures/Non-edited/683.webp"},
  {name:"Kirby Squeak Squad", path:"./Versions/Assets/Game Data/684.html", logo:"./Versions/Assets/Pictures/Non-edited/684.webp"},
  {name:"FIFA 11", path:"./Versions/Assets/Game Data/685.html", logo:"./Versions/Assets/Pictures/Non-edited/685.webp"},
  {name:"FIFA 10", path:"./Versions/Assets/Game Data/686.html", logo:"./Versions/Assets/Pictures/Non-edited/686.webp"},
  {name:"Peggle", path:"./Versions/Assets/Game Data/688.html", logo:"./Versions/Assets/Pictures/Non-edited/688.webp"},
  {name:"Meatboy", path:"./Versions/Assets/Game Data/689.html", logo:"./Versions/Assets/Pictures/Non-edited/689.webp"},
  {name:"Friday Night Funkin': AKAGE", path:"./Versions/Assets/Game Data/690.html", logo:"./Versions/Assets/Pictures/Non-edited/690.webp"},
  {name:"Friday Night Funkin': Heartbreak Havoc [Vs. Sky: REDUX]", path:"./Versions/Assets/Game Data/691.html", logo:"./Versions/Assets/Pictures/Non-edited/691.webp"},
  {name:"Kirby ~ Soft & Wet", path:"./Versions/Assets/Game Data/692.html", logo:"./Versions/Assets/Pictures/Non-edited/692.webp"},
  {name:"Half Life: Opposing Force", path:"./Versions/Assets/Game Data/693.html", logo:"./Versions/Assets/Pictures/Non-edited/693.webp", external:true},
  {name:"Pokemon Firered", path:"./Versions/Assets/Game Data/694.html", logo:"./Versions/Assets/Pictures/Non-edited/694.webp"},
  {name:"Duck Life 8", path:"./Versions/Assets/Game Data/695.html", logo:"./Versions/Assets/Pictures/Non-edited/695.webp"},
  {name:"Pokemon HeartGold", path:"./Versions/Assets/Game Data/696.html", logo:"./Versions/Assets/Pictures/Non-edited/696.webp"},
  {name:"Bank Robbery", path:"./Versions/Assets/Game Data/697.html", logo:"./Versions/Assets/Pictures/Non-edited/697.webp"},
  {name:"Bank Robbery 3", path:"./Versions/Assets/Game Data/698.html", logo:"./Versions/Assets/Pictures/Non-edited/698.webp"},
  {name:"FNF vs Pibby Corrupted", path:"./Versions/Assets/Game Data/700.html", logo:"./Versions/Assets/Pictures/Non-edited/700.webp"},
  {name:"Real Flight Simulator", path:"./Versions/Assets/Game Data/701.html", logo:"./Versions/Assets/Pictures/Non-edited/701.webp"},
  {name:"VS Rewrite: ROUND 2", path:"./Versions/Assets/Game Data/703.html", logo:"./Versions/Assets/Pictures/Non-edited/703.webp"},
  {name:"Iron Lung", path:"./Versions/Assets/Game Data/705-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/705.webp"},
  {name:"Traffic Racer", path:"./Versions/Assets/Game Data/707-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/707.webp"},
  {name:"Survivor.io", path:"./Versions/Assets/Game Data/709-fixagain.html", logo:"./Versions/Assets/Pictures/Non-edited/709.webp"},
  {name:"Monkey Mart",path:"Versions/Assets/Game Data/Monkey Mart.html", logo:"Versions/Assets/Pictures/Non-edited/monkeymart-n.avif"},
  {name:"Antonblast", path:"./Versions/Assets/Game Data/711.html", logo:"./Versions/Assets/Pictures/Non-edited/711.webp"},
  {name:"Jumbo Mario", path:"./Versions/Assets/Game Data/712-f.html", logo:"./Versions/Assets/Pictures/Non-edited/712.webp"},
  {name:"Friday Night Funkin vs Tabi", path:"./Versions/Assets/Game Data/714.html", logo:"./Versions/Assets/Pictures/Non-edited/714.webp"},
  {name:"Friday Night Funkin vs Zardy", path:"./Versions/Assets/Game Data/715.html", logo:"./Versions/Assets/Pictures/Non-edited/715.webp"},
  {name:"Clover Pit", path:"./Versions/Assets/Game Data/716-fix2.html", logo:"./Versions/Assets/Pictures/Non-edited/716.webp"},
  {name:"Peaks of Yore", path:"./Versions/Assets/Game Data/717-fix2.html", logo:"./Versions/Assets/Pictures/Non-edited/717.webp"},
  {name:"Untitled Goose Game", path:"./Versions/Assets/Game Data/718.html", logo:"./Versions/Assets/Pictures/Non-edited/718.webp"},
  {name:"A Game About Feeding A Black Hole", path:"./Versions/Assets/Game Data/719.html", logo:"./Versions/Assets/Pictures/Non-edited/719.webp"},
  {name:"Roulette Hero", path:"./Versions/Assets/Game Data/720.html", logo:"./Versions/Assets/Pictures/Non-edited/720.webp"},
  {name:"Shift at Midnight", path:"./Versions/Assets/Game Data/721.html", logo:"./Versions/Assets/Pictures/Non-edited/721.webp"},
  {name:"Fused 240", path:"./Versions/Assets/Game Data/722.html", logo:"./Versions/Assets/Pictures/Non-edited/722.webp"},
  {name:"Brotato", path:"./Versions/Assets/Game Data/723.html", logo:"./Versions/Assets/Pictures/Non-edited/723.webp"},
  {name:"Endoparasitic 2", path:"./Versions/Assets/Game Data/724.html", logo:"./Versions/Assets/Pictures/Non-edited/724.webp"},
  {name:"ShredSauce", path:"./Versions/Assets/Game Data/725-ff.html", logo:"./Versions/Assets/Pictures/Non-edited/725.webp"},
  {name:"Dimension Incident", path:"./Versions/Assets/Game Data/727.html", logo:"./Versions/Assets/Pictures/Non-edited/727.webp"},
  {name:"Fear Assessment", path:"./Versions/Assets/Game Data/728.html", logo:"./Versions/Assets/Pictures/Non-edited/728.webp"},
  {name:"game inside a game inside a game inside a game inside a game inside a game", path:"./Versions/Assets/Game Data/729.html", logo:"./Versions/Assets/Pictures/Non-edited/729.webp"},
  {name:"Cell Machine", path:"./Versions/Assets/Game Data/730.html", logo:"./Versions/Assets/Pictures/Non-edited/730.webp"},
  {name:"Undertale: Last Breath", path:"./Versions/Assets/Game Data/731.html", logo:"./Versions/Assets/Pictures/Non-edited/731.webp"},
  {name:"64 in 1 NES", path:"./Versions/Assets/Game Data/732.html", logo:"./Versions/Assets/Pictures/Non-edited/732.webp"},
  {name:"Tetris", path:"./Versions/Assets/Game Data/733.html", logo:"./Versions/Assets/Pictures/Non-edited/733.webp"},
  {name:"Christmas Massacre", path:"./Versions/Assets/Game Data/734.html", logo:"./Versions/Assets/Pictures/Non-edited/734.webp"},
  {name:"Famidash", path:"./Versions/Assets/Game Data/735.html", logo:"./Versions/Assets/Pictures/Non-edited/735.webp"},
  {name:"Super Mario Bros. Remastered", path:"./Versions/Assets/Game Data/736.html", logo:"./Versions/Assets/Pictures/Non-edited/736.webp"},
  {name:"Saihate Station (さいはて駅)", path:"./Versions/Assets/Game Data/737.html", logo:"./Versions/Assets/Pictures/Non-edited/737.webp", external:true},
  {name:"Dumb Ways to Die", path:"./Versions/Assets/Game Data/738-u.html", logo:"./Versions/Assets/Pictures/Non-edited/738.webp"},
  {name:"Bart Blast", path:"./Versions/Assets/Game Data/740.html", logo:"./Versions/Assets/Pictures/Non-edited/740.webp"},
  {name:"Resident Evil", path:"./Versions/Assets/Game Data/741.html", logo:"./Versions/Assets/Pictures/Non-edited/741.webp"},
  {name:"Resident Evil 2", path:"./Versions/Assets/Game Data/742.html", logo:"./Versions/Assets/Pictures/Non-edited/742.webp"},
  {name:"Power Hover", path:"./Versions/Assets/Game Data/743.html", logo:"./Versions/Assets/Pictures/Non-edited/743.webp"},
  {name:"Escape Road City 2", path:"./Versions/Assets/Game Data/744-a.html", logo:"./Versions/Assets/Pictures/Non-edited/744.webp"},
  {name:"Tetris", path:"./Versions/Assets/Game Data/745.html", logo:"./Versions/Assets/Pictures/Non-edited/745.webp"},
  {name:"Fundamental Paper Novel", path:"./Versions/Assets/Game Data/746.html", logo:"./Versions/Assets/Pictures/Non-edited/746.webp"},
  {name:"Worst Time Simulator", path:"./Versions/Assets/Game Data/747.html", logo:"./Versions/Assets/Pictures/Non-edited/747.webp"},
  {name:"Undertale Last Breath PHASE THREE", path:"./Versions/Assets/Game Data/748.html", logo:"./Versions/Assets/Pictures/Non-edited/748.webp"},
  {name:"Super Monkey Ball 1&2", path:"./Versions/Assets/Game Data/749.html", logo:"./Versions/Assets/Pictures/Non-edited/749.webp"},
  {name:"Bad Piggies", path:"./Versions/Assets/Game Data/752.html", logo:"./Versions/Assets/Pictures/Non-edited/752.webp"},
  {name:"Breaklock", path:"./Versions/Assets/Game Data/753.html", logo:"./Versions/Assets/Pictures/Non-edited/753.webp"},
  {name:"Minecraft Pocket Edition", path:"./Versions/Assets/Game Data/754.html", logo:"./Versions/Assets/Pictures/Non-edited/754.webp", external:true},
  {name:"Witch's Heart", path:"./Versions/Assets/Game Data/756-f.html", logo:"./Versions/Assets/Pictures/Non-edited/756.webp"},
  {name:"Ultrapool", path:"./Versions/Assets/Game Data/757.html", logo:"./Versions/Assets/Pictures/Non-edited/757.webp"},
  {name:"CaseOh's Basics in Eating and Fast Food", path:"./Versions/Assets/Game Data/758a.html", logo:"./Versions/Assets/Pictures/Non-edited/758.webp"},
  {name:"Dice a Million", path:"./Versions/Assets/Game Data/759.html", logo:"./Versions/Assets/Pictures/Non-edited/759.webp"},
  {name:"Overburden", path:"./Versions/Assets/Game Data/760.html", logo:"./Versions/Assets/Pictures/Non-edited/760.webp"},
  {name:"FISH", path:"./Versions/Assets/Game Data/761.html", logo:"./Versions/Assets/Pictures/Non-edited/761.webp"},
  {name:"Cheese Rolling", path:"./Versions/Assets/Game Data/762.html", logo:"./Versions/Assets/Pictures/Non-edited/762.webp"},
  {name:"Flying Gorilla 3D", path:"./Versions/Assets/Game Data/763.html", logo:"./Versions/Assets/Pictures/Non-edited/763.webp"},
  {name:"Five Night's at Shrek's Hotel", path:"./Versions/Assets/Game Data/764.html", logo:"./Versions/Assets/Pictures/Non-edited/764.webp", external:true},
  {name:"Scary Shawarma Kiosk: the ANOMALY", path:"./Versions/Assets/Game Data/765.html", logo:"./Versions/Assets/Pictures/Non-edited/765.webp"},
  {name:"Suika Game", path:"./Versions/Assets/Game Data/766.html", logo:"./Versions/Assets/Pictures/Non-edited/766.webp"},
  {name:"Stick Slasher", path:"./Versions/Assets/Game Data/767.html", logo:"./Versions/Assets/Pictures/Non-edited/767.webp"},
  {name:"Stickman Duel", path:"./Versions/Assets/Game Data/769.html", logo:"./Versions/Assets/Pictures/Non-edited/769.webp"},
  {name:"Sonic Robo Blast 2", path:"./Versions/Assets/Game Data/770-update.html", logo:"./Versions/Assets/Pictures/Non-edited/770.webp", external:true},
  {name:"Sam & Max Hit the Road", path:"./Versions/Assets/Game Data/772.html", logo:"./Versions/Assets/Pictures/Non-edited/772.webp"},
  {name:"Mountain Bike Racer", path:"./Versions/Assets/Game Data/774.html", logo:"./Versions/Assets/Pictures/Non-edited/774.webp"},
  {name:"Bart Bash", path:"./Versions/Assets/Game Data/775.html", logo:"./Versions/Assets/Pictures/Non-edited/775.webp"},
  {name:"Your Only Move Is HUSTLE", path:"./Versions/Assets/Game Data/776.html", logo:"./Versions/Assets/Pictures/Non-edited/776.webp"},
  {name:"Outhold", path:"./Versions/Assets/Game Data/777.html", logo:"./Versions/Assets/Pictures/Non-edited/777.webp"},
  {name:"Thing-Thing Arena 3", path:"./Versions/Assets/Game Data/780.html", logo:"./Versions/Assets/Pictures/Non-edited/780.webp"},
  {name:"Scratch Inc", path:"./Versions/Assets/Game Data/781.html", logo:"./Versions/Assets/Pictures/Non-edited/781.webp"},
  {name:"Apes vs Helium", path:"./Versions/Assets/Game Data/783.html", logo:"./Versions/Assets/Pictures/Non-edited/783.webp"},
  {name:"Gabriel's Awesome Schoolhouse (GASH)", path:"./Versions/Assets/Game Data/784.html", logo:"./Versions/Assets/Pictures/Non-edited/784.webp"},
  {name:"Geometry Dash", path:"./Versions/Assets/Game Data/geometrydash/index.html", logo:"./Versions/Assets/Pictures/Non-edited/785.webp"},
  {name:"BeatBlock", path:"./Versions/Assets/Game Data/787.html", logo:"./Versions/Assets/Pictures/Non-edited/787.webp"},
  {name:"Stardew Valley", path:"./Versions/Assets/Game Data/789-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/789.webp"},
  {name:"Who's Your Daddy", path:"./Versions/Assets/Game Data/791.html", logo:"./Versions/Assets/Pictures/Non-edited/791.webp", external:true},
  {name:"Escape Road 3", path:"./Versions/Assets/Game Data/792.html", logo:"./Versions/Assets/Pictures/Non-edited/792.webp"},
  {name:"Lethal Ape", path:"./Versions/Assets/Game Data/793.html", logo:"./Versions/Assets/Pictures/Non-edited/793.webp"},
  {name:"UvuvwevwevweOnyetenvewveUgwemubwemOssas", path:"./Versions/Assets/Game Data/795.html", logo:"./Versions/Assets/Pictures/Non-edited/795.webp"},
  {name:"Fih", path:"./Versions/Assets/Game Data/797.html", logo:"./Versions/Assets/Pictures/Non-edited/797.webp"},
  {name:"Hungry Lamu", path:"./Versions/Assets/Game Data/798.html", logo:"./Versions/Assets/Pictures/Non-edited/798.webp"},
  {name:"Rocket Goal.io", path:"./Versions/Assets/Game Data/800-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/800.webp"},
  {name:"Vampire Survivors", path:"./Versions/Assets/Game Data/804.html", logo:"./Versions/Assets/Pictures/Non-edited/804.webp"},
  {name:"Slendytubbies 2", path:"./Versions/Assets/Game Data/806.html", logo:"./Versions/Assets/Pictures/Non-edited/806.webp"},
  {name:"Slendytubbies 2D", path:"./Versions/Assets/Game Data/807.html", logo:"./Versions/Assets/Pictures/Non-edited/807.webp"},
  {name:"Spaceflight Simulator", path:"./Versions/Assets/Game Data/808.html", logo:"./Versions/Assets/Pictures/Non-edited/808.webp"},
  {name:"Rhythm Heaven", path:"./Versions/Assets/Game Data/809.html", logo:"./Versions/Assets/Pictures/Non-edited/809.webp"},
  {name:"Need For Speed: Carbon", path:"./Versions/Assets/Game Data/810-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/810.webp"},
  {name:"Need For Speed: Most Wanted", path:"./Versions/Assets/Game Data/811.html", logo:"./Versions/Assets/Pictures/Non-edited/811.webp"},
  {name:"Need For Speed: Underground 2", path:"./Versions/Assets/Game Data/812.html", logo:"./Versions/Assets/Pictures/Non-edited/812.webp"},
  {name:"Baldi's Basics The Ultra Decompile", path:"./Versions/Assets/Game Data/815.html", logo:"./Versions/Assets/Pictures/Non-edited/815.webp"},
  {name:"-3", path:"./Versions/Assets/Game Data/816.html", logo:"./Versions/Assets/Pictures/Non-edited/816.webp"},
  {name:"-b", path:"./Versions/Assets/Game Data/817-f.html", logo:"./Versions/Assets/Pictures/Non-edited/817.webp"},
  {name:"t³ (T cubed)", path:"./Versions/Assets/Game Data/818.html", logo:"./Versions/Assets/Pictures/Non-edited/818.webp"},
  {name:"20 Minutes Till Dawn", path:"./Versions/Assets/Game Data/819-fix2.html", logo:"./Versions/Assets/Pictures/Non-edited/819.webp"},
  {name:"Phoenix Wright - Ace Attorney", path:"./Versions/Assets/Game Data/820-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/820.webp"},
  {name:"Apollo Justice - Ace Attorney", path:"./Versions/Assets/Game Data/821-fix.html", logo:"./Versions/Assets/Pictures/Non-edited/821.webp"},
  {name:"Phoenix Wright - Ace Attorney - Justice for All", path:"./Versions/Assets/Game Data/822.html", logo:"./Versions/Assets/Pictures/Non-edited/822.webp"},
  {name:"Phoenix Wright - Ace Attorney - Trials and Tribulations", path:"./Versions/Assets/Game Data/824.html", logo:"./Versions/Assets/Pictures/Non-edited/824.webp"},
  {name:"Just Shapes & Beats", path:"./Versions/Assets/Game Data/826-f.html", logo:"./Versions/Assets/Pictures/Non-edited/826.webp"},
  {name:"Animal Crossing (GAMECUBE)", path:"./Versions/Assets/Game Data/828.html", logo:"./Versions/Assets/Pictures/Non-edited/828.webp"},
  {name:"Touhou 1 Touhou-Reiiden", path:"./Versions/Assets/Game Data/829.html", logo:"./Versions/Assets/Pictures/Non-edited/829.webp"},
  {name:"Touhou 2 Touhou-Fuumaroku", path:"./Versions/Assets/Game Data/830.html", logo:"./Versions/Assets/Pictures/Non-edited/830.webp"},
  {name:"Touhou 3 Touhou-Yumejikuu", path:"./Versions/Assets/Game Data/831.html", logo:"./Versions/Assets/Pictures/Non-edited/831.webp"},
  {name:"Touhou 4 Touhou-Gensokyou", path:"./Versions/Assets/Game Data/832.html", logo:"./Versions/Assets/Pictures/Non-edited/832.webp"},
  {name:"Touhou 5 Touhou-Kaikidan", path:"./Versions/Assets/Game Data/833.html", logo:"./Versions/Assets/Pictures/Non-edited/833.webp"},
  {name:"I Wanna Be The Guy", path:"./Versions/Assets/Game Data/834.html", logo:"./Versions/Assets/Pictures/Non-edited/834.webp"},
  {name:"Friday Night Funkin vs Shucks v2", path:"./Versions/Assets/Game Data/836.html", logo:"./Versions/Assets/Pictures/Non-edited/836.webp"},
  {name:"Into Space 2", path:"./Versions/Assets/Game Data/837.html", logo:"./Versions/Assets/Pictures/Non-edited/837.webp"},
  {name:"My Talking Baby Hippo", path:"./Versions/Assets/Game Data/840-fix2.html", logo:"./Versions/Assets/Pictures/Non-edited/840.webp"},
  {name:"WarioWare: Touched!", path:"./Versions/Assets/Game Data/841.html", logo:"./Versions/Assets/Pictures/Non-edited/841.webp"},
  
];
// ==============================================

function toggleVersionInput(event) {
  event.stopPropagation(); 
  const bubble = document.getElementById("versionInputBubble");
  if (bubble.style.display === "none" || bubble.style.display === "") {
    bubble.style.display = "block";
  } else {
    bubble.style.display = "none";
  }
}

// === 1. Disguise & Security Logic ===
let isCanvasMode = localStorage.getItem("mathmaster_canvas_mode") === "true";
let panicKey = localStorage.getItem("mathmaster_panic_key") || "`";
let inGamePanicKey = localStorage.getItem("mathmaster_ingame_panic_key") || "]"; 
let panicURL = localStorage.getItem("mathmaster_panic_url") || "https://www.google.com";
let customTitle = localStorage.getItem("mathmaster_title") || "Math Master";
let customFavicon = localStorage.getItem("mathmaster_favicon") || "Versions/Assets/Pictures/Non-edited/Math-n.png";

function changeFavicon(src) {
    const oldLink = document.getElementById("favicon");
    if (oldLink) oldLink.remove();
    const newLink = document.createElement("link");
    newLink.id = "favicon";
    newLink.rel = "icon";
    newLink.href = src;
    document.head.appendChild(newLink);
}

function applyTabIdentity() {
    if (isCanvasMode) {
        document.title = "Quizzes 2";
        changeFavicon("Versions/Assets/Pictures/Non-edited/canvas-n.png");
    } else {
        document.title = customTitle;
        changeFavicon(customFavicon);
    }
}

window.addEventListener('beforeunload', function (e) {
    const blockToggle = document.getElementById('settingsBlockCloseToggle');
    if (blockToggle && blockToggle.checked) {
        e.preventDefault();
        e.returnValue = ''; 
    }
});
applyTabIdentity();

const settingsCanvasToggle = document.getElementById("settingsCanvasToggle");
if (settingsCanvasToggle) {
    settingsCanvasToggle.checked = isCanvasMode;
    settingsCanvasToggle.addEventListener('change', (e) => {
        isCanvasMode = e.target.checked;
        localStorage.setItem("mathmaster_canvas_mode", isCanvasMode);
        applyTabIdentity();
        if (typeof checkSecretTrigger === 'function') checkSecretTrigger();
    });
}

const titleInput = document.getElementById("settingsTabTitle");
if (titleInput) {
    titleInput.value = (customTitle !== "Math Master") ? customTitle : "";
    titleInput.addEventListener("input", (e) => {
        customTitle = e.target.value || "Math Master";
        localStorage.setItem("mathmaster_title", customTitle);
        applyTabIdentity();
    });
}

const iconInput = document.getElementById("settingsTabIcon");
if (iconInput) {
    iconInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            customFavicon = event.target.result; 
            localStorage.setItem("mathmaster_favicon", customFavicon);
            applyTabIdentity();
        };
        reader.readAsDataURL(file);
    });
}

const panicInput = document.getElementById("settingsPanicKey");
const panicURLInput = document.getElementById("settingsPanicURL");

if (panicInput) {
    panicInput.value = panicKey;
    panicInput.addEventListener("input", (e) => {
        panicKey = e.target.value || "`";
        localStorage.setItem("mathmaster_panic_key", panicKey);
    });
}

if (panicURLInput) {
    panicURLInput.value = panicURL;
    panicURLInput.addEventListener("input", (e) => {
        panicURL = e.target.value || "https://www.google.com";
        localStorage.setItem("mathmaster_panic_url", panicURL);
    });
}

const inGamePanicInput = document.getElementById("settingsInGamePanicKey");
if (inGamePanicInput) {
    inGamePanicInput.value = inGamePanicKey;
    inGamePanicInput.addEventListener("input", (e) => {
        inGamePanicKey = e.target.value || "]";
        localStorage.setItem("mathmaster_ingame_panic_key", inGamePanicKey);
    });
}

function savePanicMapping() {
    const select = document.getElementById("panicGameSelect");
    const altFile = document.getElementById("panicAltFile");
    if (!select || !select.value) return alert("Select a game first!");
    
    const mappings = JSON.parse(localStorage.getItem("mathmaster_game_panic_maps") || "{}");
    
    if (altFile.value.trim() === "") {
        delete mappings[select.value];
        alert("Alternative file cleared for this game.");
    } else {
        mappings[select.value] = altFile.value.trim();
        alert("Alt file saved! Press your In-Game Swap Key while playing this game to switch.");
    }
    localStorage.setItem("mathmaster_game_panic_maps", JSON.stringify(mappings));
}

function populatePanicGames() {
    const select = document.getElementById("panicGameSelect");
    if (!select || typeof games === "undefined") return;
    
    games.filter(g => !g.external).forEach(g => {
        const opt = document.createElement("option");
        opt.value = g.path;
        opt.textContent = g.name;
        select.appendChild(opt);
    });

    select.addEventListener("change", (e) => {
        const mappings = JSON.parse(localStorage.getItem("mathmaster_game_panic_maps") || "{}");
        const altInput = document.getElementById("panicAltFile");
        if (altInput) altInput.value = mappings[e.target.value] || "";
    });
}

document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    if (e.key === panicKey) {
        if (document.fullscreenElement) document.exitFullscreen();
        window.location.href = panicURL;
        return;
    }

    if (e.key === inGamePanicKey) {
        const viewerElement = document.getElementById("viewer");
        const gameFrameElement = document.getElementById("gameFrame");
        if (viewerElement && viewerElement.style.display === "flex" && typeof currentSrc !== 'undefined') {
            const mappings = JSON.parse(localStorage.getItem("mathmaster_game_panic_maps") || "{}");
            if (mappings[currentSrc]) {
                gameFrameElement.src = mappings[currentSrc];
            }
        }
    }

    const viewerElement = document.getElementById("viewer");
    if (viewerElement && viewerElement.style.display === "flex") {
        const matchedControl = viewerControlsConfig.find(c => c.key === e.key.toLowerCase());
        
        if (matchedControl && viewerControlsVisibility[matchedControl.id]) {
            e.preventDefault(); 
            new Function(matchedControl.action)(); 
        }
    }
});

function openAboutBlank() {
    let win = window.open('about:blank', '_blank');
    if (!win) return alert("Please allow pop-ups for this site!");

    let currentTitle = document.title;
    let iconElement = document.getElementById("favicon");
    let currentIcon = iconElement ? iconElement.href : "";

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${currentTitle}</title>
            <link rel="icon" type="image/png" href="${currentIcon}">
            <style>
                body { margin: 0; overflow: hidden; background: #000; }
                iframe { width: 100vw; height: 100vh; border: none; margin: 0; display: block; }
            </style>
        </head>
        <body>
            <iframe src="${window.location.href}"></iframe>
        </body>
        </html>
    `);
    
    win.document.close();
    window.location.replace('https://classroom.google.com'); 
}

function resolveGameUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
    if (rawUrl.startsWith("/iframe.html?url=")) return decodeURIComponent(rawUrl.slice(17));
    return rawUrl;
}

async function importGameCollection() {
    try {
        const response = await fetch('collection.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) throw new TypeError("Oops, we didn't get JSON!");
        
        const data = await response.json();
        const formattedGames = data.games.map(game => ({
            title: game.label,
            image: game.imageUrl,
            url: resolveGameUrl(game.url),
            categories: game.categories || []
        }));

        games.push(...formattedGames);
        renderGamesGrid(); 
    } catch (error) { }
}

document.addEventListener('DOMContentLoaded', () => {
    importGameCollection();
});

const gameIframe = document.getElementById("gameFrame");
if (gameIframe) {
    gameIframe.addEventListener("load", () => {
        try {
            gameIframe.contentWindow.document.addEventListener("keydown", (e) => {
                if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
                
                if (e.key === panicKey) {
                    if (document.fullscreenElement) document.exitFullscreen();
                    if (gameIframe.contentWindow.document.fullscreenElement) {
                        gameIframe.contentWindow.document.exitFullscreen();
                    }
                    window.top.location.href = panicURL;
                    return;
                }

                const viewerElement = document.getElementById("viewer");
                if (viewerElement && viewerElement.style.display === "flex") {
                    const matchedControl = viewerControlsConfig.find(c => c.key === e.key.toLowerCase());
                    if (matchedControl && viewerControlsVisibility[matchedControl.id]) {
                        e.preventDefault(); 
                        new Function(matchedControl.action)(); 
                    }
                }

                if (e.key === inGamePanicKey) {
                    const mappings = JSON.parse(localStorage.getItem("mathmaster_game_panic_maps") || "{}");
                    if (typeof currentSrc !== 'undefined' && mappings[currentSrc]) {
                        gameIframe.src = mappings[currentSrc]; 
                    }
                }
            });
        } catch (err) {}
    });
}

function initCountdown() {
    const timerDisplay = document.getElementById("countdownTimer");
    const timerContainer = document.getElementById("v3Countdown");
    if (!timerDisplay || !timerContainer) return;

    if (localStorage.getItem("mathmaster_v3_intro_played") === "true") {
        timerContainer.style.display = "none";
        return;
    }

    const targetDate = new Date("April 1, 2026 22:26:00").getTime();

    const interval = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance <= 0) {
            clearInterval(interval);
            timerDisplay.innerHTML = "IT IS LIVE!";
            setTimeout(() => { triggerV3Intro(); }, 1000);
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        timerDisplay.innerHTML = `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }, 1000); 
}

window.onload = function() {
    renderGamesGrid();
    populatePanicGames();
    initCountdown();

    // Ensure dock is visible on index (mirrors goHome() — nothing else sets this on fresh load)
    const dockConEl = document.querySelector('.dock-container');
    if (dockConEl) dockConEl.style.transform = 'translateX(-50%)';

    if (localStorage.getItem("mathmaster_tour_completed") !== "true") {
        setTimeout(() => {
            const modal = document.getElementById("tourWelcomeModal");
            if (modal) modal.style.display = "flex";
        }, 500); 
    }
}; 

function switchSection(targetAppId, clickedBtn) {
    if (typeof closePopups === 'function') closePopups();

    const allSections = document.querySelectorAll('.app-section');
    allSections.forEach(section => {
        section.classList.remove('active-section');
        section.style.display = 'none';
    });

    const targetSection = document.getElementById(targetAppId);
    if (targetSection) {
        targetSection.classList.add('active-section');
        targetSection.style.display = 'block';

        // LAZY LOAD LOGIC ADDED HERE:
        const frame = targetSection.querySelector('.app-frame');
        if (frame && frame.getAttribute('data-src')) {
            if (frame.tagName === 'OBJECT') {
                if (frame.data.includes('about:blank')) frame.data = frame.getAttribute('data-src');
            } else {
                if (frame.src.includes('about:blank')) frame.src = frame.getAttribute('data-src');
            }
        }
    }


    const allDockBtns = document.querySelectorAll('.bottom-dock .dock-btn[data-app]');
    allDockBtns.forEach(btn => {
        btn.classList.remove('active-mode');
    });

    if (clickedBtn) {
        clickedBtn.classList.add('active-mode');
    }

    if (targetAppId === 'app-settings' && typeof renderSettingsList === 'function') {
        renderSettingsList();
    }
}

let isDockCollapsed = localStorage.getItem('mathmaster_dock_collapsed') === 'true';

function initDockState() {
    const dock = document.getElementById('bottomDock');
    const container = document.getElementById('dockContainer');
    if (!dock || !container) return;

    if (isDockCollapsed) dock.classList.add('collapsed');

    const savedLeft = localStorage.getItem('mathmaster_dock_x');
    const savedTop = localStorage.getItem('mathmaster_dock_y');

    if (savedLeft && savedTop) {
        container.classList.add('dragged');
        
        let x = parseFloat(savedLeft);
        let y = parseFloat(savedTop);
        
        const dockWidth = container.offsetWidth || 300;
        const dockHeight = container.offsetHeight || 80;
        
        x = Math.max(0, Math.min(window.innerWidth - dockWidth, x));
        y = Math.max(0, Math.min(window.innerHeight - dockHeight, y));

        container.style.left = x + 'px';
        container.style.top = y + 'px';
        container.style.bottom = 'auto'; 
    }
}

function toggleDock() {
    const dock = document.getElementById('bottomDock');
    if (!dock) return;
    isDockCollapsed = !isDockCollapsed;
    dock.classList.toggle('collapsed', isDockCollapsed);
    localStorage.setItem('mathmaster_dock_collapsed', isDockCollapsed);
}

const dragHandle = document.getElementById('dockDragHandle');
const dockContainer = document.getElementById('dockContainer');

let isDraggingDock = false;
let dockOffsetX = 0;
let dockOffsetY = 0;

function startDrag(e) {
    if (!dockContainer) return;
    isDraggingDock = true;
    dockContainer.style.bottom = 'auto';

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = dockContainer.getBoundingClientRect();
    dockOffsetX = clientX - rect.left;
    dockOffsetY = clientY - rect.top;

    e.preventDefault();
}

function moveDrag(e) {
    if (!isDraggingDock || !dockContainer) return;
    e.preventDefault(); 
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    let newX = clientX - dockOffsetX;
    let newY = clientY - dockOffsetY;

    const rect = dockContainer.getBoundingClientRect();
    newX = Math.max(0, Math.min(window.innerWidth - rect.width, newX));
    newY = Math.max(0, Math.min(window.innerHeight - rect.height, newY));

    dockContainer.style.left = newX + 'px';
    dockContainer.style.top = newY + 'px';
}

function endDrag() {
    if (isDraggingDock && dockContainer) {
        isDraggingDock = false;
        localStorage.setItem('mathmaster_dock_x', dockContainer.style.left.replace('px', ''));
        localStorage.setItem('mathmaster_dock_y', dockContainer.style.top.replace('px', ''));
    }
}

if (dragHandle) {
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag, { passive: false });
    
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
}

document.addEventListener('DOMContentLoaded', initDockState);

function launchDropdownVersion() {
    const select = document.getElementById('versionSelect');
    const url = select.value;
    
    if (!url) {
        alert("Please select a version from the dropdown first!");
        return;
    }
    
    const overlay = document.getElementById('versionRunnerOverlay');
    const versionFrame = document.getElementById('versionFrame');
    
    versionFrame.src = url;
    overlay.style.display = 'block';
}

const knownVersions = ["Beta v1.0.html", "Beta v1.1.html","Beta v1.2.html","v1.0.html","v1.1.html", "v1.2.html","Beta v2.0.html","v2.0.html","v2.1.html","v2.2.html","v2.3.html","index_christmas.html","v2.4.html","v2.5.html","v2.6.html","v2.7.html", ];

function initTimeMachine() {
    const dropdown = document.getElementById('versionDropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="" disabled selected>Select a version...</option>';

    knownVersions.forEach(file => {
        let displayName = file.replace('.html', '').replace('v', 'Version ');
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

        const opt = document.createElement('option');
        opt.value = `Versions/${file}`;
        opt.textContent = displayName;
        dropdown.appendChild(opt);
    });
}

function launchSelectedVersion() {
    const url = document.getElementById('versionDropdown').value;
    if (!url) return;

    const overlay = document.getElementById('versionRunnerOverlay');
    const versionFrame = document.getElementById('versionFrame');
    
    versionFrame.src = url;
    overlay.style.display = 'block';
    
    document.body.style.overflow = 'hidden';
}

function exitVersion() {
    const overlay = document.getElementById('versionRunnerOverlay');
    const versionFrame = document.getElementById('versionFrame');
    
    overlay.style.display = 'none';
    versionFrame.src = '';
    
    document.body.style.overflow = 'auto';
}

window.addEventListener('DOMContentLoaded', initTimeMachine);

function triggerV3Intro() {
    if (localStorage.getItem("mathmaster_v3_intro_played") === "true") {
        document.getElementById("v3Countdown").style.display = "none";
        return;
    }

    const timer = document.getElementById("v3Countdown");
    const flash = document.getElementById("introFlash");
    
    const uiElements = document.querySelectorAll('.home-widget, .home-card, .dock-btn, .header h1, .header div');
    
    uiElements.forEach(el => el.classList.add('ui-hidden'));

    timer.classList.add("zoom-out-of-bounds");

    setTimeout(() => {
        flash.style.opacity = "1"; 
        
        setTimeout(() => {
            timer.style.display = "none"; 
        }, 300);

        setTimeout(() => {
            flash.style.opacity = "0"; 
            
            let delay = 0;
            uiElements.forEach((el) => {
                setTimeout(() => {
                    el.classList.remove('ui-hidden');
                    el.classList.add('ui-reveal');
                }, delay);
                delay += 80; 
            });

            localStorage.setItem("mathmaster_v3_intro_played", "true");
            
        }, 600); 
    }, 2200); 
}

async function renderGamesGrid() {
    const gridEl = document.getElementById("gameGrid");
    if (!gridEl) return;
    gridEl.innerHTML = "";
    if (window.__gameGridObserver) { window.__gameGridObserver.disconnect(); window.__gameGridObserver = null; }
    if (window.__gameGridSentinel && window.__gameGridSentinel.parentNode) {
        window.__gameGridSentinel.parentNode.removeChild(window.__gameGridSentinel);
        window.__gameGridSentinel = null;
    } 
    
    const sortDropdown = document.getElementById('sortDropdown');
    const filterDropdown = document.getElementById('filterDropdown');
    const srchInput = document.getElementById('searchInput');

    // Combine your old password unlock check with the Firebase premium check
    const isPremium = localStorage.getItem('mathmaster_premium') === 'true';
    const unlocked = (typeof isSecretUnlocked === 'function' ? isSecretUnlocked() : false) || isPremium;

    const sortMethod = sortDropdown ? sortDropdown.value : 'default';
    const filterMethod = filterDropdown ? filterDropdown.value : 'all';
    const searchText = srchInput ? srchInput.value.toLowerCase().trim() : '';

    // Render helper
    function appendGameCard(g, isLocked = false) {
        const c = document.createElement("div");
        c.className = "card";
        
        if (g.secret) c.style.border = "1px solid var(--accent-color)"; 
        if (g.isApp) c.style.border = `2px solid ${g.appColor || '#fff'}`;

if (isLocked) {
            // Render Locked State
            c.style.position = "relative";
            c.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); padding: 5px; border-radius: 6px; backdrop-filter: blur(4px);">
                    <svg fill="none" height="16" stroke="#FFD700" stroke-width="2" viewBox="0 0 24 24" width="16"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <img src="${g.logo}" loading="lazy" decoding="async" style="opacity: 0.4;">
                <h3 style="color: rgba(255,255,255,0.5);">${g.name}</h3>
                <button class="btn" onclick="handlePremiumUpgradeClick(event)" style="background: rgba(255,215,0,0.2); color: #FFD700; border: 1px solid rgba(255,215,0,0.4);">Unlock</button>
            `;
        } else if (g.unavailable) {
            // Unavailable App Render
            c.style.position = 'relative';
            c.innerHTML = `
                <div style="position:absolute;top:8px;right:8px;background:rgba(255,60,40,0.88);color:white;font-size:9px;font-weight:800;padding:3px 8px;border-radius:5px;letter-spacing:0.8px;z-index:5;text-transform:uppercase;backdrop-filter:blur(4px);">Unavailable</div>
                <img src="${g.logo}" loading="lazy" decoding="async" style="opacity:0.45;filter:grayscale(0.4);">
                <h3 style="opacity:0.55;">${g.name}</h3>
                <button class="btn" onclick="openAppUnavailable('${g.name}')" style="background:rgba(255,60,40,0.12);color:rgba(255,80,50,0.85);border:1px solid rgba(255,60,40,0.28);">Unavailable</button>`;
        } else {
            // Normal Render
            c.innerHTML = `<img src="${g.logo}" loading="lazy" decoding="async"><h3>${g.name}</h3>`;
            c.innerHTML += g.newtab
                    ? `<button class="btn" onclick="window.open('${g.path}','_blank')" title="Opens in a new tab">Open in Tab</button>`
                    : `<button class="btn" onclick="loadGameSafe('${g.path}')">Play</button>`;
        }
        gridEl.appendChild(c);
    }
    
    // Custom Games Logic
    if (typeof getCustomGames === 'function') {
        const customGames = await getCustomGames();
        if (customGames && customGames.length > 0) {
            const controllerIcon = "Versions/Assets/Pictures/Non-edited/Placeholder.png";
            for (const cg of customGames) {
                let rawName = cg.name || "Custom Game";
                const displayName = rawName.split('/').pop().replace(/\.html$/i, '').trim(); 
                
                if (searchText && !displayName.toLowerCase().includes(searchText)) continue;

                const c = document.createElement("div");
                c.className = "card";
                c.style.border = "1px dashed var(--accent-color)"; 
                c.innerHTML = `<img src="${controllerIcon}" loading="lazy" decoding="async" style="object-fit: contain; padding: 10px;"><h3>${displayName}</h3>`;
                
                const playBtn = document.createElement("button");
                playBtn.className = "btn";
                playBtn.textContent = "Play";
                playBtn.onclick = () => {
                    const blobUrl = URL.createObjectURL(cg.fileData);
                    loadGame(blobUrl);
                };
                c.appendChild(playBtn);
                gridEl.appendChild(c);
            }
        }
    }

    // Pass the lock state into the secret games rendering
    let secretGames = games.filter(g => g.secret);
    secretGames.forEach(g => {
        if (searchText && !g.name.toLowerCase().includes(searchText)) return;
        appendGameCard(g, !unlocked);
    });

    let standardGames = games.filter(g => !g.secret);

    if (searchText) {
        standardGames = standardGames.filter(g => g.name.toLowerCase().includes(searchText));
    }

    if (filterMethod === 'dev') {
        const startIdx = games.findIndex(g => g.name === "Love Meter");
        const endIdx = games.findIndex(g => g.name === "Yohoho.io");
        if (startIdx !== -1 && endIdx !== -1) {
            const devFavPaths = games.slice(startIdx, endIdx + 1).map(g => g.path);
            standardGames = standardGames.filter(g => devFavPaths.includes(g.path));
        }
    } else if (filterMethod === 'favs') {
        const favoriteGames = JSON.parse(localStorage.getItem('mathmaster_favs')) || [];
        standardGames = standardGames.filter(g => favoriteGames.includes(g.path));
    }

    // Apply Standard Sort
    if (sortMethod === 'az') {
        standardGames.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'recent') {
        const recent = JSON.parse(localStorage.getItem('mathmaster_recent')) || [];
        standardGames.sort((a, b) => {
            let idxA = recent.indexOf(a.path);
            let idxB = recent.indexOf(b.path);
            if (idxA === -1) idxA = 99999;
            if (idxB === -1) idxB = 99999;
            return idxA - idxB;
        });
    }

    // --- Lazy-batch render: only build cards (and fire their <img> requests)
    // for the next batch when the user actually scrolls near the bottom ---
    const GAMES_BATCH_SIZE = 40;
    let batchIndex = 0;

    function renderNextGameBatch() {
        const next = standardGames.slice(batchIndex, batchIndex + GAMES_BATCH_SIZE);
        next.forEach(g => appendGameCard(g, false));
        batchIndex += GAMES_BATCH_SIZE;

        if (batchIndex >= standardGames.length) {
            if (window.__gameGridObserver) {
                window.__gameGridObserver.disconnect();
                window.__gameGridObserver = null;
            }
            if (window.__gameGridSentinel && window.__gameGridSentinel.parentNode) {
                window.__gameGridSentinel.parentNode.removeChild(window.__gameGridSentinel);
                window.__gameGridSentinel = null;
            }
        }
    }

    renderNextGameBatch(); // render the first screenful immediately

    if (batchIndex < standardGames.length) {
        const sentinel = document.createElement("div");
        sentinel.setAttribute("aria-hidden", "true");
        sentinel.style.height = "1px";
        gridEl.insertAdjacentElement("afterend", sentinel);
        window.__gameGridSentinel = sentinel;

        window.__gameGridObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) renderNextGameBatch();
        }, { rootMargin: "400px" });
        window.__gameGridObserver.observe(sentinel);
    }
}

function initGameFilters() {
    const sortDropdown = document.getElementById('sortDropdown');
    const filterDropdown = document.getElementById('filterDropdown');
    const srchInput = document.getElementById('searchInput');

    const savedFilter = localStorage.getItem('mathmaster_default_filter') || 'all';
    const savedSort = localStorage.getItem('mathmaster_default_sort') || 'default';

    if (filterDropdown) {
        filterDropdown.value = savedFilter;
        filterDropdown.onchange = (e) => {
            localStorage.setItem('mathmaster_default_filter', e.target.value);
            syncSettingsUI();
            renderGamesGrid();
        };
    }
    
    if (sortDropdown) {
        sortDropdown.value = savedSort;
        sortDropdown.onchange = (e) => {
            localStorage.setItem('mathmaster_default_sort', e.target.value);
            syncSettingsUI();
            renderGamesGrid();
        };
    }
    
    if (srchInput) srchInput.oninput = () => renderGamesGrid();
    
    syncSettingsUI();
}

function syncSettingsUI() {
    const filter = localStorage.getItem('mathmaster_default_filter') || 'all';
    const sort = localStorage.getItem('mathmaster_default_sort') || 'default';
    
    const setFilter = document.getElementById('settingsDefaultFilter');
    const setSort = document.getElementById('settingsDefaultSort');
    
    if (setFilter) setFilter.value = filter;
    if (setSort) setSort.value = sort;
}

function saveDefaultFilters() {
    const setFilter = document.getElementById('settingsDefaultFilter');
    const setSort = document.getElementById('settingsDefaultSort');
    
    if (setFilter) localStorage.setItem('mathmaster_default_filter', setFilter.value);
    if (setSort) localStorage.setItem('mathmaster_default_sort', setSort.value);
    
    const filterDropdown = document.getElementById('filterDropdown');
    const sortDropdown = document.getElementById('sortDropdown');
    if (filterDropdown && setFilter) filterDropdown.value = setFilter.value;
    if (sortDropdown && setSort) sortDropdown.value = setSort.value;
    
    renderGamesGrid();
}

initGameFilters();
document.addEventListener('DOMContentLoaded', initGameFilters);

function switchSettingsTab(event, tabId) {
    const tabContents = document.querySelectorAll('.settings-tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });

    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');

    // Sync p/app settings UI whenever App Settings tab is opened
    if (tabId === 'tab-app-settings' && typeof syncProxySettingsUI === 'function') {
        syncProxySettingsUI();
    }
}

// === GLOBAL DEV CONSOLE & OMNISCIENT TRACKER ===
const globalConsole = document.getElementById('global-dev-console');
const consoleOutputInner = document.getElementById('console-output');
const consoleHandle = document.getElementById('console-drag-handle');

function renderGlobalLog(msg, level = 'log', source = 'MAIN') {
    if (!consoleOutputInner) return;
    const div = document.createElement('div');
    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
    div.style.paddingBottom = '4px';
    div.style.wordWrap = 'break-word';
    
    let color = '#0f0'; 
    if(level === 'warn') color = '#ffcc00';
    if(level === 'error') color = '#ff4a4a';
    if(level === 'network') color = '#ff00ff'; 
    
    let cleanSource = source.split('/').pop() || source;
    if(cleanSource.length > 20) cleanSource = cleanSource.substring(0, 17) + '...';

    div.style.color = color;
    div.innerHTML = `<span style="color: #666;">[${cleanSource}]</span> <span style="font-weight:bold; opacity: 0.8;">[${level.toUpperCase()}]</span> ${msg}`;
    consoleOutputInner.appendChild(div);
    consoleOutputInner.scrollTop = consoleOutputInner.scrollHeight;
}

const origLog = console.log, origWarn = console.warn, origError = console.error;
console.log = (...args) => { origLog(...args); renderGlobalLog(args.join(' '), 'log'); };
console.warn = (...args) => { origWarn(...args); renderGlobalLog(args.join(' '), 'warn'); };
console.error = (...args) => { origError(...args); renderGlobalLog(args.join(' '), 'error'); };

window.addEventListener('error', (e) => renderGlobalLog(`${e.message} at ${e.filename}:${e.lineno}`, 'error'));
window.addEventListener('unhandledrejection', (e) => renderGlobalLog(`Unhandled Promise: ${e.reason}`, 'error'));

const iframePayload = function() {
    if (window.__ludusTrackerInjected) return;
    window.__ludusTrackerInjected = true;

    const sourceName = window.location.pathname.split('/').pop() || 'iframe';
    const sendLog = (level, args) => {
        const msg = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        window.parent.postMessage({ type: 'IFRAME_LOG', level, source: sourceName, message: msg }, '*');
    };

    const oLog = console.log, oWarn = console.warn, oErr = console.error;
    console.log = (...args) => { oLog(...args); sendLog('log', args); };
    console.warn = (...args) => { oWarn(...args); sendLog('warn', args); };
    console.error = (...args) => { oErr(...args); sendLog('error', args); };

    window.addEventListener('error', (e) => sendLog('error', [`Global Error: ${e.message} at ${e.filename}:${e.lineno}`]));
    window.addEventListener('unhandledrejection', (e) => sendLog('error', [`Unhandled Promise: ${e.reason}`]));

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
        try {
            const res = await origFetch(...args);
            if (!res.ok) sendLog('network', [`Fetch failed: ${args[0]} (Status: ${res.status})`]);
            return res;
        } catch (err) {
            sendLog('network', [`Fetch BLOCKED or FAILED: ${args[0]} - ${err.message}`]);
            throw err;
        }
    };
    
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('error', () => sendLog('network', [`XHR BLOCKED: ${url}`]));
        this.addEventListener('load', () => { if(this.status >= 400) sendLog('network', [`XHR Error: ${url} (Status: ${this.status})`]) });
        origOpen.apply(this, arguments);
    };
};

function attachTrackerToIframe(iframe) {
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc) return;
        
        const script = doc.createElement('script');
        script.textContent = `(${iframePayload.toString()})();`;
        doc.head.appendChild(script);
        
        renderGlobalLog(`Tracker attached to: ${iframe.id || 'Unnamed App'}`, 'log', 'SYSTEM');
    } catch (e) { }
}

document.querySelectorAll('iframe, embed[type="text/html"]').forEach(frame => {
    frame.addEventListener('load', () => attachTrackerToIframe(frame));
});

const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
        m.addedNodes.forEach(node => {
            if (node.tagName === 'IFRAME' || (node.tagName === 'EMBED' && node.type === 'text/html')) {
                node.addEventListener('load', () => attachTrackerToIframe(node));
            }
        });
    });
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'IFRAME_LOG') {
        renderGlobalLog(data.message, data.level, data.source);
    }
    
    if (data.type === 'BATCHED_IFRAME_LOGS') {
        data.logs.forEach(log => {
            renderGlobalLog(log.message, log.level, data.source);
        });
    }
    
    if (data.type === 'CONSOLE_CMD') {
        if (data.action === 'TOGGLE' || data.action === 'SHOW') {
            globalConsole.style.display = globalConsole.style.display === 'none' || globalConsole.style.display === '' ? 'flex' : 'none';
        }
        if (data.action === 'DOCK' && globalConsole.style.display === 'flex') {
            globalConsole.style.transition = 'all 0.3s ease';
            globalConsole.style.left = '240px';
            globalConsole.style.bottom = '0px';
            globalConsole.style.top = 'auto';
            globalConsole.style.right = '0px';
            globalConsole.style.width = 'calc(100vw - 240px)';
            globalConsole.style.height = '200px';
            globalConsole.style.borderRadius = '12px 0 0 0';
            setTimeout(() => { globalConsole.style.transition = 'none'; }, 300);
        }
    }
});

let isDraggingConsole = false;
let consoleOffsetX = 0, consoleOffsetY = 0;

if (consoleHandle && globalConsole) {
    consoleHandle.addEventListener('mousedown', (e) => {
        isDraggingConsole = true;
        const rect = globalConsole.getBoundingClientRect();
        consoleOffsetX = e.clientX - rect.left;
        consoleOffsetY = e.clientY - rect.top;
        consoleHandle.style.cursor = 'grabbing';
        
        globalConsole.style.width = '450px';
        globalConsole.style.height = '300px';
        globalConsole.style.borderRadius = '12px';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingConsole) return;
        e.preventDefault();
        let newX = e.clientX - consoleOffsetX;
        let newY = e.clientY - consoleOffsetY;

        newX = Math.max(0, Math.min(window.innerWidth - globalConsole.offsetWidth, newX));
        newY = Math.max(0, Math.min(window.innerHeight - globalConsole.offsetHeight, newY));

        globalConsole.style.left = newX + 'px';
        globalConsole.style.top = newY + 'px';
        globalConsole.style.right = 'auto';
        globalConsole.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDraggingConsole = false;
        if (consoleHandle) consoleHandle.style.cursor = 'grab';
    });
}

// === Volume Mixer & Independent Media Controller ===

window.changeVolume = function(target, value) {
    let frameId = target === 'music' ? 'musicFrame' : 
                  target === 'movie' ? 'moviesFrame' : null;
                  
    if (!frameId) return;

    let tgtFrame = document.getElementById(frameId);
    if (tgtFrame && tgtFrame.contentWindow) {
        tgtFrame.contentWindow.postMessage({ 
            target: target, 
            action: 'setVolume', 
            volume: parseFloat(value) 
        }, '*');
    }
};

window.mediaAction = function(target, action) {
    let frameId = target === 'music' ? 'musicFrame' : 
                  target === 'movie' ? 'moviesFrame' : null;
                  
    if (!frameId) return;

    let tgtFrame = document.getElementById(frameId);
    if (tgtFrame && tgtFrame.contentWindow) {
        tgtFrame.contentWindow.postMessage({ 
            target: target, 
            action: action 
        }, '*');
    }
};

const playIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const pauseIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="black"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.source === 'movie' || data.target === 'movie') {
        const titleEl = document.getElementById('mix-movie-title'); 
        const playBtn = document.getElementById('mix-movie-play');  
        
        if (titleEl && data.title && data.title !== "Playing Movie") {
            titleEl.textContent = data.title;
        }
        
        if (playBtn && typeof data.paused !== 'undefined') {
            playBtn.innerHTML = !data.paused ? pauseIcon : playIcon; 
        }
    }

    if (data.source === 'music' || data.target === 'music') {
        const playBtn = document.getElementById('mix-music-play');
        if (playBtn && typeof data.paused !== 'undefined') {
            playBtn.innerHTML = !data.paused ? pauseIcon : playIcon;
        }
    }
});

document.getElementById('vol-game')?.addEventListener('input', function(e) {
    const gFrame = document.getElementById('gameFrame');
    if (gFrame && gFrame.contentWindow) {
        const vol = parseFloat(e.target.value);
        
        gFrame.contentWindow.postMessage({ action: 'setGameVolume', volume: vol }, '*');
        
        try {
            const mediaEls = gFrame.contentDocument.querySelectorAll('audio, video');
            mediaEls.forEach(media => media.volume = vol);
        } catch(err) { }
    }
});
document.addEventListener('DOMContentLoaded', () => {
    const menuContainer = document.getElementById('game-menu-container');
    const dragHandle = document.getElementById('game-menu-header');
    const toggleBtn = document.getElementById('menuToggleBtn');
    const dropdown = document.getElementById('dropdownMenu');

    // 1. Dropdown Toggle (null-checked to prevent crash if element is missing)
    if (toggleBtn) toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // 2. Dragging Logic
    let isDragging = false;
    let offsetX, offsetY;

if (dragHandle) {
    dragHandle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return; 
        isDragging = true;
        offsetX = e.clientX - menuContainer.offsetLeft;
        offsetY = e.clientY - menuContainer.offsetTop;
    });
}

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        menuContainer.style.left = (e.clientX - offsetX) + 'px';
        menuContainer.style.top = (e.clientY - offsetY) + 'px';
        menuContainer.style.right = 'auto'; // Disable 'right: 20px' once moved
    });

    document.addEventListener('mouseup', () => isDragging = false);

    // 3. Audio Logic (Re-hooking your sliders)
    const gameSlider = document.getElementById('vol-game');
    const musicSlider = document.getElementById('vol-music');
    const sysSlider = document.getElementById('vol-system');

    gameSlider?.addEventListener('input', (e) => {
        const volume = parseFloat(e.target.value);
        const gameFrame = document.getElementById('game-frame');
        gameFrame?.contentWindow.postMessage({ action: 'setGameVolume', volume: volume }, '*');
    });

    musicSlider?.addEventListener('input', (e) => {
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic) bgMusic.volume = e.target.value;
    });
    
    // Add logic for dashboard, refresh, etc. here...
});
// === LAG RECOVERY SYSTEM ===
(function () {
    const LAG_THRESHOLD_MS = 80;  // a frame taking longer than this counts as slow
    const LAG_FRAMES_NEEDED = 8;  // how many slow frames in a row before acting
    const COOLDOWN_MS = 30000;    // wait 30s before triggering again

    let slowFrames = 0;
    let lastFrame = performance.now();
    let lastCleanup = 0;

    function isMusicLoaded() {
        const mf = document.getElementById('musicFrame');
        if (!mf) return false;
        const src = mf.data || mf.src || '';
        return src !== '' && !src.includes('about:blank');
    }

    function unloadInactiveFrames() {
        const active = document.querySelector('.app-section.active-section');

        document.querySelectorAll('.app-section').forEach(section => {
            if (section === active) return;
            if (section.id === 'app-music' && isMusicLoaded()) return; // keep music alive

            section.querySelectorAll('iframe, embed').forEach(el => {
                if (el.src && !el.src.includes('about:blank')) el.src = 'about:blank';
            });
            section.querySelectorAll('object').forEach(el => {
                if (el.data && !el.data.includes('about:blank')) el.data = 'about:blank';
            });
        });
    }

    function showLagToast() {
        const toast = document.createElement('div');
        toast.textContent = '⚡ Freed up background apps to improve performance.';
        toast.style.cssText = `
            position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
            background: rgba(20,20,20,0.92); color: white; padding: 10px 20px;
            border-radius: 12px; font-size: 13px; z-index: 99999;
            border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(10px);
            pointer-events: none;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function checkFrame(now) {
        const delta = now - lastFrame;
        lastFrame = now;

        if (delta > LAG_THRESHOLD_MS) {
            slowFrames++;
            if (slowFrames >= LAG_FRAMES_NEEDED && (now - lastCleanup) > COOLDOWN_MS) {
                lastCleanup = now;
                slowFrames = 0;
                unloadInactiveFrames();
                showLagToast();
            }
        } else {
            slowFrames = Math.max(0, slowFrames - 1); // decay on good frames
        }

        requestAnimationFrame(checkFrame);
    }

    requestAnimationFrame(checkFrame);
})();

// =====================================================================
// === CINEMA MODE — triggered when movie.html opens/closes its player ===
// =====================================================================
(function () {
    let _active = false;
    let _preMixerVisible = false;
    let _preDockCollapsed = false;
    let _preDockLeft = null;
    let _preDockTop = null;
    let _preDockHadDragged = false;

    function enterCinemaMode() {
        if (_active) return;
        _active = true;

        // 1. Pause music ------------------------------------------------
        try {
            const mf = document.getElementById('musicFrame');
            if (mf) {
                const doc = mf.contentDocument || (mf.contentWindow && mf.contentWindow.document);
                if (doc) {
                    const media = doc.querySelector('audio, video');
                    if (media && !media.paused) media.pause();
                } else { throw new Error('cross-origin'); }
            }
        } catch (e) {
            const mf = document.getElementById('musicFrame');
            if (mf && mf.contentWindow)
                mf.contentWindow.postMessage({ target: 'music', action: 'togglePlay' }, '*');
        }

        // 2. Slide mixer dock away --------------------------------------
        const mixer = document.getElementById('mixer-dock');
        if (mixer) {
            _preMixerVisible = (mixer.style.display !== 'none' && mixer.style.display !== '');
            if (_preMixerVisible) {
                mixer.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
                mixer.style.opacity = '0';
                mixer.style.transform = (mixer.style.transform || '') + ' translateX(130%)';
                setTimeout(() => {
                    mixer.style.display = 'none';
                    mixer.style.opacity = '';
                    mixer.style.transform = '';
                    mixer.style.transition = '';
                }, 360);
            }
        }

        // 3. Collapse + move dock to top-center -------------------------
        const dock      = document.getElementById('bottomDock');
        const container = document.getElementById('dockContainer');
        if (dock && container) {
            _preDockCollapsed   = dock.classList.contains('collapsed');
            _preDockHadDragged  = container.classList.contains('dragged');
            _preDockLeft        = container.style.left;
            _preDockTop         = container.style.top;

            // Collapse it
            if (!_preDockCollapsed) dock.classList.add('collapsed');

            // Animate to top-center
            container.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            container.style.bottom    = 'auto';
            container.style.top       = '16px';
            container.style.left      = '50%';
            container.style.transform = 'translateX(-50%)';
            container.classList.add('dragged');  // prevent auto-snap on resize
            setTimeout(() => { container.style.transition = ''; }, 420);
        }
    }

    function exitCinemaMode() {
        if (!_active) return;
        _active = false;

        // 1. Restore mixer dock -----------------------------------------
        const mixer = document.getElementById('mixer-dock');
        if (mixer && _preMixerVisible) {
            mixer.style.display    = 'block';
            mixer.style.opacity    = '0';
            mixer.style.transform  = 'translateX(130%)';
            mixer.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
            // Let the DOM paint the hidden state first, then animate in
            requestAnimationFrame(() => requestAnimationFrame(() => {
                mixer.style.opacity   = '1';
                mixer.style.transform = '';
                setTimeout(() => { mixer.style.transition = ''; }, 360);
            }));
        }

        // 2. Restore dock position + collapse state ---------------------
        const dock      = document.getElementById('bottomDock');
        const container = document.getElementById('dockContainer');
        if (dock && container) {
            // Restore collapse state
            if (!_preDockCollapsed) dock.classList.remove('collapsed');

            container.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

            if (_preDockHadDragged && _preDockLeft && _preDockTop) {
                // Was previously dragged to a custom spot — go back there
                container.style.left      = _preDockLeft;
                container.style.top       = _preDockTop;
                container.style.bottom    = 'auto';
                container.style.transform = '';
            } else {
                // Default: bottom center
                container.classList.remove('dragged');
                container.style.left      = '50%';
                container.style.top       = 'auto';
                container.style.bottom    = '20px';
                container.style.transform = 'translateX(-50%)';
            }

            setTimeout(() => { container.style.transition = ''; }, 420);
        }
    }

    // Listen for movie player events
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.source !== 'ludus-movie') return;
        if (data.action === 'playerOpened') enterCinemaMode();
        else if (data.action === 'playerClosed') exitCinemaMode();
    });
})();
// ── Credits (extracted from index.html) ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
(function(){
                            var G=[{"n":"Bowmasters","a":"Azur Games, Playgendary","l":"https://azurgames.com"},{"n":"OvO","a":"Dedra Games","l":"https://dedragames.com"},{"n":"OvO 2","a":"Dedra Games","l":"https://dedragames.com"},{"n":"OvO 3 Dimensions","a":"Dedra Games","l":"https://dedragames.com"},{"n":"Gladihoppers","a":"Dreamon Studios","l":"https://dreamonstudios.itch.io/gladihoppers"},{"n":"Ice Dodo","a":"Onionfist Studio","l":"https://onionfist.com"},{"n":"Block Blast","a":"reunbozdo","l":"https://reunbozdo.github.io"},{"n":"Jetpack Joyride","a":"Halfbrick Studios","l":"https://www.halfbrick.com"},{"n":"Friday Night Funkin","a":"ninja-muffin24","l":"https://ninja-muffin24.itch.io/funkin"},{"n":"Sprunki","a":"NyankoBfLol","l":"https://www.cocrea.world/@NyankoBfLmao"},{"n":"Temple Run 2","a":"Imangi STUDIOS","l":"https://imangistudios.com"},{"n":"Stickman Hook","a":"Madbox","l":"https://madbox.io"},{"n":"Attack Hole","a":"Homa Games","l":"https://www.homagames.com"},{"n":"Bridge Race","a":"QubicGames","l":"https://qubicgames.com"},{"n":"Color Water Sort 3D","a":"Tapnation","l":"https://www.tap-nation.io"},{"n":"Hide N Seek","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/developer?id=Supersonic+Studios+LTD"},{"n":"Magic Tiles 3","a":"AmaNotes","l":"https://play.google.com/store/apps/details?id=com.youmusic.magictiles"},{"n":"Stacky Dash","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.Born2Play.StackyDash"},{"n":"Supreme Duelist","a":"Neron's Brother","l":"https://neronsbrother.com"},{"n":"Tall Man Run","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.VectorUpGames.TallManRun"},{"n":"Turbo Stars","a":"https://play.google.com/store/apps/details?id=com.turbo.stars","l":"SayGames"},{"n":"Mob Control HTML5","a":"Voodoo","l":"https://voodoo.io"},{"n":"Pou","a":"Zakeh","l":"https://play.google.com/store/apps/details?id=me.pou.app"},{"n":"Crossy Road","a":"Hipster Whale","l":"https://www.hipsterwhale.com"},{"n":"Basket Battle","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.noorgames.basketbattle"},{"n":"Amaze","a":"CrazyLabs","l":"https://play.google.com/store/apps/details?id=com.crazylabs.amaze.game"},{"n":"Geometry Dash Lite (REMAKE)","a":"RobTop Games","l":"https://play.google.com/store/apps/details?id=com.robtopx.geometryjumplite"},{"n":"Basketball Frvr","a":"FRVR","l":"https://play.google.com/store/apps/details?id=com.frvr.basketball"},{"n":"Bazooka Boy","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.Lightneer.BazookaBoy"},{"n":"Bottle Jump 3D","a":"CASUAL AZUR GAMES","l":"https://play.google.com/store/apps/details?id=com.games.bottle"},{"n":"Color Match","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/developer?id=Supersonic+Studios+LTD&hl=en_US"},{"n":"Dig Deep","a":"CrazyLabs LTD","l":"https://play.google.com/store/apps/dev?id=6443412597262225303&hl=en_US"},{"n":"Retro Bowl","a":"New Star Games","l":"https://www.newstargames.com/"},{"n":"Retro Bowl College","a":"New Star Games","l":"https://www.newstargames.com/"},{"n":"Monster Tracks","a":"Fancade","l":"https://fancade.com/"},{"n":"Gobble","a":"Fancade","l":"https://fancade.com/"},{"n":"Five Nights at Freddy's","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Five Nights at Freddy's 2","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Five Nights at Freddy's 3","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Five Nights at Freddy's 4","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Road of Fury","a":"IriySoft","l":"https://iriysoft.newgrounds.com/"},{"n":"Driven Wild","a":"KilledByAPixel","l":"https://killedbyapixel.newgrounds.com/"},{"n":"Ragdoll Hit","a":"Kids Games LLC","l":"https://play.google.com/store/apps/dev?id=6566434917716295659&hl=en_US"},{"n":"Vex 1","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 2","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 3","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 3 XMAS","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 4","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 5","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 6","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 7","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex 8","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex Challenges","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex X3M","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"Vex X3M 2","a":"Lorenzo De Carlo","l":"https://nl.linkedin.com/in/lorenzodecarlo"},{"n":"1v1.LoL","a":"JustPlay.LOL","l":"https://play.google.com/store/apps/dev?id=7065081805875144950"},{"n":"A Dance of Fire and Ice","a":"fizzd","l":"https://fizzd.itch.io/"},{"n":"Achievement Unlocked","a":"jmtb02","l":"https://jmtb02.newgrounds.com/"},{"n":"Achievement Unlocked 2","a":"jmtb02","l":"https://jmtb02.newgrounds.com/"},{"n":"Achievement Unlocked 3","a":"jmtb02","l":"https://jmtb02.newgrounds.com/"},{"n":"Angry Birds","a":"Rovio Entertainment","l":"https://www.rovio.com/"},{"n":"Backrooms","a":"Esyverse","l":"https://esyverse.itch.io/"},{"n":"Baldi's Basics","a":"Basically Games","l":"https://basically-games.itch.io/baldis-basics"},{"n":"Basket Random","a":"RHM Interactive OÜ","l":"https://play.google.com/store/apps/dev?id=9182049342574405049&hl=en_US"},{"n":"Big Tower Tiny Square","a":"EvilObjective","l":"https://evilobjective.itch.io"},{"n":"Big NEON Tower Tiny Square","a":"EvilObjective","l":"https://evilobjective.itch.io"},{"n":"Big ICE Tower Tiny Square","a":"EvilObjective","l":"https://evilobjective.itch.io"},{"n":"BitLife","a":"Candywriter","l":"https://candywriter.com"},{"n":"Bloons TD","a":"Ninja Kiwi","l":"https://ninjakiwi.com"},{"n":"Bloons TD 2","a":"Ninja Kiwi","l":"https://ninjakiwi.com"},{"n":"Bloons TD 3","a":"Ninja Kiwi","l":"https://ninjakiwi.com"},{"n":"Bloons TD 4","a":"Ninja Kiwi","l":"https://ninjakiwi.com"},{"n":"Bloons TD 5","a":"Ninja Kiwi","l":"https://ninjakiwi.com"},{"n":"Bob The Robber 2","a":"Meow Beast","l":"https://www.newgrounds.com/portal/view/585767"},{"n":"Boxing Random","a":"RHM Interactive","l":"https://www.twoplayergames.org"},{"n":"Burrito Bison: Launcha Libre","a":"Juicy Beast","l":"https://juicybeast.com"},{"n":"Cannon Basketball","a":"Oleh \"qzix13\" Kuzyk","l":"https://ua.linkedin.com/in/olehkuzyk"},{"n":"Cannon Basketball 2","a":"Oleh \"qzix13\" Kuzyk","l":"https://ua.linkedin.com/in/olehkuzyk"},{"n":"Cluster Rush","a":"Landfall","l":"https://landfall.se"},{"n":"Cookie Clicker","a":"Orteil","l":"https://orteil.dashnet.org"},{"n":"Coreball","a":"Ben Vinegar","l":"https://benv.ca/"},{"n":"Cubefield","a":"Max Abernethy","l":"https://max-abernethy.newgrounds.com/"},{"n":"Cut the Rope","a":"ZeptoLab","l":"https://www.zeptolab.com"},{"n":"Draw Climber","a":"VOODOO","l":"https://voodoo.io"},{"n":"Emulator.JS","a":"Ethan O'Brien","l":"https://emulatorjs.org/"},{"n":"Fireboy and Watergirl 2","a":"Oslo Albet","l":"https://www.osloalbet.com"},{"n":"Fireboy and Watergirl 3","a":"Oslo Albet","l":"https://www.osloalbet.com"},{"n":"Granny","a":"DVloper","l":"https://grannyhorror.com"},{"n":"Gunspin","a":"minijuegos.com","l":"https://www.minijuegos.com/"},{"n":"Highway Racer 2","a":"Bone Cracker Games","l":"https://www.bonecrackergames.com/"},{"n":"Johnny Trigger","a":"SayGames","l":"https://say.games"},{"n":"Journey Downhill","a":"Megagon Industries","l":"https://megagonindustries.com/"},{"n":"Line Rider","a":"Boštjan Čadež","l":"https://fsk.deviantart.com"},{"n":"Moto X3M","a":"MadPuffers","l":"https://www.madpuffers.com"},{"n":"Moto X3M 2","a":"MadPuffers","l":"https://www.madpuffers.com"},{"n":"Moto X3M 3","a":"MadPuffers","l":"https://www.madpuffers.com"},{"n":"Moto X3M Spooky","a":"MadPuffers","l":"https://www.madpuffers.com"},{"n":"Moto X3M Winter","a":"MadPuffers","l":"https://www.madpuffers.com"},{"n":"Ninja vs EvilCorp","a":"Rémi Vansteelandt","l":"https://remvst.com"},{"n":"Paper.io 2","a":"VOODOO","l":"https://voodoo.io"},{"n":"The World's Hardest Game","a":"Stevie Critoph","l":"https://stephencritoph.com/"},{"n":"The World's Hardest Game 3","a":"Stevie Critoph","l":"https://stephencritoph.com/"},{"n":"The World's Hardest Game 4","a":"Stevie Critoph","l":"https://stephencritoph.com/"},{"n":"This Is The Only Level","a":"jmtb02","l":"https://jmtb02.newgrounds.com/"},{"n":"This Is The Only Level 2","a":"jmtb02","l":"https://jmtb02.newgrounds.com/"},{"n":"Tiny Fishing","a":"Winter Studio","l":"https://winterstudio.com/"},{"n":"Tomb Of The Mask","a":"Happymagenta UAB","l":"https://happymagenta.com/"},{"n":"Toss The Turtle","a":"GonzoSSM","l":"https://gonzossm.com"},{"n":"Tube Jumpers","a":"New Eich Games","l":"https://www.neweichgames.com/"},{"n":"Wordle","a":"New York Times","l":"https://www.nytimes.com/games/wordle/index.html"},{"n":"Ruffle","a":"Mike Welsh","l":"https://ruffle.rs/"},{"n":"2048","a":"Gabriele Cirulli","l":"https://github.com/gabrielecirulli"},{"n":"8 Ball Pool","a":"Miniclip.com","l":"https://miniclip.com/"},{"n":"Offroad Mountain Bike","a":"RHM Interactive OÜ","l":"https://play.google.com/store/apps/dev?id=9182049342574405049&hl=en_US"},{"n":"Space Waves","a":"do.games","l":"https://play.google.com/store/apps/dev?id=8163162718412732005&hl=en_US"},{"n":"Solar Smash","a":"Paradyme Games","l":"https://play.google.com/store/apps/details?id=com.paradyme.solarsmash&hl=en_US"},{"n":"Snow Rider 3D","a":"gamebiz","l":"https://gamebiz.com/"},{"n":"Fortzone Battle Royale","a":"Mirra Games","l":"https://mirragames.com/"},{"n":"Brawl Guys.io","a":"Lagged","l":"https://lagged.com"},{"n":"Survival Race","a":"Brain Massage","l":"https://play.google.com/store/apps/dev?id=7174485743246221107"},{"n":"Poly Track","a":"Kodub","l":"https://www.kodub.com"},{"n":"Moto X3M Pool Party","a":"MadPuffers","l":"http://madpuffers.com/"},{"n":"Granny 2","a":"DVloper","l":"https://play.google.com/store/apps/developer?id=DVloper&hl=en_US"},{"n":"Granny 3","a":"DVloper","l":"https://play.google.com/store/apps/developer?id=DVloper&hl=en_US"},{"n":"Fashion Battle","a":"Apps Mobile Games","l":"https://play.google.com/store/apps/dev?id=4672672872255695418&hl=en_US"},{"n":"Slice it All","a":"VOODOO","l":"https://play.google.com/store/apps/developer?id=VOODOO&hl=en_US"},{"n":"Flappy Bird","a":"Dong Nguyen","l":"https://x.com/dongatory"},{"n":"osu!","a":"ppy","l":"https://osu.ppy.sh/"},{"n":"8 Ball Classic","a":"Famobi","l":"https://play.google.com/store/apps/details?id=com.famobi.eightballbilliardsclassic"},{"n":"Angry Birds Showdown","a":"Rovio Entertainment","l":"https://www.rovio.com"},{"n":"Archery World Tour","a":"Famobi","l":"https://play.google.com/store/apps/details?id=com.famobi.archeryworldtour"},{"n":"Ball Blast","a":"Voodoo","l":"https://play.google.com/store/apps/details?id=com.nomonkeys.ballblast"},{"n":"Cannon Balls 3D","a":"Famobi","l":"https://play.google.com/store/apps/details?id=com.famobi.cannonballs3d"},{"n":"Chess Classic","a":"Famobi","l":"https://play.google.com/store/apps/details?id=com.famobi.chessclassic"},{"n":"Draw the Line","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.friendsgamesincubator.drawtheline"},{"n":"Flappy Dunk","a":"Voodoo","l":"https://play.google.com/store/apps/details?id=com.acidcousins.fdunk"},{"n":"Fork n Sausage","a":"SayGames","l":"https://play.google.com/store/apps/details?id=com.kadka.forknsausage"},{"n":"Guess Their Answer","a":"TapNation","l":"https://play.google.com/store/apps/details?id=com.qoni.guesstheiranswer"},{"n":"Harvest.io","a":"CASUAL AZUR GAMES","l":"https://play.google.com/store/apps/details?id=com.harvest.io"},{"n":"Hill Climb Racing Lite","a":"Fingersoft","l":"https://play.google.com/store/apps/details?id=com.fingersoft.hillclimb"},{"n":"Pac-Man Superfast","a":"RedFox Games","l":"https://www.playredfox.com"},{"n":"Parking Rush","a":"Nine&Nine","l":"https://play.google.com/store/apps/details?id=com.tianninenine.parkingrush"},{"n":"Race Master 3D","a":"Beresnev Games","l":"https://play.google.com/store/apps/details?id=com.easygames.race"},{"n":"State.io","a":"CASUAL AZUR GAMES","l":"https://play.google.com/store/apps/details?id=io.state.fight"},{"n":"Tower Crash 3D","a":"Famobi","l":"https://play.google.com/store/apps/details?id=com.famobi.towercrash3d"},{"n":"Trivia Crack","a":"etermax","l":"https://play.google.com/store/apps/details?id=com.etermax.preguntados.lite"},{"n":"Crazy Cattle 3D","a":"4nn4t4t","l":"https://4nn4t4t.itch.io/crazycattle3d"},{"n":"Cheese Chompers 3D","a":"NavaNoid","l":"https://cheesechompers3d.itch.io/cheese-chompers-3d"},{"n":"Bad Parenting 1","a":"98corbins","l":"https://98corbins.netlify.app"},{"n":"Blade Ball","a":"??","l":""},{"n":"Blocky Snakes","a":"Beedo Games","l":"https://poki.com/en/g/blocky-snakes"},{"n":"Bloxorz","a":"Damien Clarke","l":"https://damienclarke.me"},{"n":"Big Tower Tiny Square 2","a":"EO Interactive","l":"https://apps.apple.com/my/developer/eo-interactive-ltd/id457003279"},{"n":"Candy Crush","a":"King.com","l":"https://www.king.com/game/candycrush"},{"n":"Melon Playground","a":"playducky.com","l":"https://playducky.com"},{"n":"Drift Hunters","a":"Illia Kaminetskyi","l":"https://ilyakaminetsky.itch.io/drift-hunters"},{"n":"World Box","a":"Kendja","l":"https://www.newgrounds.com/portal/view/603435"},{"n":"Run 1","a":"Joseph Cloutier","l":"https://player03.com"},{"n":"Run 2","a":"Joseph Cloutier","l":"https://player03.com"},{"n":"Run 3","a":"Joseph Cloutier","l":"https://player03.com"},{"n":"Swords and Souls","a":"Armor Games","l":"https://armorgames.com/play/17817/swords-and-souls"},{"n":"Soundboard","a":"genizy","l":"https://github.com/genizy/soundboard/"},{"n":"n-gon","a":"landgreen","l":"https://github.com/landgreen/n-gon"},{"n":"Minecraft 1.8.8","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Minecraft 1.12.2","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Minecraft 1.21.4","a":"zardoy","l":"https://github.com/zardoy/minecraft-web-client"},{"n":"Five Nights at Freddy's: Sister Location","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Ragdoll Archers","a":"Ericetto","l":"https://www.snokido.com/author/ericetto"},{"n":"Papers, Please","a":"Lucas Pope","l":"https://dukope.com"},{"n":"Scrap Metal 3","a":"Ciorbyn","l":"https://www.ciorbynstudio.com"},{"n":"Five Nights at Freddy's: World","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Five Nights at Freddy's: Pizza Simulator","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Five Nights at Freddy's: Ultimate Custom Night","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Do NOT Take This Cat Home","a":"Pixelliminal","l":"https://pixeliminal.itch.io/do-not-take-this-cat-home"},{"n":"People Playground","a":"Studio Minus, 98corbins","l":"https://store.steampowered.com/app/1118200/"},{"n":"R.E.P.O","a":"semiwork, 98corbins","l":"https://store.steampowered.com/app/3241660/"},{"n":"ULTRAKILL","a":"New Blood Interactive, Cake Logic","l":"https://sites.google.com/view/cakelogic"},{"n":"Elastic Man","a":"David Li","l":"https://david.li"},{"n":"Slope","a":"coweggs","l":"https://coweggs.itch.io/slope-plus"},{"n":"Time Shooter 1","a":"g80g","l":"https://g80g.com"},{"n":"Time Shooter 2","a":"g80g","l":"https://g80g.com"},{"n":"Time Shooter 3: SWAT","a":"g80g","l":"https://g80g.com"},{"n":"Carrom Clash","a":"GameSnacks","l":"https://gamesnacks.com/games/carromclash"},{"n":"DOOM","a":"Id Software","l":"https://www.idsoftware.com"},{"n":"Five Nights at Winston's","a":"lax1dude","l":"https://lax1dude.net"},{"n":"Buckshot Roulette","a":"Mike Klubnika","l":"https://mikeklubnika.itch.io/buckshot-roulette"},{"n":"Tunnel Rush","a":"Deer Cat Games","l":"http://www.deercatgames.com"},{"n":"Snowbattle.io","a":"Royalec/Tokyo","l":"https://google.com/search?q=Tokyo+Royalec"},{"n":"Rolly Vortex","a":"Voodoo","l":"https://play.google.com/store/apps/details?id=com.bdj.vortexDroid&hl=en_US"},{"n":"Draw the Hill","a":"Stelennnn","l":"https://play.google.com/store/apps/details?id=xyz.gameshtml5.drawathehill&hl=en_US"},{"n":"Dragon vs Bricks","a":"Voodoo","l":"https://voodoo.io"},{"n":"Death Run 3D","a":"kevin.wang","l":"https://play.google.com/store/apps/details?id=com.kevin.deathrun3d&hl=en_US"},{"n":"Cut the Rope","a":"ZeptoLab","l":"https://www.zeptolab.com"},{"n":"Cut the Rope: Time Travel","a":"ZeptoLab","l":"https://www.zeptolab.com"},{"n":"Cut the Rope: Holiday Gift","a":"ZeptoLab","l":"https://www.zeptolab.com"},{"n":"Bendy and the Ink Machine","a":"Joey Drew Studios","l":"https://www.joeydrewstudios.com/batim"},{"n":"That's Not My Neighbor","a":"Nacho Games","l":"https://store.steampowered.com/app/3431040/Thats_not_my_Neighbor/"},{"n":"Hotline Miami","a":"Dennaton Games","l":"https://store.steampowered.com/app/219150/Hotline_Miami/"},{"n":"Papa's Bakeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Burgeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Cheeseria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Cupcakeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Donuteria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Freezeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Hot Doggeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Pancakeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Pastaria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Pizeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Scooperia","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Sushiria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Taco Mia","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Papa's Wingeria","a":"Flipline Studios","l":"https://www.flipline.com"},{"n":"Plants vs Zombies","a":"PopCap Games","l":"https://www.ea.com/ea-studios/popcap/plants-vs-zombies"},{"n":"Superhot","a":"Superhot Team","l":"https://superhotgame.com"},{"n":"Duck Life","a":"Mad.com","l":"https://mad.com"},{"n":"Duck Life 2","a":"Mad.com","l":"https://mad.com"},{"n":"Duck Life 3","a":"Mad.com","l":"https://mad.com"},{"n":"Duck Life 4","a":"Mad.com","l":"https://mad.com"},{"n":"Duck Life 5","a":"Mad.com","l":"https://mad.com"},{"n":"Red Ball","a":"Yohoho Games","l":"https://yohoho.games"},{"n":"Red Ball 2","a":"Yohoho Games","l":"https://yohoho.games"},{"n":"Red Ball 3","a":"Yohoho Games","l":"https://yohoho.games"},{"n":"Red Ball 4","a":"Yohoho Games","l":"https://yohoho.games"},{"n":"Red Ball 4 Vol. 2","a":"Yohoho Games","l":"https://yohoho.games"},{"n":"Red Ball 4 Vol. 3","a":"Yohoho Games","l":"https://yohoho.games"},{"n":"Wheely","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 2","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 3","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 4","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 5","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 6","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 7","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Wheely 8","a":"Pegas Games","l":"http://www.pegasgames.com"},{"n":"Chat Bot AI (A.I GPT)","a":"gn-math","l":"https://gn-math.dev"},{"n":"Crazy Chicken 3D","a":"Teasle","l":"https://teasle.itch.io/crazychicken3d"},{"n":"Crazy Kitty 3D","a":"Teasle","l":"https://teasle.itch.io/crazykitty3d"},{"n":"Google Baseball","a":"Google","l":"https://google.com"},{"n":"A Bite at Freddy's","a":"Garrett McKay","l":"https://garrett-mckay.itch.io/a-bite-at-freddys"},{"n":"Class of '09","a":"sbn3","l":"https://sbn3.com"},{"n":"RE:RUN","a":"DaniDev","l":"https://danidev.itch.io/rerun"},{"n":"Fruit Ninja","a":"Halfbrick Studios","l":"https://www.halfbrick.com/games/fruit-ninja-classic"},{"n":"Half Life","a":"Valve","l":"https://www.valvesoftware.com/en/"},{"n":"Quake III Arena","a":"Id Software","l":"https://www.idsoftware.com/en"},{"n":"Escape Road","a":"AzGames","l":"https://azgames.io/escape-road"},{"n":"Escape Road 2","a":"AzGames","l":"https://azgames.io/escape-road-2"},{"n":"Speed Stars","a":"Luke Doukakis","l":"https://store.steampowered.com/app/1482700/Speed_Stars/"},{"n":"Pizza Tower","a":"Tour De Pizza, BurnedPopcorn","l":"https://store.steampowered.com/app/2231450/Pizza_Tower/"},{"n":"Bacon May Die","a":"SnoutUp","l":"https://store.steampowered.com/app/646240/Bacon_May_Die/"},{"n":"Bad Ice Cream","a":"Nitrome","l":"https://poki.com/en/g/bad-ice-cream"},{"n":"Bad Ice Cream 2","a":"Nitrome","l":"https://poki.com/en/g/bad-ice-cream-2"},{"n":"Bad Ice Cream 3","a":"Nitrome","l":"https://poki.com/en/g/bad-ice-cream-3"},{"n":"Basketball Stars","a":"MadPuffers","l":"https://poki.com/en/g/basketball-stars"},{"n":"BlockPost","a":"SkullCap Studios","l":"https://poki.com/en/g/blockpost"},{"n":"CircloO","a":"Florian van Strien","l":"https://florianvanstrien.nl"},{"n":"CircloO 2","a":"Florian van Strien","l":"https://florianvanstrien.nl"},{"n":"Drift Boss","a":"marketjs","l":"https://www.marketjs.com"},{"n":"Evil Glitch","a":"agar3s","l":"https://github.com/agar3s"},{"n":"Madalin Stunt Cars 2","a":"Madalin Games","l":"https://www.madalingames.com"},{"n":"Madalin Stunt Cars 3","a":"Madalin Games","l":"https://www.madalingames.com"},{"n":"Papery Planes","a":"Akos Makovics","l":"http://akos-makovics.com"},{"n":"Pixel Gun Survival","a":"Mentolatux","l":"https://www.fiverr.com/mentolatux"},{"n":"Protektor","a":"rujogames","l":"https://rujogames.itch.io/protektor"},{"n":"Rooftop Snipers","a":"New Eich Games","l":"https://www.neweichgames.com"},{"n":"War The Knights","a":"BANZAI","l":"https://banzai.games/en/"},{"n":"Basket Bros","a":"Blue Wizard Digital","l":"https://bluewizard.com"},{"n":"Endoparasitic","a":"Deep Root Interactive","l":"https://store.steampowered.com/app/2124780/Endoparasitic/"},{"n":"Riddle School","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Riddle School 2","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Riddle School 3","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Riddle School 4","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Riddle School 5","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Riddle Transfer","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Riddle Transfer 2","a":"JonBro","l":"https://jonbro.newgrounds.com"},{"n":"Idle Dice","a":"Lutz Schönfelder","l":"https://github.com/luts91"},{"n":"12 Mini Battles","a":"Shared Dreams Studio","l":"https://play.google.com/store/apps/dev?id=6107531068522107777&hl=en_US"},{"n":"Minecraft 1.5.2","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Minecraft Alpha 1.2.6","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Minecraft Beta 1.3","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Minecraft Beta 1.7.3","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Minecraft Indev","a":"lax1dude","l":"https://eaglercraft.com"},{"n":"Little Runmo","a":"juhosprite, gooseworx","l":"https://juhosprite.itch.io/little-runmo"},{"n":"Territorial.io","a":"TTCreator","l":"https://play.google.com/store/apps/dev?id=8652009334379030762"},{"n":"Alien Hominid","a":"Tom Fulp, Dan Paladin","l":"https://www.newgrounds.com/portal/view/59593"},{"n":"Tanuki Sunset","a":"Rewind Games","l":"https://store.steampowered.com/app/1251460/Tanuki_Sunset/"},{"n":"Shipo.io","a":"OnRush Studio","l":"https://onrush.studio"},{"n":"Rainbow Obby","a":"emolingo games","l":"https://emolingo.games"},{"n":"Nazi Zombies: Portable","a":"nzp team","l":"https://nzp-team.itch.io/nazi-zombies-portable"},{"n":"Sandboxels","a":"R74N","l":"https://store.steampowered.com/app/3664820/Sandboxels/"},{"n":"Dreadhead Parkour","a":"GameTornado","l":"https://gametornado.com/"},{"n":"Sandtris","a":"FRANCO MIRANDA","l":"https://francomiranda.com"},{"n":"BlackJack","a":"Synic-dx","l":"https://github.com/Synic-dx/blackJack/"},{"n":"Minesweeper Mania","a":"gamesnacks","l":"https://gamesnacks.com"},{"n":"Super Mario 63","a":"Runouw","l":"https://runouw.com/games/"},{"n":"Jelly Mario","a":"Schteppe","l":"https://x.com/schteppe"},{"n":"Angry Birds Chrome","a":"Rovio","l":"https://rovio.com"},{"n":"sandspiel","a":"maxbittker","l":"https://x.com/maxbittker"},{"n":"Side Effects","a":"hi rohun, Mr.Pootsley, Jaybooty","l":"https://hirohun.itch.io/side-effects"},{"n":"Build a Queen","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.Polystation.BuildABabe"},{"n":"3D Bowling","a":"Italic Games","l":"https://play.google.com/store/apps/details?id=com.threed.bowling"},{"n":"Room Sort","a":"Gamincat","l":"https://play.google.com/store/apps/details?id=com.gamincat.roomsort"},{"n":"Sushi Roll","a":"Famobi","l":"https://play.google.com/store/apps/details?id=com.famobi.suhsiroll"},{"n":"Find the Alien","a":"MOONEE PUBLISHING LTD","l":"https://play.google.com/store/apps/details?id=net.wyvernware.whosthealien"},{"n":"Maze Speedrun","a":"Raval Matic","l":"https://www.ravalmatic.com"},{"n":"Kitchen Bazar","a":"Gameloft","l":"https://www.gameloft.com"},{"n":"Pokey Ball","a":"Voodoo","l":"https://play.google.com/store/apps/details?id=com.lawson.poke"},{"n":"Slime.io","a":"GameSnacks","l":"https://gamesnacks.com/games/slime-io"},{"n":"Om Nom Run","a":"ZeptoLab","l":"https://play.google.com/store/apps/details?id=com.zeptolab.omnomrun.google"},{"n":"TileTopia","a":"GameSnacks","l":"https://gamesnacks.com/games/6nilllqpgkm6o"},{"n":"BitPlanes","a":"Anton Medvedev","l":"https://medv.io"},{"n":"Crazy Cars","a":"No Pressure Studios","l":"https://www.nopressurestudios.com"},{"n":"Fancy Pants Adventure","a":"Brad Borne","l":"https://www.bornegames.com"},{"n":"Fancy Pants Adventure 2","a":"Brad Borne","l":"https://www.bornegames.com"},{"n":"Fancy Pants Adventure 3","a":"Brad Borne","l":"https://www.bornegames.com"},{"n":"Fancy Pants Adventure 4 Part 1","a":"Brad Borne","l":"https://www.bornegames.com"},{"n":"Fancy Pants Adventure 4 Part 2","a":"Brad Borne","l":"https://www.bornegames.com"},{"n":"Getaway Shootout","a":"New Eich Games","l":"https://www.neweichgames.com"},{"n":"House of Hazards","a":"New Eich Games","l":"https://www.neweichgames.com"},{"n":"Learn to Fly","a":"Light Bringer Games","l":"http://lightbringergames.com"},{"n":"Learn to Fly 2","a":"Light Bringer Games","l":"http://lightbringergames.com"},{"n":"Learn to Fly 3","a":"Light Bringer Games","l":"http://lightbringergames.com"},{"n":"Learn to Fly Idle","a":"Light Bringer Games","l":"http://lightbringergames.com"},{"n":"Raft Wars","a":"GaZZer Game","l":"https://play.google.com/store/apps/dev?id=8915125137205442318"},{"n":"Raft Wars 2","a":"GaZZer Game","l":"https://play.google.com/store/apps/dev?id=8915125137205442318"},{"n":"Sort the Court","a":"graebor","l":"https://x.com/graebor"},{"n":"SpiderDoll","a":"Ysopprod","l":"https://ysopprod.newgrounds.com"},{"n":"They Are Coming","a":"OnHit Developments","l":"https://play.google.com/store/apps/details?id=dev.onhit.theyarecoming"},{"n":"Spiral Roll","a":"Voodoo","l":"https://play.google.com/store/apps/details?id=com.Celltop.SpiralRoll"},{"n":"Binding of Issac: Wrath of the Lamb","a":"Edmund McMillen","l":"https://store.steampowered.com/app/113204/Binding_of_Isaac_Wrath_of_the_Lamb/"},{"n":"Happy Sheepies","a":"Berker Games","l":"https://berkergames.itch.io/happy-sheepies"},{"n":"DON'T YOU LECTURE ME","a":"GD Colon","l":"https://thirtydollar.website"},{"n":"Blumgi Rocket","a":"Blumgi","l":"https://blumgi.com"},{"n":"Adventure Capatalist","a":"Hyper Hippo Games","l":"https://store.steampowered.com/app/346900/AdVenture_Capitalist/"},{"n":"Dadish 2","a":"Thomas K. Young","l":"https://x.com/tommy_ill"},{"n":"Dadish 3","a":"Thomas K. Young","l":"https://x.com/tommy_ill"},{"n":"Dadish","a":"Thomas K. Young","l":"https://x.com/tommy_ill"},{"n":"Dadish 3D","a":"Thomas K. Young","l":"https://x.com/tommy_ill"},{"n":"Daily Dadish","a":"Thomas K. Young","l":"https://x.com/tommy_ill"},{"n":"EvoWars.io","a":"Night Steed S.C.","l":"https://play.google.com/store/apps/dev?id=6316404222579633373"},{"n":"Google Feud","a":"Justin Hook","l":"https://justinhook.com"},{"n":"Idle Breakout","a":"Kodiqi","l":"https://kodiqi.itch.io"},{"n":"Idle Lumber Inc","a":"NoPowerUp","l":"https://nopowerup.com/our-game/"},{"n":"Idle Mining Empire","a":"marketjs","l":"https://www.marketjs.com/"},{"n":"JustFall.lol","a":"JustPlay.LOL","l":"https://play.google.com/store/apps/dev?id=7065081805875144950"},{"n":"Merge Harvest","a":"idfk","l":"https://gn-math.github.io"},{"n":"Parking Fury 3D","a":"Brain Software","l":"https://poki.com/en/g/parking-fury-3d"},{"n":"Slope 2","a":"idfk","l":"https://gn-math.github.io"},{"n":"Slowroads","a":"Topograph Interactive","l":"https://store.steampowered.com/app/3431300/Slow_Roads/"},{"n":"Smash Karts","a":"Tall Team","l":"https://tall.team/"},{"n":"Stickman Fight Ragdoll","a":"Vanorium","l":"https://playem.io/dev/vanorium"},{"n":"Stickman Boost","a":"y8","l":"https://www.y8.com/games/stickman_boost"},{"n":"Stickman Climb","a":"No Pressure Studios","l":"https://www.nopressurestudios.com"},{"n":"Stickman Golf","a":"NoodleCake","l":"https://noodlecake.com"},{"n":"2048 Merge Run","a":"Yandex","l":"https://yandex.com/games"},{"n":"Build a Big Army","a":"Yandex","l":"https://yandex.com/games"},{"n":"Build a Plane","a":"Yandex","l":"https://yandex.com/games"},{"n":"Camouflage and Sniper","a":"Yandex","l":"https://yandex.com/games"},{"n":"Car Survival 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"City Defense","a":"Yandex","l":"https://yandex.com/games"},{"n":"Clothing Shop 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Cool Cars Run 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Crush Cars 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Destiny Run 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Destroy The Car 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Diamond Seeker","a":"Yandex","l":"https://yandex.com/games"},{"n":"Draw Joust","a":"Yandex","l":"https://yandex.com/games"},{"n":"Evolving Bombs 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Fire and Frost Master","a":"Yandex","l":"https://yandex.com/games"},{"n":"Fitness Empire","a":"Yandex","l":"https://yandex.com/games"},{"n":"Flick Goal","a":"Yandex","l":"https://yandex.com/games"},{"n":"Flip Master","a":"Yandex","l":"https://yandex.com/games"},{"n":"Giant Wanted","a":"Yandex","l":"https://yandex.com/games"},{"n":"Gun Clone","a":"Yandex","l":"https://yandex.com/games"},{"n":"Gun Runner","a":"Yandex","l":"https://yandex.com/games"},{"n":"Kaji Run","a":"Yandex","l":"https://yandex.com/games"},{"n":"Make a SuperBoat","a":"Yandex","l":"https://yandex.com/games"},{"n":"Makeover Run","a":"Yandex","l":"https://yandex.com/games"},{"n":"Mega Car Jumps","a":"Yandex","l":"https://yandex.com/games"},{"n":"Money Rush","a":"Yandex","l":"https://yandex.com/games"},{"n":"Monster Box 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Office Fight","a":"Yandex","l":"https://yandex.com/games"},{"n":"Robot Invasion","a":"Yandex","l":"https://yandex.com/games"},{"n":"Seat Jam 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Shooting Master","a":"Yandex","l":"https://yandex.com/games"},{"n":"Supermarket 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Survive to Victory","a":"Yandex","l":"https://yandex.com/games"},{"n":"Telekinesis Attack","a":"Yandex","l":"https://yandex.com/games"},{"n":"Telekinesis Car","a":"Yandex","l":"https://yandex.com/games"},{"n":"Telekinesis Drive","a":"Yandex","l":"https://yandex.com/games"},{"n":"Telekinesis","a":"Yandex","l":"https://yandex.com/games"},{"n":"Tug of War with Cars","a":"Yandex","l":"https://yandex.com/games"},{"n":"Twerk Race 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Twisted Rope 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"Wall Crawler","a":"Yandex","l":"https://yandex.com/games"},{"n":"War Regions","a":"Yandex","l":"https://yandex.com/games"},{"n":"Weapon Craft Run","a":"Yandex","l":"https://yandex.com/games"},{"n":"Weapon Upgrade Rush","a":"Yandex","l":"https://yandex.com/games"},{"n":"Weapon Scale","a":"Yandex","l":"https://yandex.com/games"},{"n":"Rich Run 3D","a":"Yandex","l":"https://yandex.com/games"},{"n":"High Heels","a":"Yandex","l":"https://yandex.com/games"},{"n":"WebFishing","a":"LameDev","l":"https://store.steampowered.com/app/3146520/WEBFISHING/"},{"n":"Andy's Apple Farm","a":"M36games","l":"https://m36games.itch.io/applefarm"},{"n":"OMORI","a":"Omocat","l":"https://omocat.com"},{"n":"Five Nights at Freddy's 4: Halloween","a":"Scott Cawthon","l":"https://scottgames.com"},{"n":"Code Editor","a":"gn-math","l":"https://gn-math.dev"},{"n":"10 Minutes Till Dawn","a":"flanne","l":"https://store.steampowered.com/app/1966900/20_Minutes_Till_Dawn/"},{"n":"99 Balls","a":"Diamond Games","l":"https://www.crazygames.com/game/99-balls"},{"n":"Abandoned","a":"krutovig","l":"https://www.kongregate.com/games/krutovigor/abandoned"},{"n":"Yume Nikki","a":"kikiyama","l":"https://store.steampowered.com/app/650700/Yume_Nikki/"},{"n":"God's Flesh","a":"Glompyy","l":"https://glompyy.itch.io/gods-flesh"},{"n":"A Small World Cup","a":"rujogames","l":"https://rujogames.itch.io/a-small-world-cup"},{"n":"Awesome Tanks","a":"coolmathgames","l":"https://www.coolmathgames.com/0-awesome-tanks"},{"n":"Bouncemasters","a":"Azur Games, Playgendary","l":"https://azurgames.com"},{"n":"Awesome Tanks 2","a":"coolmathgames","l":"https://www.coolmathgames.com/0-awesome-tanks-2"},{"n":"Bank Robbery 2","a":"justaliendev","l":"https://www.crazygames.com/game/bank-robbery-2"},{"n":"Celeste PICO","a":"Matt Thorson and Noel Berry","l":"https://www.lexaloffle.com/bbs/?tid=2145"},{"n":"Kitty Toy","a":"Rakqoi","l":"https://rakqoi.itch.io/kittytoy"},{"n":"Infinimoes","a":"Werxzy","l":"https://werxzy.itch.io/infinimoes"},{"n":"Adventure Drivers","a":"Domas Kazragis","l":"https://poki.com/en/g/adventure-drivers"},{"n":"Ages of Conflict","a":"JoySpark Games","l":"https://play.google.com/store/apps/details?id=com.JoySparkGames.AgesofConflict"},{"n":"Kindergarten","a":"Con Man Games, SmashGames and Sean Young","l":"https://store.steampowered.com/app/589590/Kindergarten"},{"n":"Kindergarten 2","a":"Con Man Games, SmashGames and Sean Young","l":"https://store.steampowered.com/app/1067850/Kindergarten_2"},{"n":"Nijika's Ahoge","a":"TamaniDamani","l":"https://tamanidamani.itch.io/nijikas-ahoge"},{"n":"Aquapark.io","a":"Voodoo","l":"https://play.google.com/store/apps/details?id=com.cassette.aquapark"},{"n":"City Smash","a":"Paradyme Games","l":"https://play.google.com/store/apps/details?id=com.paradyme.citysmash"},{"n":"Amanda the Adventurer","a":"MANGLEDmaw Games, DreadXP","l":"https://store.steampowered.com/app/2166060/Amanda_the_Adventurer"},{"n":"Slender: The 8 Pages","a":"Parsec Productions","l":"https://www.indiedb.com/games/slender-the-eight-pages/downloads/slender-v096"},{"n":"Station 141","a":"Maksim Chmutov","l":"https://booleet.itch.io/station-141"},{"n":"Station Saturn","a":"Maksim Chmutov","l":"https://booleet.itch.io/station-saturn"},{"n":"BLOODMONEY!","a":"SHROOMYCHRIST-STUDIOS","l":"https://shroomychrist-studios.itch.io/bloodmoney"},{"n":"BERGENTRUCK 201x","a":"Paledoptera","l":"https://gamejolt.com/games/bergentruck/1007556"},{"n":"Undertale Yellow","a":"Team Undertale Yellow","l":"https://gamejolt.com/games/UndertaleYellow/136925"},{"n":"Raft","a":"Redbeet Interactive, Axolot Games, Ashen Arrow","l":"https://store.steampowered.com/app/648800/Raft"},{"n":"The Deadseat","a":"Curious Fox Sox","l":"https://store.steampowered.com/app/3667230/The_Deadseat"},{"n":"The Man In The Window","a":"Zed Technician","l":"https://zed-technician.itch.io/the-man-from-the-window"},{"n":"Fears to Fathom: Home Alone","a":"Rayll","l":"https://store.steampowered.com/app/1671340/Fears_to_Fathom__Home_Alone"},{"n":"Slither.io","a":"slither.io","l":"http://slither.com/io"},{"n":"DEAD PLATE","a":"racheldrawsthis","l":"https://racheldrawsthis.itch.io/dead-plate"},{"n":"Lacey's Flash Games","a":"ghosttundra, Euroclipse, Brand New Groove","l":"https://laceysflashgames.itch.io/laceys-flash-games"},{"n":"Choppy Orc","a":"eddynardo","l":"https://eddynardo.com/games/choppy-orc/"},{"n":"Cuphead","a":"Studio MDHR Entertainment Inc","l":"https://store.steampowered.com/app/268910/Cuphead"},{"n":"Baldi's Basics Classic Remastered","a":"Basically Games","l":"https://basically-games.itch.io/baldis-basics-classic-remastered"},{"n":"Baldi's Basics Plus","a":"Basically Games","l":"https://basically-games.itch.io/baldis-basics-plus"},{"n":"Hollow Knight","a":"Team Cherry","l":"https://store.steampowered.com/app/367520/Hollow_Knight"},{"n":"sandstone","a":"ading2210","l":"https://github.com/ading2210/sandstone"},{"n":"Doodle Jump","a":"Marko Pusenjak","l":"https://play.google.com/store/apps/details?id=com.lima.doodlejump&hl=en_US&pli=1"},{"n":"Madness Combat: Project Nexus (classic)","a":"Krinkels, The-Swain, cheshyre, Luis, Rebel666","l":"https://www.newgrounds.com/portal/view/592473"},{"n":"Bad Time Simulator","a":"jcw87","l":"https://jcw87.github.io/c2-sans-fight/"},{"n":"Spacebar Clicker","a":"Bruno Croci","l":"https://bruno.croci.me"},{"n":"Friday Night Funkin': V.S. Whitty","a":"Nate Anim8","l":"https://gamebanana.com/mods/44214"},{"n":"Friday Night Funkin': B-Sides","a":"Rozebud","l":"https://gamebanana.com/mods/42724"},{"n":"Friday Night Funkin': Vs. Hex","a":"YingYang48 etc","l":"https://gamebanana.com/mods/44225"},{"n":"Friday Night Funkin': Vs. Hatsune Miku","a":"evidal etc","l":"https://gamebanana.com/mods/44307"},{"n":"Friday Night Funkin': Neo","a":"JellyFishedm etc","l":"https://gamebanana.com/mods/44230"},{"n":"Steal A Brainrot","a":"nagami games","l":"https://yandex.com/games/app/447526"},{"n":"Friday Night Funkin': Sarvente's Mid-Fight Masses","a":"Dokki.doodlez etc","l":"https://gamebanana.com/mods/288792"},{"n":"Friday Night Funkin': vs. Tricky","a":"Banbuds etc","l":"https://gamebanana.com/mods/44334"},{"n":"Human Expenditure Program","a":"SHROOMYCHRIST-STUDIOS","l":"https://shroomychrist-studios.itch.io/"},{"n":"Friday Night Funkin': Hit Single Real","a":"Sturm/Churgney Gurgney etc","l":"https://gamebanana.com/mods/395039"},{"n":"Friday Night Funkin': Creepypasta JP","a":"CPJP Team","l":"https://gamebanana.com/mods/584886"},{"n":"Friday Night Funkin': vs. Garcello","a":"atsuover etc","l":"https://gamebanana.com/mods/166531"},{"n":"Friday Night Funkin': Sonic Legacy","a":"JoeDoughBoi etc","l":"https://gamebanana.com/mods/496733"},{"n":"Friday Night Funkin': vs. QT","a":"Hazardous24 etc","l":"https://gamebanana.com/mods/299714"},{"n":"Friday Night Funkin': Mistful Crimson Morning Reboot","a":"Stonesteve etc","l":"https://gamebanana.com/mods/387663"},{"n":"Friday Night Funkin': Indie Cross","a":"MORØ etc","l":"https://gamejolt.com/games/indiecross/643540"},{"n":"Rooftop Snipers 2","a":"Neweichgames","l":"https://www.neweichgames.com"},{"n":"I woke up next to you again.","a":"angela he","l":"https://zephyo.itch.io/i-woke-up"},{"n":"UNDERWHEELS","a":"LakenDaCoda","l":"https://www.newgrounds.com/portal/view/987750"},{"n":"RigBMX","a":"Cartoon Network","l":"https://www.cartoonnetwork.com"},{"n":"RigBMX 2","a":"Cartoon Network","l":"https://www.cartoonnetwork.com"},{"n":"groon groon, babey!","a":"tanner bananer","l":"https://goodboytan.itch.io/gg-kart"},{"n":"Friday Night Funkin': Jeffy's Endless Aethos","a":"jeffyfansml99 etc","l":"https://gamebanana.com/mods/504934"},{"n":"Friday Night Funkin': vs. BOPCITY","a":"Daniel Hummus","l":"https://gamebanana.com/mods/527514"},{"n":"Friday Night Funkin': 17 Bucks: Floor 1","a":"Peacocok6k","l":"https://gamebanana.com/mods/461390"},{"n":"Friday Night Funkin': FIRE IN THE HOLE: Lobotomy Dash Funkin'","a":"CoolDudeCrafter","l":"https://gamebanana.com/mods/490658"},{"n":"Friday Night Funkin': TWIDDLEFINGER","a":"MAXPROLOVER998","l":"https://gamebanana.com/mods/525021"},{"n":"Kindergarten 3","a":"Con Man Games, SmashGames and Sean Young","l":"https://store.steampowered.com/app/2695570/Kindergarten_3/"},{"n":"Stick With It","a":"Sam Hogan","l":"https://samhogan.itch.io/stick-with-it/"},{"n":"Five Nights at Candy's","a":"Emil \"Ace\" Macko","l":"https://gamejolt.com/games/five-nights-at-candy-s-official/70253"},{"n":"Five Nights at Candy's 2","a":"Emil \"Ace\" Macko","l":"https://gamejolt.com/games/five-nights-at-candy-s-2-official/110234"},{"n":"Pokemon Red","a":"Nintendo","l":"https://nintendo.com"},{"n":"Pokemon Emerald","a":"Nintendo","l":"https://nintendo.com"},{"n":"The Impossible Quiz","a":"SPLAPP-ME-DO","l":"https://splapp-me-do.newgrounds.com/"},{"n":"Super Mario Bros","a":"Nintendo","l":"https://nintendo.com"},{"n":"Friday Night Funkin’ Soft","a":"ShiniTrexx etc","l":"https://gamebanana.com/mods/523551"},{"n":"Tomodachi Collection","a":"Nintendo","l":"https://nintendo.com"},{"n":"Doge Miner","a":"rkn","l":"https://www.patreon.com/dogeminer/about"},{"n":"Final Earth 2","a":"flori9","l":"https://flori9.itch.io/the-final-earth-2"},{"n":"Swordfight!!","a":"Studio-19","l":"https://studio-19.itch.io/swordfight"},{"n":"PortaBoy+","a":"Enchae, Lumpy","l":"https://enchae.itch.io/portaboyplus"},{"n":"PacMan (Horror)","a":"BerickCook","l":"https://berickcook.itch.io/pacman"},{"n":"Oshi Oshi Punch!","a":"Empty House Games, Shuu","l":"https://emptyhousegames.itch.io/oshi-oshi-punch"},{"n":"Nubby's Number Factory","a":"MogDogBlog Productions","l":"https://mogdogblog-productions.itch.io/nubbys-number-factory"},{"n":"Touhou: Luminous Strike","a":"NitNitori, LadyEbony","l":"https://nitori.itch.io/touhou-luminous-strike"},{"n":"Generic Fighter Maybe","a":"Astrobard Games, Khao Mortadios","l":"https://astrobardgames.itch.io/generic-fighter-maybe"},{"n":"Dan The Man","a":"Halfbrick Studios","l":"https://play.google.com/store/apps/details?id=com.halfbrick.dantheman"},{"n":"Bust a Loop","a":"PeachTreeOath","l":"https://peachtreeoath.itch.io/bust-a-loop"},{"n":"Bad Monday Simulator","a":"Lumpy, Spasco","l":"https://lumpytouch.itch.io/bad-monday-simulator"},{"n":"Touhou Mother","a":"vgperson","l":"https://vgperson.com/games/touhoumother.htm"},{"n":"Parappa The Rapper","a":"NanaOn-Sha","l":"https://www.nanaon-sha.co.jp/"},{"n":"Friday Night Funkin': Darkness Takeover","a":"MiniSymba","l":"https://gamejolt.com/games/darknesstakeover/802587"},{"n":"SpongeBob SquarePants: Land Ho!","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: SpongeBob Run","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: Squidward's Sizzlin' Scare","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: Sandy's Sponge Stacker","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: Tasty Pastry Party","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: The Kah-Ray-Tay Squid","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: WereSquirrel","a":"Nickelodeon","l":"https://nick.com"},{"n":"SpongeBob SquarePants: Krabby Katch","a":"Nickelodeon","l":"https://nick.com"},{"n":"Teen Titans GO!: Jump Jousts","a":"Cartoon Network","l":"https://cartoonnetwork.com"},{"n":"Teen Titans GO!: Jump Jousts 2","a":"Cartoon Network","l":"https://cartoonnetwork.com"},{"n":"Cat Connection","a":"MOSTLY MAD PRODUCTIONS","l":"https://mostlymadproductions.itch.io/cat-connection"},{"n":"Cat Gunner: Super Zombie Shoot","a":"Poki","l":"https://poki.com/en/g/cat-gunner-super-zombie-shoot"},{"n":"Love Letters","a":"Nozomu Games","l":"https://nozomu57.itch.io/love-letters"},{"n":"Chiikawa Puzzle","a":"emptygamer","l":"https://emptygamer.itch.io/chiikawapuzzle"},{"n":"myTeardrop","a":"VENDORMINT","l":"https://x.com/vendormint"},{"n":"Friday Night Funkin': Pibby: Apocalypse","a":"BAUDASlel etc.","l":"https://gamebanana.com/wips/73842"},{"n":"Karlson","a":"DaniDev","l":"https://danidev.itch.io/"},{"n":"Jelly Drift","a":"DaniDev","l":"https://danidev.itch.io/"},{"n":"Plinko","a":"Anson Heung","l":"https://www.ansonh.com"},{"n":"Clash Of Vikings","a":"unknown","l":"https://www.crazygames.com/game/clash-of-vikings"},{"n":"Recoil","a":"Martin Magini","l":"https://play.fancade.com"},{"n":"Baseball Bros","a":"Blue Wizard","l":"https://baseballbros.io"},{"n":"Football Bros","a":"Blue Wizard","l":"https://footballbros.io"},{"n":"Sonic the Hedgehog 2: Community's Cut","a":"heyjoeway and SEGA","l":"https://github.com/heyjoeway/s2disasm"},{"n":"Sonic the Hedgehog 3: Angel Island Remastered","a":"Eukaryot3K and SEGA","l":"https://sonic3air.org/"},{"n":"Hypper Sandbox","a":"VobbyGames, weirdnessworld","l":"https://play.google.com/store/apps/details?id=com.Hypper&hl=en_US"},{"n":"Aviamasters","a":"BGaming","l":"https://bgaming.com/games/aviamasters"},{"n":"Rolling Sky","a":"Dream Playz","l":"https://play.google.com/store/apps/details?id=com.dreamplayz.rollingball&hl=en_US"},{"n":"Yandere Simulator","a":"YandereDev","l":"https://yanderesimulator.com/"},{"n":"Friday Night Funkin VS. KAPI","a":"paperkitty etc","l":"https://gamebanana.com/mods/44683"},{"n":"Friday Night Funkin VS. Sky","a":"Alexander0110 etc","l":"https://gamebanana.com/mods/44555"},{"n":"Getting Over It with Bennett Foddy","a":"Bennett Foddy","l":"https://store.steampowered.com/app/240720/Getting_Over_It_with_Bennett_Foddy/"},{"n":"Friday Night Funkin Vs. Cyber Sensation","a":"Taeyai","l":"https://gamebanana.com/mods/319101"},{"n":"Friday Night Funkin vs Shaggy","a":"srPerez etc","l":"https://gamebanana.com/mods/284121"},{"n":"Deltatraveler","a":"VyletBunni","l":"https://gamejolt.com/games/deltatraveler/661464"},{"n":"BitGun.io","a":"Hazmob","l":"https://www.crazygames.com/game/bit-gun-io"},{"n":"Boom Slingers: Reboom","a":"Boom Corp","l":"https://www.boomslingers.com/"},{"n":"CG FC 25","a":"Finz Games","l":"https://www.finz.io/"},{"n":"Count Masters: Stickman Games","a":"FreePlay LLC","l":"https://www.crazygames.com/game/count-masters-stickman-games"},{"n":"Dalgona Candy Honeycomb Cookie","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Highway Racer","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Highway Racer 2 REMASTERED","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Hula Hoop Race","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Jelly Restaurant","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Layers Roll","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Lazy Jumper","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Man Runner 2048","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Pottery Master","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Shovel 3D","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Sky Riders","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Steal Brainrot Online","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Stickman and Guns","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Super Star Car","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Traffic Rider","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"BuildNow.gg","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Friday Night Funkin': Mario's Madness","a":"Dewott2501 etc","l":"https://gamebanana.com/mods/359554"},{"n":"Friday Night Funkin' vs Hypno Lullaby","a":"Hypno Lullaby Team","l":"https://gamejolt.com/games/hypnos-lullabyv2cancelled/758792"},{"n":"Stone Grass Mowing Simulator","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Fallout","a":"Bethesda Softworks","l":"https://bethesda.net/en/dashboard"},{"n":"The Oregon Trail","a":"MECC","l":"https://archive.org/details/msdos_Oregon_Trail_The_1990"},{"n":"Newgrounds Rumble","a":"NegativeONE, Luis, MindChamber","l":"https://www.newgrounds.com/portal/view/381115"},{"n":"Super Mario 64","a":"Nintendo","l":"https://nintendo.com"},{"n":"Sonic CD","a":"SEGA","l":"https://sega.com"},{"n":"Sonic Mania","a":"SEGA, crunch arcade","l":"https://sega.com"},{"n":"Slime Rancher","a":"Monomi Park, Ported by Snubby.top","l":"https://monomipark.com/"},{"n":"Pac Man World","a":"Full Fat Games","l":"https://www.full-fat.com/"},{"n":"Pac Man World 2","a":"Full Fat Games","l":"https://www.full-fat.com/"},{"n":"Waterworks!","a":"scriptwelder","l":"https://scriptwelder.itch.io/waterworks"},{"n":"Shapez.io","a":"scriptwelder","l":"https://scriptwelder.itch.io/waterworks"},{"n":"[!] COMMENTS","a":"gn-math","l":"https://gn-math.github.io"},{"n":"Plants vs. Zombies 2 Gardenless","a":"Gzh0821","l":"https://pvzge.com/en/"},{"n":"Sonic.EXE","a":" Cinossu","l":"https://info.sonicretro.org/An_Ordinary_Sonic_ROM_Hack"},{"n":"Metal Gear Solid","a":" Konami Computer Entertainment Japan","l":"https://www.konami.com/"},{"n":"FNF Vs. Hypno's Lullaby v2","a":"Hypno's Lullaby Team","l":"https://gamebanana.com/wips/73522"},{"n":"FNF Vs. Sonic.EXE 3.0/4.0","a":"FNF Vs. Sonic.EXE Team","l":"https://gamebanana.com/mods/531361"},{"n":"Doom 2","a":"id Software","l":"https://www.idsoftware.com/"},{"n":"Growden.io","a":"growden.io","l":"https://growden.io/"},{"n":"Minesweeper Plus","a":"Jorel Simpson","l":"https://jorel-simpson.itch.io/minesweeper-plus"},{"n":"Schoolboy Runaway","a":"Linked Squad","l":"https://linked-squad.com/"},{"n":"Sonic.EXE (ORIGINAL)","a":"MY5TCrimson","l":"https://gamejolt.com/games/sonic-exe-the-game/16239"},{"n":"Tattletail","a":"Waygetter Electronics, Ported by Snubby.top","l":"https://store.steampowered.com/app/568090/Tattletail/"},{"n":"Friday Night Funkin VS Impostor v4","a":"Imposter v4 team","l":"https://gamebanana.com/mods/55652"},{"n":"Friday Night Funkin vs Sunday Remastered HD","a":"Sunday Remastered team","l":"https://gamebanana.com/mods/323254"},{"n":"Friday Night Funkin vs Carol V2","a":"Carol V2 team","l":"https://gamebanana.com/mods/42811"},{"n":"The Legend of Zelda Ocarina of Time","a":"Nintendo","l":"https://nintendo.com"},{"n":"The Legend of Zelda Majora's Mask","a":"Nintendo","l":"https://nintendo.com"},{"n":"Friday Night Funkin' Drop and Roll, but Playable","a":"Drop and roll team","l":"https://gamebanana.com/mods/514851"},{"n":"Toy Rider","a":"CrazyGames","l":"https://www.crazygames.com/"},{"n":"Friday Night Funkin Vs. Dave and Bambi v3","a":"Dave and Bambi team","l":"https://gamebanana.com/mods/43201"},{"n":"Friday Night Funkin’ Wednesday's Infidelity","a":"Wednesday's Infidelity team","l":"https://gamebanana.com/mods/343688"},{"n":"Postal","a":"Stinkalistic, Running With Scissors","l":"https://runningwithscissors.com/"},{"n":"FNF vs Bob v2.0 (Bob’s Onslaught)","a":"bob v2.0 team","l":"https://gamebanana.com/mods/621085"},{"n":"Friday Night Funkin': Rev-Mixed","a":"Rev-Mixed team","l":"https://gamebanana.com/mods/621085"},{"n":"Three Goblets","a":"Adventale","l":"https://adventale.net/play/three-goblets/"},{"n":"Friday Night Funkin': Gumballs","a":"Gumballs team","l":"https://gamebanana.com/mods/614094"},{"n":"Oneshot (LEGACY)","a":"Future Cat LLC, ARandomPerson","l":"https://store.steampowered.com/app/420530/OneShot/"},{"n":"Celeste","a":"MaddyMakesGames, Mercury Workshop","l":"https://store.steampowered.com/app/504230/Celeste/"},{"n":"Happy Wheels","a":"Jim Bonacci","l":"https://totaljerkface.com/"},{"n":"Get Yoked","a":"gregs games","l":"https://gregs-games.itch.io/get-yoked-2"},{"n":"Doom 3","a":"id Software, 98corbins","l":"https://www.idsoftware.com"},{"n":"Tag","a":"WeLoPlay","l":"https://www.weloplay.com/"},{"n":"Pizza Tower: Scoutdigo","a":"only1indigo, burnedpopcorn","l":"https://gamebanana.com/wips/75923"},{"n":"Off","a":"Mortis Ghost, Fangamer","l":"https://store.steampowered.com/app/3339880/OFF/"},{"n":"Space Funeral","a":"Stephen Gillmurphy","l":"https://thecatamites.itch.io/space-funeral"},{"n":"Endroll","a":" Segawa","l":"https://vgperson.com/games/endroll.htm"},{"n":"Cave Story","a":" Daisuke 'Pixel' Amaya","l":"https://www.cavestory.org/"},{"n":"Friday Night Funkin': VS. Impostor: Alternated","a":"Alternated team","l":"https://gamebanana.com/mods/598215"},{"n":"Friday Night Funkin': Chaos Nightmare - Sonic Vs. Fleetway","a":"Fleetway team","l":"https://gamebanana.com/mods/359046"},{"n":"Spelunky Classic HD","a":" nkrapivin","l":"https://yancharkin.itch.io/spelunky-classic-hd"},{"n":"Friday Night Funkin' D-Sides","a":"d-sides team","l":"https://gamebanana.com/mods/305122"},{"n":"BFDIA 5b","a":"Cary Huang","l":"https://x.com/realCarykh"},{"n":"BFDIA 5b: 5*30","a":"Mawilite, Cary Huang","l":"https://x.com/Mega_Mawilite"},{"n":"Friday Night Funkin' VS Impostor B-Sides","a":"Imposter b-sides team","l":"https://gamebanana.com/mods/504519"},{"n":"Mutilate a Doll 2","a":"SilverGames","l":"https://www.newgrounds.com/portal/view/655001"},{"n":"Godzilla Daikaiju Battle Royale","a":"AWM Studio Productions LLC","l":"https://archive.org/details/gdbr_20210915"},{"n":"Friday Night Funkin' Sunday Night Suicide: Rookies Edition","a":"Rookies team","l":"https://gamebanana.com/mods/503587"},{"n":"Rio Rex","a":"Gametornado","l":"https://store.steampowered.com/app/868830/Rio_Rex/"},{"n":"Friday Night Funkin vs Nonsense","a":"NonsenseNH","l":"https://www.youtube.com/channel/UCnp4LuZgNt0KwiTMSZN7GIw"},{"n":"Arthur's Nightmare","a":"Varun R.","l":"https://varunramesh.itch.io/arthurs-nightmare"},{"n":"Buster Jam","a":"TALL GLASS","l":"https://www.tallglassgames.com/"},{"n":"Super Smash Flash","a":"McLeodGaming","l":"https://www.mcleodgaming.com/"},{"n":"Mindwave","a":"HoloHammer","l":"https://store.steampowered.com/app/2701030/MINDWAVE/"},{"n":"Look Outside","a":"Francis Coulombe","l":"https://store.steampowered.com/app/3373660/Look_Outside/"},{"n":"Milk Inside a Bag of Milk Inside a Bag of Milk","a":"Nikita Kryukov","l":"https://nikita-kryukov.itch.io/"},{"n":"Milk Outside A Bag Of Milk Outside A Bag Of Milk","a":"Nikita Kryukov","l":"https://nikita-kryukov.itch.io/"},{"n":"1 Date Danger","a":"Knives","l":"https://mawedgone.itch.io/1-date-danger"},{"n":"Final Fantasy VII","a":"Square Enix","l":"https://ffvii.square-enix-games.com/en-us"},{"n":"Goblin Goopmaxxing","a":"BugfightStudio","l":"https://store.steampowered.com/app/4107470/Goblin_Goopmaxxing/"},{"n":"Rogue Sergeant The Final Operation","a":"Studiohammergames","l":"https://studiohammergames.itch.io/rogue-sergeant-the-final-operation"},{"n":"Friday Night Funkin vs Undertale","a":"vs undertale team","l":"https://gamebanana.com/mods/342415"},{"n":"Midnight Shift","a":"Phantom GD","l":"https://phantom-gd.itch.io/midnight-shift"},{"n":"Orange Roulette","a":"Matzerath","l":"https://www.newgrounds.com/portal/view/596354"},{"n":"Please Dont Touch Anything","a":"Four Quarters","l":"https://store.steampowered.com/app/354240/Please_Dont_Touch_Anything/"},{"n":"Royal Towers: Medieval TD","a":"Superplus Games","l":"https://play.google.com/store/apps/details?id=com.superplusgames.tower"},{"n":"Going Balls","a":"Supersonic Studios LTD","l":"https://play.google.com/store/apps/details?id=com.pronetis.ironball2"},{"n":"3D Bolt Master","a":"Joymaster Puzzle Game Studio","l":"https://play.google.com/store/apps/details?id=com.screw3d.match.nuts.bolts.pin.jam.away.puzzle"},{"n":"Tall.io","a":"Playgama","l":"https://playgama.com/"},{"n":"Match Triple 3D","a":"LIHUHU PTE. LTD.","l":"https://play.google.com/store/apps/details?id=and.lihuhu.machingtriple&hl=en_US"},{"n":"Stick War: Legacy","a":"Max Games Studios","l":"https://play.google.com/store/apps/details/Stick+War:+Legacy?id=com.maxgames.stickwarlegacy&hl=en_ZA"},{"n":"In Stars and Time","a":"insertdisc5","l":"https://store.steampowered.com/app/1677310/In_Stars_And_Time/"},{"n":"Gorilla Tag","a":"Another Axiom Inc, Boolonx","l":"https://boolonx.com/gtag/?utm_source=gn-math.dev&utm_medium=referral&utm_campaign=gn-math.dev"},{"n":"Terraria","a":"Re-Logic, Mercury Workshop","l":"https://terraria.org/"},{"n":"Raldi's Crackhouse","a":"RCHTeam, Grayson","l":"https://gamejolt.com/games/raldicrackhouse/769103"},{"n":"We Become What We Behold","a":"Ncase","l":"https://ncase.itch.io/wbwwb"},{"n":"A Difficult Game About Climbing","a":"Pontypants","l":"https://store.steampowered.com/app/2497920/A_Difficult_Game_About_Climbing/"},{"n":"Hobo 1","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Hobo 2","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Hobo 3","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Hobo 4","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Hobo 5","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Hobo 6","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Hobo 7","a":"SeethingSwarm","l":"https://seethingswarm.newgrounds.com/"},{"n":"Kirby Super Star Ultra","a":"Nintendo","l":"https://nintendo.com"},{"n":"Cooking Mama","a":"Office Create","l":"https://www.cookingmama.com/"},{"n":"Cooking Mama 2","a":"Office Create","l":"https://www.cookingmama.com/"},{"n":"Cooking Mama 3","a":"Office Create","l":"https://www.cookingmama.com/"},{"n":"Kirby Squeak Squad","a":"Nintendo","l":"https://nintendo.com"},{"n":"FIFA 11","a":"EA Sports","l":"https://ea.com"},{"n":"FIFA 10","a":"EA Sports","l":"https://ea.com"},{"n":"Pico's School (1999)","a":"Tom Fulp","l":"https://www.newgrounds.com/portal/view/310349"},{"n":"Peggle","a":"PopCap Games","l":"https://store.steampowered.com/app/3480/Peggle_Deluxe/"},{"n":"Meatboy","a":"Jonathan McEntee","l":"https://www.newgrounds.com/portal/view/463241"},{"n":"Friday Night Funkin': AKAGE","a":"owoskitty etc","l":"https://gamebanana.com/mods/578842"},{"n":"Friday Night Funkin': Heartbreak Havoc [Vs. Sky: REDUX]","a":"REDUX Team","l":"https://gamebanana.com/mods/632935"},{"n":"Kirby ~ Soft & Wet","a":"Strimp's Kitchen","l":"https://strimps-kitchen.itch.io/kirby-soft-and-wet"},{"n":"Half Life: Opposing Force","a":"Valve","l":"https://www.valvesoftware.com/en/"},{"n":"Pokemon Firered","a":"Nintendo","l":"https://www.nintendo.com/"},{"n":"Duck Life 8","a":"Wix Games","l":"https://www.wixgames.co.uk/"},{"n":"Pokemon HeartGold","a":"Nintendo","l":"https://www.nintendo.com/"},{"n":"Bank Robbery","a":"justaliendev","l":"https://www.crazygames.com/game/bank-robbery"},{"n":"Bank Robbery 3","a":"justaliendev","l":"https://www.crazygames.com/game/bank-robbery-3"},{"n":"Stickman Destruction","a":"freezenova","l":"https://unblocked-games.s3.amazonaws.com/index.html"},{"n":"FNF vs Pibby Corrupted","a":"Pibby Corrupted team","l":"https://gamebanana.com/mods/download/344757"},{"n":"Real Flight Simulator","a":"freezenova","l":"https://unblocked-games.s3.amazonaws.com/index.html"},{"n":"JavascriptPS1","a":"Alex Ashnov","l":"https://github.com/AlexAshnovSrc/JavascriptPS1"},{"n":"VS Rewrite: ROUND 2","a":"Rewrite team","l":"https://gamebanana.com/mods/599931"},{"n":"Five Nights at Freddy's: World Refreshed","a":"Pyturret, Willowy (squall.cc)","l":"https://squall.cc?utm_source=gn-math.dev&utm_medium=referral&utm_campaign=gn-math.dev"},{"n":"Iron Lung","a":"David Szymanski, 98corbins","l":"https://store.steampowered.com/app/1846170/Iron_Lung/"},{"n":"Fear & Hunger","a":"Miro Haverinen, Happy Paintings","l":"https://store.steampowered.com/app/1002300/Fear__Hunger/"},{"n":"Traffic Racer","a":"skgames, madkidgames","l":"https://play.google.com/store/apps/details?id=com.skgames.trafficracer&hl=en_US"},{"n":"Needy Streamer Overload","a":"WSS playground, EDURocks","l":"https://edurocks.org?utm_source=gn-math.dev&utm_medium=referral&utm_campaign=gn-math.dev"},{"n":"Survivor.io","a":"Habby Pte. Ltd, madkidgames","l":"https://play.google.com/store/apps/details?id=com.dxx.firenow"},{"n":"Five Nights at Epstein's","a":"EvanProductions","l":"https://evanproductions.itch.io/five-nights-at-epsteins"},{"n":"Antonblast","a":"Summitsphere","l":"https://store.steampowered.com/app/1887400/ANTONBLAST/"},{"n":"Jumbo Mario","a":"wik","l":"https://mfgg.net/index.php?act=resdb&param=02&c=2&id=41730"},{"n":"Silent Hill","a":"Konami, Team Silent","l":"https://www.konami.com"},{"n":"Friday Night Funkin vs Tabi","a":"SangMareZG","l":"https://gamebanana.com/mods/587524"},{"n":"Friday Night Funkin vs Zardy","a":"SwankyBox","l":"https://gamebanana.com/mods/44366"},{"n":"Clover Pit","a":"Panik Arcade","l":"https://store.steampowered.com/app/3314790/CloverPit/"},{"n":"Peaks of Yore","a":"Anders Grube Jensen","l":"https://store.steampowered.com/app/2236070/Peaks_of_Yore/"},{"n":"Untitled Goose Game","a":"House House","l":"https://store.steampowered.com/app/837470/Untitled_Goose_Game/"},{"n":"A Game About Feeding A Black Hole","a":"Aarimous, Thornityco","l":"https://store.steampowered.com/app/3694480/A_Game_About_Feeding_A_Black_Hole/"},{"n":"Roulette Hero","a":"vfqd, Mr.Pootsley, Jaybooty, Kane Forster, shxyder","l":"https://vfqd.itch.io/roulette-hero"},{"n":"Shift at Midnight","a":"Bun Muen, Slqnt","l":"https://bunmuen.itch.io/shiftatmidnight"},{"n":"Fused 240","a":"Mike Klubnika, shxyder","l":"https://mikeklubnika.itch.io/fused-240"},{"n":"Brotato","a":"Blobfish, Individual/Stinkalistic","l":"https://store.steampowered.com/app/1942280/Brotato/"},{"n":"Endoparasitic 2","a":"Miziziziz, Deep Root Interactive, Individual/Stinkalistic","l":"https://store.steampowered.com/app/2990640/Endoparasitic_2/"},{"n":"ShredSauce","a":"Shredsauce Team","l":"https://shredsauce.com"},{"n":"Breath of the Wild NDS","a":"unknown","l":""},{"n":"Dimension Incident","a":"biznesbear","l":"https://biznesbear.itch.io/dimensionincident"},{"n":"Fear Assessment","a":"Alexander Wiseman","l":"https://alexander-wiseman.itch.io/fear-assessment"},{"n":"game inside a game inside a game inside a game inside a game inside a game","a":"Sam Hogan","l":"https://samhogan.itch.io/game-inside-a-game"},{"n":"Cell Machine","a":"Sam Hogan","l":"https://samhogan.itch.io/cell-machine"},{"n":"Undertale: Last Breath","a":"caijiqaq","l":"https://caijiqaq.github.io/LAST-BREATH/"},{"n":"64 in 1 NES","a":"idk","l":"https://www.doperoms.org/roms/nintendo_nes/64-in-1%2520%255Bp1%255D.zip.html/630301/64-in-1%20[p1].zip.html"},{"n":"Tetris","a":"Nintendo","l":"https://www.nintendo.com/"},{"n":"Christmas Massacre","a":"Puppet Combo","l":"https://store.steampowered.com/app/1840490/Christmas_Massacre/"},{"n":"Famidash","a":"Zephyrside","l":"https://github.com/tfdsoft/famidash"},{"n":"Super Mario Bros. Remastered","a":"Zephyrside","l":"https://github.com/tfdsoft/famidash"},{"n":"Saihate Station (さいはて駅)","a":"びぶ/viv","l":"https://store.steampowered.com/app/3079280/Saihate_Station/"},{"n":"Dumb Ways to Die","a":"PlaySide Studios Ltd, Metro Trains","l":"https://store.steampowered.com/app/3079280/Saihate_Station/"},{"n":"Soccer Random","a":"RHM Interactive OÜ","l":"https://play.google.com/store/apps/details?id=com.twoplayergames.soccerrandom"},{"n":"Bart Blast","a":"epickface","l":"https://bartblast.itch.io/bart-blast"},{"n":"Resident Evil","a":"Capcom","l":"https://www.capcom.com/"},{"n":"Resident Evil 2","a":"Capcom","l":"https://www.capcom.com/"},{"n":"Power Hover","a":"ODDROK","l":"https://store.steampowered.com/app/559960/Power_Hover/"},{"n":"Escape Road City 2","a":"AZ Games","l":"https://azgames.io/"},{"n":"Tetris","a":"Nintendo","l":"https://www.nintendo.com/"},{"n":"Fundamental Paper Novel","a":"yakubell","l":":https://yakubelle.itch.io/fundamental-paper-novel"},{"n":"Worst Time Simulator","a":"omegafredo","l":"https://omegafredo.github.io/worst-time-simulator/"},{"n":"Undertale Last Breath PHASE THREE","a":"mario1d240","l":"https://mario1d240.github.io/undertale-last-breath-remake-bad-time-simulator/"},{"n":"Super Monkey Ball 1&2","a":"Amusement Vision, camthesaxman etc","l":"https://monkeyball-online.pages.dev/"},{"n":"Five Nights at Last Breath","a":"Free_Breath","l":"https://free-breath.itch.io/five-night-at-last-breath-epstein"},{"n":"Jeffrey Epstein Basics In Education And Kidnapping","a":"Zakaria_ALZ","l":"https://zakaria-alz.itch.io/jeffrey-epsteins-basics-in-education-and-kidnapping"},{"n":"Bad Piggies","a":"Rovio Entertainment, EDURocks","l":"https://play.google.com/store/apps/details?id=com.rovio.BadPiggies&hl=en_US"},{"n":"Breaklock","a":"Print More India","l":"https://play.google.com/store/apps/details?id=com.pmi.breaklock"},{"n":"Minecraft Pocket Edition","a":"Mojang","l":"https://mojang.com"},{"n":"Brawl Simulator 3D","a":"Fire Games, Supercell","l":"https://yandex.com/games/developer/77286"},{"n":"Witch's Heart","a":"IZ (BLUE STAR Entertainment)","l":"https://bluestariz.web.fc2.com/zentai.html"},{"n":"Ultrapool","a":"Icedrop Games, mysmic","l":"https://store.steampowered.com/app/4195110/Ultrapool/"},{"n":"CaseOh's Basics in Eating and Fast Food","a":"Ronezkj15","l":"https://gamebanana.com/mods/507799"},{"n":"Dice a Million","a":"countlessnights, 2 Left Thumbs, NotRexed","l":"https://store.steampowered.com/app/3430340/Dice_A_Million/"},{"n":"Overburden","a":"notsospecialgames, shxyder","l":"https://notsospecialgames.itch.io/overburden"},{"n":"FISH","a":"dmcaguy","l":"https://dmcaguy.itch.io/fish"},{"n":"Cheese Rolling","a":"The Interviewed, wasm.com","l":"https://store.steampowered.com/app/3809440/Cheese_Rolling/"},{"n":"Flying Gorilla 3D","a":"Pinbit LLC","l":"https://apps.apple.com/us/app/flying-gorilla/id1365028549"},{"n":"Five Night's at Shrek's Hotel","a":"rend-pii","l":"https://rend-pii.itch.io/five-nights-at-shreks-hotel-2"},{"n":"Scary Shawarma Kiosk: the ANOMALY","a":"kharbor_ykt","l":"https://www.roblox.com/games/137826330724902/Scary-Shawarma-Kiosk-the-ANOMALY"},{"n":"Suika Game","a":"unknown","l":"https://gn-math.dev"},{"n":"Stick Slasher","a":"Beruke Games","l":"https://play.google.com/store/apps/details?id=com.BerukeGames.StickSlasher"},{"n":"Stickman Kombat 2D","a":"GamePush","l":"https://www.crazygames.com/game/stickman-kombat-2d"},{"n":"Stickman Duel","a":"unknown","l":"https://gn-math.dev"},{"n":"Sonic Robo Blast 2","a":"Sonic Team Junior, KBHGames","l":"https://www.srb2.org/"},{"n":"Hollow Knight: Silksong","a":"Team Cherry, Edurocks","l":"https://www.teamcherry.com.au/"},{"n":"Sam & Max Hit the Road","a":"Lucasfilm","l":"https://store.steampowered.com/app/355170/Sam__Max_Hit_the_Road/"},{"n":"Command & Conquer","a":"Westwood Studios","l":"https://www.ea.com/games/command-and-conquer"},{"n":"Mountain Bike Racer","a":"stefano1234","l":"https://www.construct.net/en/free-online-games/mountain-bike-runner-20988/play"},{"n":"Bart Bash","a":"TeleSTOP","l":"https://bartbash.com/"},{"n":"Your Only Move Is HUSTLE","a":"ivysly","l":"https://ivysly.itch.io/your-only-move-is-hustle"},{"n":"Outhold","a":"tellusgames","l":"https://tellusgames.itch.io/outhold"},{"n":"Serial Experiments Lain","a":"NBCUniversal Entertainment Japan, Pioneer Productions","l":"https://laingame.net/"},{"n":"I Have No Mouth, and I Must Scream","a":"Cyberdreams","l":"https://store.steampowered.com/app/245390/I_Have_No_Mouth_and_I_Must_Scream/"},{"n":"Thing-Thing Arena 3","a":"Weasel","l":"https://www.newgrounds.com/portal/view/485863"},{"n":"Scratch Inc","a":"Makopaz","l":"https://store.steampowered.com/app/3788420/Scratch_Inc/"},{"n":"Um Jammer Lammy","a":"NanaOn-Sha","l":"https://www.retrogames.cc/psx-games/um-jammer-lammy-usa.html"},{"n":"Apes vs Helium","a":"mdtowerz","l":"https://mdtowerz.itch.io/apesvshelium"},{"n":"Gabriel's Awesome Schoolhouse (GASH)","a":"Gabriel115GJ","l":"https://gamejolt.com/games/GASH/877557"},{"n":"Geometry Dash","a":"RobTop Games","l":"https://geometrydash.com"},{"n":"Volley Random","a":"RHM Interactive","l":"https://www.crazygames.com/game/volley-random"},{"n":"BeatBlock","a":"BubbleTabby, sunsuke","l":"https://store.steampowered.com/app/3045200/Beatblock/"},{"n":"Vib-Ribbon","a":"NanaOn-Sha, Japan Studio","l":"https://www.nanaon-sha.co.jp/"},{"n":"Stardew Valley","a":"The Secret Police Limited, ConcernedApe, Cirsius","l":"https://www.stardewvalley.net/"},{"n":"Helltaker","a":"Vanripper, wasm.rip","l":"https://vanripper.itch.io/"},{"n":"Who's Your Daddy","a":"Evil Tortilla Games, reeyuki","l":"https://store.steampowered.com/app/427730/Whos_Your_Daddy/"},{"n":"Escape Road 3","a":"AzGames","l":"https://azgames.io/escape-road-3"},{"n":"Lethal Ape","a":"StellaDev","l":"https://stella-dev.itch.io/lethal-ape"},{"n":"Fear & Hunger 2: Termina","a":"Miro Haverinen, Happy Paintings","l":"https://store.steampowered.com/app/2171440/Fear__Hunger_2_Termina/"},{"n":"UvuvwevwevweOnyetenvewveUgwemubwemOssas","a":"Zakaria_ALZ","l":"https://gamebanana.com/mods/660542"},{"n":"Slendytubbies 1","a":"Sean Toman","l":"https://www.zeoworks.com/"},{"n":"Fih","a":"starrymari","l":"https://starrymari.itch.io/fih"},{"n":"Hungry Lamu","a":"kulurc / kulu","l":"https://kulurc.itch.io/hungry-lamu"},{"n":"Hungry Lamu 2","a":"kulurc / kulu","l":"https://kulurc.itch.io/hungry-lamu-2"},{"n":"Rocket Goal.io","a":"Rocket Goal team","l":"https://rocketgoal.io"},{"n":"Trees Hate You","a":"tykenn","l":"https://tykenn.itch.io/trees-hate-you"},{"n":"Scampton The Great","a":"sad_bread, shyxder","l":"https://gamejolt.com/games/1225/1015970"},{"n":"Bendy and the Ink Machine: ALL CHAPTERS","a":"Joey Drew Studios","l":"https://store.steampowered.com/app/622650/Bendy_and_the_Ink_Machine/"},{"n":"Vampire Survivors","a":"Poncle","l":"https://store.steampowered.com/app/1794680/Vampire_Survivors/"},{"n":"Plague Inc","a":"Ndemic Creations, Reeyuki","l":"https://play.google.com/store/apps/details?id=com.miniclip.plagueinc"},{"n":"Slendytubbies 2","a":"Sean Toman","l":"https://www.zeoworks.com/"},{"n":"Slendytubbies 2D","a":"Sean Toman","l":"https://www.zeoworks.com/"},{"n":"Spaceflight Simulator","a":"Team Curiosity","l":"https://store.steampowered.com/app/1718870/Spaceflight_Simulator/"},{"n":"Rhythm Heaven","a":"Kazuyoshi Osawa, Nintendo","l":"https://www.nintendo.com/us/store/products/rhythm-heaven-groove-switch/"},{"n":"Need For Speed: Carbon","a":"EA Sports","l":"https://www.ea.com/en/games/need-for-speed"},{"n":"Need For Speed: Most Wanted","a":"EA Sports","l":"https://www.ea.com/en/games/need-for-speed"},{"n":"Need For Speed: Underground 2","a":"EA Sports","l":"https://www.ea.com/en/games/need-for-speed"},{"n":"Five Nights at Frickbear's 3","a":"SpookyRick, Reeyuki","l":"https://gamejolt.com/games/frickbears3/930477"},{"n":"MiSide","a":"AIHASTO","l":"https://store.steampowered.com/app/2527500/MiSide/"},{"n":"Baldi's Basics The Ultra Decompile","a":"SeenWonderAlex","l":"https://seenwonderalex.itch.io/baldis-basics-tud"},{"n":"-3","a":"Mauzer2137","l":"https://gamebanana.com/mods/647218"},{"n":"-b","a":"bermud","l":"https://gamebanana.com/mods/669311"},{"n":"t³ (T cubed)","a":"Blidb","l":"https://gamebanana.com/mods/674558"},{"n":"20 Minutes Till Dawn","a":"Flanne, Rah, Bog","l":"https://store.steampowered.com/app/1966900/20_Minutes_Till_Dawn/"},{"n":"Phoenix Wright - Ace Attorney","a":"Capcom","l":"https://www.ace-attorney.com/"},{"n":"Apollo Justice - Ace Attorney","a":"Capcom","l":"https://www.ace-attorney.com/"},{"n":"Phoenix Wright - Ace Attorney - Justice for All","a":"Capcom","l":"https://www.ace-attorney.com/"},{"n":"Ace Attorney Investigations - Miles Edgeworth","a":"Capcom","l":"https://www.ace-attorney.com/"},{"n":"Phoenix Wright - Ace Attorney - Trials and Tribulations","a":"Capcom","l":"https://www.ace-attorney.com/"},{"n":"Cruelty Squad","a":"Consumer Softproducts, dizzy","l":"https://store.steampowered.com/app/1388770/Cruelty_Squad/"},{"n":"Just Shapes & Beats","a":"Berzerk Studio","l":"https://store.steampowered.com/app/531510/Just_Shapes__Beats/"},{"n":"Totally Accurate Battle Simulator (TABS)","a":"Landfall","l":"https://store.steampowered.com/app/508440/Totally_Accurate_Battle_Simulator/"},{"n":"Animal Crossing (GAMECUBE)","a":"Nintendo, turtlekiosk","l":"https://nintendo.com"},{"n":"Touhou 1 Touhou-Reiiden","a":"Jun'ya Ōta (\"ZUN\")","l":"https://en.touhougarakuta.com/eastern-playing-en/toho-no-asobikata-en/"},{"n":"Touhou 2 Touhou-Fuumaroku","a":"Jun'ya Ōta (\"ZUN\")","l":"https://en.touhougarakuta.com/eastern-playing-en/toho-no-asobikata-en/"},{"n":"Touhou 3 Touhou-Yumejikuu","a":"Jun'ya Ōta (\"ZUN\")","l":"https://en.touhougarakuta.com/eastern-playing-en/toho-no-asobikata-en/"},{"n":"Touhou 4 Touhou-Gensokyou","a":"Jun'ya Ōta (\"ZUN\")","l":"https://en.touhougarakuta.com/eastern-playing-en/toho-no-asobikata-en/"},{"n":"Touhou 5 Touhou-Kaikidan","a":"Jun'ya Ōta (\"ZUN\")","l":"https://en.touhougarakuta.com/eastern-playing-en/toho-no-asobikata-en/"},{"n":"I Wanna Be The Guy","a":"Michael \"Kayin\" O'Reilly","l":"https://iwbtg.kayin.moe/"},{"n":"YoHoHo.io","a":"Exodragon Games","l":"https://exodragon.com/"},{"n":"Friday Night Funkin vs Shucks v2","a":"CurtisDev","l":"https://gamebanana.com/mods/519908"},{"n":"Into Space 2","a":"Armor Games","l":"https://www.newgrounds.com/portal/view/603934"},{"n":"Vena","a":"Leonhard Kohl-Lörting","l":"https://loerting.itch.io/vena"},{"n":"s.p.l.i.t","a":"Mike Klubnika","l":"https://store.steampowered.com/app/3684610/split/"},{"n":"My Talking Baby Hippo","a":"Outfit7","l":"https://outfit7.com/"},{"n":"WarioWare: Touched!","a":"Nintendo","l":"https://nintendo.com"}];
                            var el=document.getElementById('creditsList');
                            var ct=document.getElementById('creditsCount');
                            function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
                            function row(g){
                                var btn=g.l?'<a href="'+g.l+'" target="_blank" class="settings-btn" style="white-space:nowrap;flex-shrink:0;">Visit</a>':'<span class="settings-btn" style="opacity:0.4;cursor:default;white-space:nowrap;flex-shrink:0;">No Link</span>';
                                return '<div class="settings-row" style="gap:10px;"><div class="settings-info" style="min-width:0;"><span class="settings-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(g.n)+'</span><span class="settings-desc">'+esc(g.a)+'</span></div>'+btn+'</div>';
                            }
                            window.filterCredits=function(q){
                                var lq=q.toLowerCase();
                                var f=lq?G.filter(function(g){return g.n.toLowerCase().includes(lq)||g.a.toLowerCase().includes(lq);}):G;
                                el.innerHTML=f.map(row).join('');
                                ct.textContent=f.length+' of '+G.length+' games';
                            };
                            window.filterCredits('');
                        })();
});


// ── Inline scripts extracted from index.html ──────────────────────────────

// === OMNISCIENT DOM SCANNER & MIXER ===
// Relay YouTube Playables game API messages from the iframe
window.addEventListener('message', function(e) {
    const gameFrame = document.getElementById('gameFrame');
    if (!gameFrame || e.source !== gameFrame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;

    // Respond to game-ready handshake so ytgame.js initializes
    if (d.type === 'GAME_READY' || d.type === 'ytgame:ready') {
        e.source.postMessage({ type: 'HOST_READY' }, '*');
    }
if (d.type === 'ytgame:get_data') {
        // FIXED: Provide explicit locale data so the game can build its file paths
        e.source.postMessage({ 
            type: 'ytgame:set_data', 
            data: { 
                language: 'en', 
                hl: 'en', 
                gl: 'US' 
            } 
        }, '*');
    }
}, false);
// Setup Settings Mixer Toggle
function toggleSystemMixer() {
    const isChecked = document.getElementById('settingsMixerToggle').checked;
    document.getElementById('mixer-dock').style.display = isChecked ? 'block' : 'none';
    localStorage.setItem('ludus_show_mixer', isChecked);
}

// Game Controls Dropdown Toggle
function toggleGameDropdown() {
    const dropdown = document.getElementById('game-dock-dropdown');
    const chevron = document.getElementById('game-dock-chevron');
    if(dropdown.style.display === 'none') {
        dropdown.style.display = 'flex'; // PREVENTS OVERRIDING FLEXBOX CSS
        chevron.style.transform = 'rotate(180deg)';
    } else {
        dropdown.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize Mixer Toggle Settings
    const showMixer = localStorage.getItem('ludus_show_mixer') === 'true'; // Default is false
    document.getElementById('settingsMixerToggle').checked = showMixer;
    document.getElementById('mixer-dock').style.display = showMixer ? 'block' : 'none';

   // 1. Drag and Drop Logic (Main Mixer)
    const mixer = document.getElementById('mixer-dock');
    const mixerHeader = document.getElementById('mixer-header');
    let isDragging = false, initialX, initialY, xOffset = 0, yOffset = 0;
    let rafPending = false; // <-- ADD THIS

    if (mixerHeader) {
        mixerHeader.addEventListener('mousedown', (e) => {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            mixer.style.transition = 'none';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            xOffset = e.clientX - initialX;
            yOffset = e.clientY - initialY;
            
            // <-- WRAP IN REQUESTANIMATIONFRAME
            if (!rafPending) {
                requestAnimationFrame(() => {
                    mixer.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
                    rafPending = false;
                });
                rafPending = true;
            }
        });
        // ... mouseup remains the same
        document.addEventListener('mouseup', () => {
            isDragging = false;
            mixer.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        });
    }

    // 1b. Drag and Drop Logic (Game Dock Controls)
    const gameDock = document.getElementById('game-floating-dock');
    const gameDockDrag = document.getElementById('game-dock-header');
    let gIsDragging = false, gInitialX, gInitialY, gXOffset = 0, gYOffset = 0;

    if(gameDockDrag) {
        gameDockDrag.addEventListener('mousedown', (e) => {
            // Check if user clicked a button inside header to skip drag
            if(e.target.closest('button')) return; 
            gInitialX = e.clientX - gXOffset;
            gInitialY = e.clientY - gYOffset;
            gIsDragging = true;
        });
        document.addEventListener('mousemove', (e) => {
            if (gIsDragging) {
                e.preventDefault();
                gXOffset = e.clientX - gInitialX;
                gYOffset = e.clientY - gInitialY;
                gameDock.style.transform = `translate3d(${gXOffset}px, ${gYOffset}px, 0)`;
            }
        });
        document.addEventListener('mouseup', () => {
            gIsDragging = false;
        });
    }

    // --- FULLSCREEN PROXY OVERRIDE ---
    // Ensure the #viewer goes fullscreen (bringing the dock with it) instead of just the iframe
    const gameFrame = document.getElementById('gameFrame');
    const viewer = document.getElementById('viewer');
    
    if (gameFrame && viewer) {
        gameFrame.requestFullscreen = function(options) {
            return viewer.requestFullscreen ? viewer.requestFullscreen(options) : viewer.webkitRequestFullscreen(options);
        };
        gameFrame.webkitRequestFullscreen = function(options) {
            return viewer.webkitRequestFullscreen ? viewer.webkitRequestFullscreen(options) : viewer.requestFullscreen(options);
        };
    }
    
    // --- INJECTED BUTTON TO ICON CONVERTER ---
    const controlsContainer = document.getElementById('viewerControlsContainer');
    if (controlsContainer) {
        const iconObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    // Check if node is button itself or contains buttons
                    if (node.tagName === 'BUTTON' || node.classList?.contains('settings-btn')) {
                        convertToIcon(node);
                    } else if (node.nodeType === 1) {
                        node.querySelectorAll('button, .settings-btn').forEach(convertToIcon);
                    }
                });
            });
        });
        
        iconObserver.observe(controlsContainer, { childList: true, subtree: true });
        
        // Convert any that loaded instantly
        controlsContainer.querySelectorAll('button, .settings-btn').forEach(convertToIcon);
    }

    function convertToIcon(btn) {
        if (btn.dataset.iconized) return;
        const text = btn.innerText.toLowerCase().trim() || btn.title.toLowerCase().trim();
        if(!text) return; // If it's already an icon or empty, skip
        
        btn.dataset.iconized = "true";
        btn.style.padding = '8px';
        btn.style.borderRadius = '8px';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.width = '36px';
        btn.style.height = '36px';
        btn.style.minWidth = '36px';
        btn.style.flexShrink = '0';
        btn.style.margin = '0';
        btn.style.background = 'rgba(255,255,255,0.05)';
        btn.style.border = '1px solid rgba(255,255,255,0.1)';
        btn.title = btn.innerText || text; // Keep original text as tooltip
        
        // --- FIX FOR OVERLAPPING UI ---
        // Strip absolute positioning inherited from CSS spot classes
        btn.style.position = 'relative';
        btn.style.top = 'auto';
        btn.style.bottom = 'auto';
        btn.style.left = 'auto';
        btn.style.right = 'auto';
        btn.style.transform = 'none';

        let svg = '';
        if (text.includes('home') || text.includes('dashboard') || text.includes('dash')) {
            svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
            document.getElementById('quickControlsContainer').appendChild(btn);
        } else if (text.includes('full') || text.includes('screen')) {
            svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            document.getElementById('quickControlsContainer').appendChild(btn); // Put Fullscreen in top bar
        } else if (text.includes('fav') || text.includes('star') || text.includes('favorite')) {
             svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
             // Leave Favorite inside the Viewer Controls dropdown
        } else if (text.includes('reload') || text.includes('refresh') || text.includes('restart')) {
            svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
        } else if (text.includes('link') || text.includes('copy') || text.includes('share')) {
             svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
        } else if (text.includes('back') || text.includes('exit')) {
             svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
        } else if (text.includes('new tab') || text.includes('newtab') || text.includes('open')) {
             svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        } else {
             // Fallback default icon
             svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
        }
        btn.innerHTML = svg;
    }

// 2. Event-Driven Audio Stream Detection
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    // Accept both the structured MEDIA_STATE_UPDATE type AND the music app's
    // native broadcast format (source: 'music')
    let target = null;
    if (data.type === 'MEDIA_STATE_UPDATE') {
        target = data.target;
    } else if (data.source === 'music') {
        target = 'music';
    } else if (data.source === 'movie') {
        target = 'movie';
    }
    if (!target) return;

    const pSvg    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const pauseSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="black"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

    // --- Main Mixer (dock section) ---
    const section  = document.getElementById(target === 'music' ? 'mixer-music-section'  : 'mixer-movie-section');
    const title    = document.getElementById(target === 'music' ? 'mix-music-title'       : 'mix-movie-title');
    const artist   = document.getElementById(target === 'music' ? 'mix-music-artist'      : null);
    const playBtn  = document.getElementById(target === 'music' ? 'mix-music-play'        : 'mix-movie-play');
    const thumb    = document.getElementById(target === 'music' ? 'mix-music-thumb'       : null);
    const pholder  = document.getElementById(target === 'music' ? 'mix-music-placeholder' : null);

    if (section && title) {
        section.style.display = 'flex';
        title.innerText = data.title || 'Unknown Media';
        if (artist && data.artist) artist.innerText = data.artist;
        if (playBtn) playBtn.innerHTML = data.paused ? pSvg : pauseSvg;
        if (thumb && data.artwork && !data.artwork.includes('appicon')) {
            thumb.src = data.artwork; thumb.style.display = 'block';
            if (pholder) pholder.style.display = 'none';
        }
    }

    // --- In-Game Mixer (viewer overlay) ---
    const gSection = document.getElementById(target === 'music' ? 'game-mixer-music-section' : 'game-mixer-movie-section');
    const gTitle   = document.getElementById(target === 'music' ? 'game-mix-music-title'      : 'game-mix-movie-title');
    const gArtist  = document.getElementById(target === 'music' ? 'game-mix-music-artist'     : null);
    const gPlayBtn = document.getElementById(target === 'music' ? 'game-mix-music-play'       : 'game-mix-movie-play');
    const gThumb   = document.getElementById(target === 'music' ? 'game-mix-music-thumb'      : null);
    const gPholder = document.getElementById(target === 'music' ? 'game-mix-music-placeholder': null);

    if (gSection && gTitle) {
        gSection.style.display = 'flex';
        gTitle.innerText = data.title || 'Unknown Media';
        if (gArtist && data.artist) gArtist.innerText = data.artist;
        if (gPlayBtn) gPlayBtn.innerHTML = data.paused ? pSvg : pauseSvg;
        if (gThumb && data.artwork && !data.artwork.includes('appicon')) {
            gThumb.src = data.artwork; gThumb.style.display = 'block';
            if (gPholder) gPholder.style.display = 'none';
        }
    }
});

    function scanAndSyncState(target, frameId, sectionId, titleId, artistId, thumbId, playBtnId, seekId) {
        const frame = document.getElementById(frameId);
        const section = document.getElementById(sectionId);
        if (!frame || !section) return;

        try {
            const innerDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
            if (!innerDoc) return;

            const mediaEl = innerDoc.querySelector('audio, video');
            
            if (mediaEl && mediaEl.src && !mediaEl.error) {
                section.style.display = 'flex';

                // Visually toggle play/pause svg
                const playBtn = document.getElementById(playBtnId);
                if (playBtn) {
                    const pSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                    const pauseSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="black"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
                    playBtn.innerHTML = mediaEl.paused ? pSvg : pauseSvg;
                }

                // Sync Metadata
                if (target === 'music') {
                    const titleEl = innerDoc.querySelector('.now-playing-bar .title');
                    const artistEl = innerDoc.querySelector('.now-playing-bar .artist');
                    const imgEl = innerDoc.querySelector('.now-playing-bar .cover');

                    const titleText = titleEl ? titleEl.innerText.trim() : "Unknown Audio";
                    
                    if (titleText !== "Select a song" && titleText !== "") {
                        document.getElementById(titleId).innerText = titleText;
                        if (artistEl && artistId) document.getElementById(artistId).innerText = artistEl.innerText || "Unknown Artist";
                        
                        if (imgEl && imgEl.src && !imgEl.src.includes('appicon.png') && thumbId) {
                            const thumb = document.getElementById(thumbId);
                            thumb.src = imgEl.src;
                            thumb.style.display = 'block';
                            const placeholderId = thumbId.replace('thumb', 'placeholder');
                            if(document.getElementById(placeholderId)) {
                                document.getElementById(placeholderId).style.display = 'none';
                            }
                        }
                    }
                } else if (target === 'movie') {
                    const movieTitle = innerDoc.querySelector('.details-title, #detail-title');
                    document.getElementById(titleId).innerText = movieTitle ? movieTitle.innerText : (innerDoc.title || "Unknown Movie");
                    
                    // Sync Movie Seek Slider
                    const seekSlider = document.getElementById(seekId);
                    if (seekSlider && mediaEl.duration && !seekSlider.dataset.isDragging) {
                        const progress = (mediaEl.currentTime / mediaEl.duration) * 100;
                        seekSlider.value = progress;
                    }
                }
            } else {
                section.style.display = 'none';
            }
        } catch (e) {
            // Fails silently if cross-origin boundary is hit
        }
    }

    // 3. Direct Audio Forcing & Transport Controls
    window.directControlMedia = function(target, action) {
        const frameId = target === 'music' ? 'musicFrame' : 'moviesFrame';
        const frame = document.getElementById(frameId);
        if (!frame) return;

        try {
            const innerDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
            if (!innerDoc) return;

            const mediaEl = innerDoc.querySelector('audio, video');

            if (action === 'togglePlay' && mediaEl) {
                mediaEl.paused ? mediaEl.play() : mediaEl.pause();
            } else if (action === 'seekForward' && mediaEl) {
                mediaEl.currentTime = Math.min(mediaEl.duration, mediaEl.currentTime + 10);
            } else if (action === 'seekBack' && mediaEl) {
                mediaEl.currentTime = Math.max(0, mediaEl.currentTime - 10);
            } else if (action === 'playNext' || action === 'playPrev') {
                if (frame.contentWindow) {
                    frame.contentWindow.postMessage({ target, action }, '*');
                }
            }
        } catch (e) {
            if (frame.contentWindow) frame.contentWindow.postMessage({ target, action }, '*');
        }
    };

    // 4. Input Sliders (Volume & Seek) -- Main Mixer
    document.getElementById('vol-music')?.addEventListener('input', function(e) {
        const frame = document.getElementById('musicFrame');
        if (frame && frame.contentDocument) {
            const media = frame.contentDocument.querySelector('audio, video');
            if (media) media.volume = parseFloat(e.target.value);
        }
        if(document.getElementById('game-vol-music')) document.getElementById('game-vol-music').value = e.target.value;
    });

    document.getElementById('vol-movie')?.addEventListener('input', function(e) {
        const frame = document.getElementById('moviesFrame');
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ target: 'movie', action: 'setVolume', volume: parseFloat(e.target.value) }, '*');
        }
        if(document.getElementById('game-vol-movie')) document.getElementById('game-vol-movie').value = e.target.value;
    });

    // Seek Drag for Movie -- Main Mixer
    const movieSeek = document.getElementById('seek-movie');
    if (movieSeek) {
        movieSeek.addEventListener('mousedown', () => movieSeek.dataset.isDragging = 'true');
        movieSeek.addEventListener('mouseup', () => setTimeout(() => movieSeek.dataset.isDragging = 'false', 100));
        movieSeek.addEventListener('input', function(e) {
            const frame = document.getElementById('moviesFrame');
            if (frame && frame.contentDocument) {
                const media = frame.contentDocument.querySelector('audio, video');
                if (media && media.duration) {
                    media.currentTime = (parseFloat(e.target.value) / 100) * media.duration;
                }
            }
        });
    }

    // 4b. Input Sliders -- Game Mixer
    document.getElementById('game-vol-music')?.addEventListener('input', function(e) {
        const frame = document.getElementById('musicFrame');
        if (frame && frame.contentDocument) {
            const media = frame.contentDocument.querySelector('audio, video');
            if (media) media.volume = parseFloat(e.target.value);
        }
        if(document.getElementById('vol-music')) document.getElementById('vol-music').value = e.target.value;
    });

    document.getElementById('game-vol-movie')?.addEventListener('input', function(e) {
        const frame = document.getElementById('moviesFrame');
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ target: 'movie', action: 'setVolume', volume: parseFloat(e.target.value) }, '*');
        }
        if(document.getElementById('vol-movie')) document.getElementById('vol-movie').value = e.target.value;
    });

    // Seek Drag for Movie -- Game Mixer
    const gameMovieSeek = document.getElementById('game-seek-movie');
    if (gameMovieSeek) {
        gameMovieSeek.addEventListener('mousedown', () => gameMovieSeek.dataset.isDragging = 'true');
        gameMovieSeek.addEventListener('mouseup', () => setTimeout(() => gameMovieSeek.dataset.isDragging = 'false', 100));
        gameMovieSeek.addEventListener('input', function(e) {
            const frame = document.getElementById('moviesFrame');
            if (frame && frame.contentDocument) {
                const media = frame.contentDocument.querySelector('audio, video');
                if (media && media.duration) {
                    media.currentTime = (parseFloat(e.target.value) / 100) * media.duration;
                }
            }
        });
    }

    // 5. Game Volume Control (Main Mixer)
    const volGame = document.getElementById('vol-game');
    if (volGame) {
        volGame.addEventListener('input', function(e) {
            const gameFrame = document.getElementById('gameFrame');
            if (!gameFrame) return;

            const newVolume = parseFloat(e.target.value);
            if(document.getElementById('game-vol-game')) document.getElementById('game-vol-game').value = newVolume;

            if (gameFrame.contentWindow) {
                gameFrame.contentWindow.postMessage({ action: 'setGameVolume', volume: newVolume }, '*');
            }
            try {
                const innerDoc = gameFrame.contentDocument || gameFrame.contentWindow.document;
                if (innerDoc) {
                    const mediaElements = innerDoc.querySelectorAll('audio, video');
                    mediaElements.forEach(media => media.volume = newVolume);
                }
            } catch (err) {}
        });
    }

    // 5b. Game Volume Control (Game Mixer)
    const gameVolGame = document.getElementById('game-vol-game');
    if (gameVolGame) {
        gameVolGame.addEventListener('input', function(e) {
            const gameFrame = document.getElementById('gameFrame');
            if (!gameFrame) return;

            const newVolume = parseFloat(e.target.value);
            if(document.getElementById('vol-game')) document.getElementById('vol-game').value = newVolume;

            if (gameFrame.contentWindow) {
                gameFrame.contentWindow.postMessage({ action: 'setGameVolume', volume: newVolume }, '*');
            }
            try {
                const innerDoc = gameFrame.contentDocument || gameFrame.contentWindow.document;
                if (innerDoc) {
                    const mediaElements = innerDoc.querySelectorAll('audio, video');
                    mediaElements.forEach(media => media.volume = newVolume);
                }
            } catch (err) {}
        });
    }
});

// ── Tab Disguise Presets (global, works with script.js) ──────────────────
    function applyDisguisePreset(title, iconUrl, cardId) {
        // Update the globals that script.js owns
        customTitle  = title;
        customFavicon = iconUrl;

        // Save with the same keys script.js reads on next load
        try {
            localStorage.setItem('mathmaster_title',   title);
            localStorage.setItem('mathmaster_favicon', iconUrl);
        } catch(e) {}

        // Use script.js's own function so canvas-mode logic is respected
        applyTabIdentity();

        // Mirror into the manual title input
        const ti = document.getElementById('settingsTabTitle');
        if (ti) ti.value = title;

        // Highlight the chosen card, clear others
        document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active-preset'));
        const card = document.getElementById(cardId);
        if (card) card.classList.add('active-preset');
    }

    // Restore active highlight on load
    (function restorePresetHighlight() {
        try {
            const savedIcon = localStorage.getItem('mathmaster_favicon');
            if (!savedIcon) return;
            document.querySelectorAll('.preset-card').forEach(card => {
                const img = card.querySelector('.preset-icon');
                if (img && img.src === savedIcon) card.classList.add('active-preset');
            });
        } catch(e) {}
    })();

    // Search / filter
    function filterPresets(query) {
        const q = query.trim().toLowerCase();
        document.querySelectorAll('#disguisePresetGrid .preset-card').forEach(card => {
            const label    = (card.querySelector('.preset-label')?.textContent   || '').toLowerCase();
            const sublabel = (card.querySelector('.preset-sublabel')?.textContent || '').toLowerCase();
            const match = !q || label.includes(q) || sublabel.includes(q);
            card.classList.toggle('preset-hidden', !match);
        });
    }
