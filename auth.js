"use strict";

/*
============================================================
Zentrale Authentifizierung der Hotelsoftware
Bierenbacher Hof
============================================================

Voraussetzungen in jeder HTML-Seite:

1. Supabase-Bibliothek laden:

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

2. Diese Datei laden:

<script src="auth.js"></script>

3. Folgende Elemente müssen vorhanden sein:

#loginBlocker
#loginBox
#login_email
#login_password

4. Rollenklassen:

.role-read
.role-staff
.role-admin

Rollenmodell:

read:
- sieht .role-read

staff:
- sieht .role-read
- sieht .role-staff

admin:
- sieht .role-read
- sieht .role-staff
- sieht .role-admin
============================================================
*/


// ============================================================
// SUPABASE-KONFIGURATION
// ============================================================

const SUPABASE_URL =
    "https://ansbdavzifbfjqbzdafn.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_pkEDopMJHBRRlQvc-j3F7Q_80FvJ2hC";


// Prüfen, ob die Supabase-Bibliothek geladen wurde
if (typeof supabase === "undefined") {
    throw new Error(
        "Supabase wurde nicht geladen. " +
        "Die Supabase-Bibliothek muss vor auth.js eingebunden werden."
    );
}


// Zentralen Supabase-Client erstellen
const supa = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);


// Für bestehende Module global verfügbar machen
window.supa = supa;


// ============================================================
// GLOBALE AUTH-VARIABLEN
// ============================================================

let currentRole = "read";
let currentUser = null;
let authInitialized = false;

window.currentRole = currentRole;
window.currentUser = currentUser;


// ============================================================
// HILFSFUNKTIONEN
// ============================================================

function getAuthElement(id) {
    return document.getElementById(id);
}


function setLoginMessage(message, isError = false) {
    const messageElement = getAuthElement("loginFehler");

    if (messageElement) {
        messageElement.textContent = message;
        messageElement.style.color = isError
            ? "#a53030"
            : "#247a42";
    }

    if (isError && !messageElement) {
        alert(message);
    }
}


function clearLoginMessage() {
    const messageElement = getAuthElement("loginFehler");

    if (messageElement) {
        messageElement.textContent = "";
    }
}


function showLogin() {
    const loginBox = getAuthElement("loginBox");
    const loginBlocker = getAuthElement("loginBlocker");

    if (loginBox) {
        loginBox.style.display = "";
    }

    if (loginBlocker) {
        loginBlocker.style.display = "";
    }

    document.body.classList.remove("logged-in");
    document.body.classList.add("logged-out");

    setTimeout(function () {
        const usernameInput =
            getAuthElement("login_email");

        if (usernameInput) {
            usernameInput.focus();
        }
    }, 50);
}


function hideLogin() {
    const loginBox = getAuthElement("loginBox");
    const loginBlocker = getAuthElement("loginBlocker");

    if (loginBox) {
        loginBox.style.display = "none";
    }

    if (loginBlocker) {
        loginBlocker.style.display = "none";
    }

    document.body.classList.remove("logged-out");
    document.body.classList.add("logged-in");

    clearLoginMessage();
}


// ============================================================
// BENUTZERROLLE LADEN
// ============================================================

async function loadUserRole() {
    const {
        data: { user },
        error: userError
    } = await supa.auth.getUser();

    if (userError) {
        console.error(
            "Benutzer konnte nicht geladen werden:",
            userError
        );

        currentUser = null;
        currentRole = "read";

        window.currentUser = currentUser;
        window.currentRole = currentRole;

        return currentRole;
    }

    if (!user) {
        currentUser = null;
        currentRole = "read";

        window.currentUser = currentUser;
        window.currentRole = currentRole;

        return currentRole;
    }

    currentUser = user;
    window.currentUser = currentUser;

    const {
        data,
        error
    } = await supa
        .from("user_roles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.error(
            "Benutzerrolle konnte nicht geladen werden:",
            error
        );

        currentRole = "read";
    } else if (!data || !data.role) {
        console.warn(
            "Für den Benutzer wurde keine Rolle gefunden. " +
            "Es wird die Rolle read verwendet."
        );

        currentRole = "read";
    } else if (
        !["read", "staff", "admin"].includes(data.role)
    ) {
        console.warn(
            "Ungültige Benutzerrolle:",
            data.role
        );

        currentRole = "read";
    } else {
        currentRole = data.role;
    }

    window.currentRole = currentRole;

    return currentRole;
}


// ============================================================
// ROLLENBERECHTIGUNGEN ANWENDEN
// ============================================================

function applyPermissions() {
    const roleElements = document.querySelectorAll(
        ".role-read, .role-staff, .role-admin"
    );

    roleElements.forEach(function (element) {
        element.style.display = "none";
    });


    let allowedSelector = ".role-read";

    if (currentRole === "staff") {
        allowedSelector =
            ".role-read, .role-staff";
    }

    if (currentRole === "admin") {
        allowedSelector =
            ".role-read, .role-staff, .role-admin";
    }


    document
        .querySelectorAll(allowedSelector)
        .forEach(function (element) {

            /*
            Falls ein Element ein eigenes gewünschtes Display besitzt,
            kann es dieses so festlegen:

            data-auth-display="block"
            data-auth-display="grid"
            data-auth-display="inline-flex"

            Ohne Angabe wird display:flex verwendet.
            */

            const displayValue =
                element.dataset.authDisplay || "flex";

            element.style.display = displayValue;
        });


    // Rolle optional auf der Seite anzeigen
    const roleDisplay =
        getAuthElement("currentRoleDisplay");

    if (roleDisplay) {
        roleDisplay.textContent = currentRole;
    }


    // Benutzername oder E-Mail optional anzeigen
    const userDisplay =
        getAuthElement("currentUserDisplay");

    if (userDisplay && currentUser) {
        userDisplay.textContent =
            currentUser.email || "";
    }


    /*
    Eigenes Ereignis auslösen.

    Jede Seite kann darauf reagieren:

    document.addEventListener(
        "auth:permissions-applied",
        function (event) {
            console.log(event.detail.role);
        }
    );
    */

    document.dispatchEvent(
        new CustomEvent(
            "auth:permissions-applied",
            {
                detail: {
                    user: currentUser,
                    role: currentRole
                }
            }
        )
    );
}


// ============================================================
// LOGIN
// ============================================================

async function login() {
    const usernameInput =
        getAuthElement("login_email");

    const passwordInput =
        getAuthElement("login_password");

    if (!usernameInput || !passwordInput) {
        console.error(
            "Das Loginformular ist unvollständig. " +
            "login_email oder login_password fehlt."
        );

        return false;
    }


    const username =
        usernameInput.value.trim();

    const password =
        passwordInput.value;


    clearLoginMessage();


    if (!username || !password) {
        setLoginMessage(
            "Bitte Benutzername und Passwort eingeben.",
            true
        );

        return false;
    }


    const loginButton =
        getAuthElement("loginButton");

    if (loginButton) {
        loginButton.disabled = true;
        loginButton.dataset.originalText =
            loginButton.textContent;
        loginButton.textContent =
            "Anmeldung läuft …";
    }


    try {
        /*
        Benutzername wird über die SECURITY-DEFINER-Funktion
        get_login_email sicher in die Supabase-E-Mail
        aufgelöst.

        Die Tabelle user_roles muss dafür nicht öffentlich
        lesbar sein.
        */

        const {
            data: email,
            error: emailError
        } = await supa.rpc(
            "get_login_email",
            {
                p_username: username
            }
        );


        if (emailError) {
            console.error(
                "Fehler bei get_login_email:",
                emailError
            );

            setLoginMessage(
                "Benutzername oder Passwort ist falsch.",
                true
            );

            return false;
        }


        if (!email) {
            setLoginMessage(
                "Benutzername oder Passwort ist falsch.",
                true
            );

            return false;
        }


        /*
        Anmeldung bei Supabase Auth
        */

        const {
            data: loginData,
            error: loginError
        } = await supa.auth.signInWithPassword({
            email: email,
            password: password
        });


        if (loginError || !loginData.session) {
            console.error(
                "Supabase-Anmeldung fehlgeschlagen:",
                loginError
            );

            setLoginMessage(
                "Benutzername oder Passwort ist falsch.",
                true
            );

            return false;
        }


        // Passwort nach erfolgreichem Login entfernen
        passwordInput.value = "";


        // Benutzer und Rolle laden
        await loadUserRole();


        // Loginfenster ausblenden
        hideLogin();


        // Sichtbarkeit nach Rolle anwenden
        applyPermissions();


        authInitialized = true;


        /*
        Ereignis für das jeweilige Modul.

        Beispielsweise kann AngeboteReservierungen.html
        danach ihre Daten laden.
        */

        document.dispatchEvent(
            new CustomEvent(
                "auth:ready",
                {
                    detail: {
                        user: currentUser,
                        role: currentRole,
                        session: loginData.session
                    }
                }
            )
        );


        return true;

    } catch (error) {
        console.error(
            "Unerwarteter Loginfehler:",
            error
        );

        setLoginMessage(
            "Die Anmeldung konnte nicht durchgeführt werden.",
            true
        );

        return false;

    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent =
                loginButton.dataset.originalText ||
                "Login";
        }
    }
}


// ============================================================
// VORHANDENE SESSION PRÜFEN
// ============================================================

async function checkAuth() {
    try {
        const {
            data: { session },
            error
        } = await supa.auth.getSession();


        if (error) {
            console.error(
                "Session konnte nicht geprüft werden:",
                error
            );

            showLogin();
            return false;
        }


        if (!session) {
            currentUser = null;
            currentRole = "read";

            window.currentUser = currentUser;
            window.currentRole = currentRole;

            showLogin();
            return false;
        }


        // Vorhandene Sitzung wurde gefunden
        await loadUserRole();

        hideLogin();
        applyPermissions();

        authInitialized = true;


        document.dispatchEvent(
            new CustomEvent(
                "auth:ready",
                {
                    detail: {
                        user: currentUser,
                        role: currentRole,
                        session: session
                    }
                }
            )
        );


        return true;

    } catch (error) {
        console.error(
            "Fehler bei der Sitzungsprüfung:",
            error
        );

        showLogin();
        return false;
    }
}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {
    /*
    Eine Seite kann verhindern, dass bei ungespeicherten
    Änderungen sofort ausgeloggt wird.

    Dafür vor dem Laden von auth.js oder später setzen:

    window.canLogout = function () {
        return confirm(
            "Ungespeicherte Änderungen verwerfen?"
        );
    };
    */

    if (
        typeof window.canLogout === "function" &&
        window.canLogout() === false
    ) {
        return false;
    }


    try {
        const { error } =
            await supa.auth.signOut();

        if (error) {
            console.error(
                "Abmeldung fehlgeschlagen:",
                error
            );

            alert(
                "Die Abmeldung konnte nicht durchgeführt werden."
            );

            return false;
        }

    } catch (error) {
        console.error(
            "Unerwarteter Fehler beim Logout:",
            error
        );
    }


    currentUser = null;
    currentRole = "read";
    authInitialized = false;

    window.currentUser = null;
    window.currentRole = "read";


    /*
    Danach wird dieselbe Seite neu geladen.

    Bei einem Direktaufruf von AngeboteReservierungen.html
    erscheint dadurch wieder dort das Loginfenster.

    Es erfolgt keine erzwungene Weiterleitung zur Startseite.
    */

    window.location.reload();

    return true;
}


// ============================================================
// ROLLENPRÜFUNGEN FÜR MODULE
// ============================================================

function hasRole(requiredRole) {
    const levels = {
        read: 1,
        staff: 2,
        admin: 3
    };

    return (
        levels[currentRole] >=
        levels[requiredRole]
    );
}


function isRead() {
    return currentRole === "read";
}


function isStaff() {
    return (
        currentRole === "staff" ||
        currentRole === "admin"
    );
}


function isAdmin() {
    return currentRole === "admin";
}


// ============================================================
// AKTUELLEN BENUTZER UND ROLLE ABRUFEN
// ============================================================

function getCurrentUser() {
    return currentUser;
}


function getCurrentRole() {
    return currentRole;
}


function isAuthReady() {
    return authInitialized;
}


// ============================================================
// SUPABASE-AUTH-ÄNDERUNGEN ÜBERWACHEN
// ============================================================

supa.auth.onAuthStateChange(
    function (event, session) {

        console.log(
            "Supabase Auth-Status:",
            event
        );


        /*
        SIGNED_OUT kann auch ausgelöst werden, wenn eine
        Sitzung serverseitig ungültig geworden ist.
        */

        if (event === "SIGNED_OUT") {
            currentUser = null;
            currentRole = "read";
            authInitialized = false;

            window.currentUser = null;
            window.currentRole = "read";

            showLogin();

            document.dispatchEvent(
                new CustomEvent(
                    "auth:signed-out"
                )
            );
        }


        /*
        Bei aktualisiertem Token muss die Oberfläche
        nicht neu geladen werden.
        */

        if (
            event === "TOKEN_REFRESHED" &&
            session
        ) {
            console.log(
                "Supabase-Session wurde verlängert."
            );
        }
    }
);


// ============================================================
// LOGIN PER ENTER-TASTE
// ============================================================

function installLoginEvents() {
    [
        "login_email",
        "login_password"
    ].forEach(function (id) {

        const element =
            getAuthElement(id);

        if (!element) {
            return;
        }

        element.addEventListener(
            "keydown",
            function (event) {

                if (event.key === "Enter") {
                    event.preventDefault();
                    login();
                }
            }
        );
    });
}


// ============================================================
// AUTHENTIFIZIERUNG STARTEN
// ============================================================

function initializeAuth() {
    installLoginEvents();
    checkAuth();
}


// Erst starten, wenn die HTML-Seite vollständig geladen ist
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAuth
    );
} else {
    initializeAuth();
}


// ============================================================
// FUNKTIONEN GLOBAL BEREITSTELLEN
// ============================================================

window.login = login;
window.logout = logout;
window.checkAuth = checkAuth;
window.loadUserRole = loadUserRole;
window.applyPermissions = applyPermissions;
window.showLogin = showLogin;
window.hideLogin = hideLogin;

window.hasRole = hasRole;
window.isRead = isRead;
window.isStaff = isStaff;
window.isAdmin = isAdmin;

window.getCurrentUser = getCurrentUser;
window.getCurrentRole = getCurrentRole;
window.isAuthReady = isAuthReady;