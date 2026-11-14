"use strict";

/*
 * ============================================================
 * ZENTRALE NAVIGATION
 * Bierenbacher Hof
 * ============================================================
 *
 * Verhalten:
 *
 * Desktop:
 * - Standardmäßig ist nur ein kleiner Reiter sichtbar.
 * - Beim Überfahren mit der Maus fährt die Navigation aus.
 * - Beim Verlassen fährt sie nach kurzer Verzögerung wieder ein.
 * - Ein Klick auf den Reiter hält die Navigation geöffnet.
 *
 * iPhone / Touchgeräte:
 * - Tippen auf den Reiter öffnet oder schließt die Navigation.
 * - Tippen außerhalb schließt die Navigation.
 *
 * Voraussetzungen:
 *
 * 1. Supabase wurde geladen.
 * 2. auth.js wurde vor navigation.js geladen.
 * 3. auth.js stellt folgende Funktionen bereit:
 *
 *    getCurrentUser()
 *    getCurrentRole()
 *    logout()
 *
 * 4. auth.js löst nach erfolgreicher Anmeldung aus:
 *
 *    auth:ready
 *
 * 5. auth.js löst bei einer Abmeldung aus:
 *
 *    auth:signed-out
 *
 * ============================================================
 */

(function () {
    /*
     * Verhindert eine doppelte Initialisierung,
     * falls navigation.js versehentlich mehrfach geladen wird.
     */
    if (window.hotelNavigationLoaded) {
        return;
    }

    window.hotelNavigationLoaded = true;

    /*
     * ========================================================
     * GRUNDEINSTELLUNGEN
     * ========================================================
     */

    const STARTSEITE_URL = "index.html";

    /*
     * Verzögerung, bevor die Navigation nach dem Verlassen
     * mit der Maus wieder geschlossen wird.
     */
    const CLOSE_DELAY_MS = 350;

    /*
     * Anwendungen und ihre jeweilige Mindestrolle.
     *
     * Rollen:
     *
     * read
     * staff
     * admin
     */
    const APPLICATIONS = [
        {
            name: "Belegungsplan",
            icon: "📅",
            url: "Belegungsplan.html",
            minimumRole: "read"
        },
        {
            name: "Avis schreiben",
            icon: "📄",
            url: "Avis.html",
            minimumRole: "staff"
        },
        {
            name: "Angebote & Reservierungen",
            icon: "📝",
            url: "AngeboteReservierungen.html",
            minimumRole: "staff"
        },
        {
            name: "DATEV SEPA Konverter",
            icon: "🔄",
            url: "DatevSepaKonverter.html",
            minimumRole: "admin"
        },
        {
            name: "Statistiken",
            icon: "📊",
            url: "Statistiken.html",
            minimumRole: "admin"
        }
    ];

    /*
     * Rangfolge der Rollen.
     *
     * admin darf alles sehen.
     * staff darf staff und read sehen.
     * read darf nur read sehen.
     */
    const ROLE_LEVELS = {
        read: 1,
        staff: 2,
        admin: 3
    };

    /*
     * ========================================================
     * STATUSVARIABLEN
     * ========================================================
     */

    let navigationHost = null;
    let navigationShadow = null;
    let navigationPanel = null;
    let navigationTab = null;
    let applicationMenu = null;
    let applicationButton = null;

    let navigationVisible = false;
    let navigationOpen = false;

    /*
     * true bedeutet:
     *
     * Die Navigation wurde durch einen Klick fest geöffnet
     * und soll beim Verlassen mit der Maus nicht schließen.
     */
    let navigationPinned = false;

    /*
     * Zeitsteuerung für das verzögerte Schließen.
     */
    let closeTimer = null;

    /*
     * Verhindert mehrere parallele Logout-Vorgänge.
     */
    let logoutRunning = false;

    /*
     * ========================================================
     * BENUTZER UND ROLLE
     * ========================================================
     */

    function getRole() {
        if (
            typeof window.getCurrentRole !==
            "function"
        ) {
            console.error(
                "navigation.js: getCurrentRole() ist nicht verfügbar."
            );

            return null;
        }

        const role =
            window.getCurrentRole();

        if (!role) {
            return null;
        }

        return String(role)
            .trim()
            .toLowerCase();
    }

    function getUser() {
        if (
            typeof window.getCurrentUser !==
            "function"
        ) {
            return null;
        }

        return window.getCurrentUser();
    }

    function isKnownRole(role) {
        return Object.prototype.hasOwnProperty.call(
            ROLE_LEVELS,
            role
        );
    }

    function isApplicationAllowed(
        application,
        role
    ) {
        if (
            !application ||
            !isKnownRole(role)
        ) {
            return false;
        }

        const userLevel =
            ROLE_LEVELS[role];

        const requiredLevel =
            ROLE_LEVELS[
                application.minimumRole
            ];

        if (!requiredLevel) {
            return false;
        }

        return userLevel >= requiredLevel;
    }

    function getAllowedApplications(role) {
        return APPLICATIONS.filter(
            function (application) {
                return isApplicationAllowed(
                    application,
                    role
                );
            }
        );
    }

    /*
     * ========================================================
     * DATEINAMEN UND NAVIGATION
     * ========================================================
     */

    function getCurrentFileName() {
        const path =
            window.location.pathname || "";

        const fileName = path
            .split("/")
            .pop()
            .trim();

        /*
         * Wenn lediglich der Ordner aufgerufen wurde,
         * wird die Seite als index.html behandelt.
         */
        return fileName || "index.html";
    }

    function normalizeFileName(value) {
        return String(value || "")
            .split("?")[0]
            .split("#")[0]
            .trim()
            .toLowerCase();
    }

    function isCurrentApplication(url) {
        return (
            normalizeFileName(
                getCurrentFileName()
            ) ===
            normalizeFileName(url)
        );
    }

    function isStartPage() {
        const fileName =
            normalizeFileName(
                getCurrentFileName()
            );

        return (
            fileName === "" ||
            fileName === "index.html"
        );
    }

    function navigateTo(url) {
        if (!url) {
            return;
        }

        closeApplicationMenu();
        closeNavigationImmediately();

        window.location.href = url;
    }

    /*
     * ========================================================
     * TOUCHGERÄT ERKENNEN
     * ========================================================
     */

    function isTouchDevice() {
        return (
            window.matchMedia(
                "(hover: none), (pointer: coarse)"
            ).matches ||
            navigator.maxTouchPoints > 0
        );
    }

    /*
     * ========================================================
     * SCHLIESS-TIMER
     * ========================================================
     */

    function clearCloseTimer() {
        if (closeTimer !== null) {
            window.clearTimeout(
                closeTimer
            );

            closeTimer = null;
        }
    }

    function scheduleNavigationClose() {
        clearCloseTimer();

        /*
         * Eine festgehaltene Navigation wird beim
         * Verlassen mit der Maus nicht geschlossen.
         */
        if (navigationPinned) {
            return;
        }

        /*
         * Solange das Anwendungsmenü geöffnet ist,
         * darf auch die Hauptnavigation nicht schließen.
         */
        if (
            applicationMenu &&
            !applicationMenu.hidden
        ) {
            return;
        }

        closeTimer =
            window.setTimeout(
                function () {
                    closeNavigation();
                },
                CLOSE_DELAY_MS
            );
    }

    /*
     * ========================================================
     * NAVIGATION ÖFFNEN UND SCHLIESSEN
     * ========================================================
     */

    function updateNavigationState() {
        if (
            !navigationPanel ||
            !navigationTab
        ) {
            return;
        }

        navigationPanel.classList.toggle(
            "hotel-navigation-open",
            navigationOpen
        );

        navigationTab.setAttribute(
            "aria-expanded",
            navigationOpen
                ? "true"
                : "false"
        );

        const arrow =
            navigationShadow?.getElementById(
                "hotelNavigationArrow"
            );

        if (arrow) {
            arrow.textContent =
                navigationOpen
                    ? "▲"
                    : "▼";
        }

        navigationTab.title =
            navigationOpen
                ? "Navigation schließen"
                : "Navigation öffnen";

        navigationTab.setAttribute(
            "aria-label",
            navigationOpen
                ? "Hotelprogramm-Navigation schließen"
                : "Hotelprogramm-Navigation öffnen"
        );
    }

    function openNavigation(options = {}) {
        if (!navigationVisible) {
            return;
        }

        clearCloseTimer();

        navigationOpen = true;

        if (options.pin === true) {
            navigationPinned = true;
        }

        updateNavigationState();
    }

    function closeNavigation(options = {}) {
        /*
         * Eine per Klick festgehaltene Navigation darf nur
         * mit force:true oder durch erneutes Anklicken des
         * Reiters geschlossen werden.
         */
        if (
            navigationPinned &&
            options.force !== true
        ) {
            return;
        }

        clearCloseTimer();

        closeApplicationMenu();

        navigationOpen = false;

        if (options.keepPinned !== true) {
            navigationPinned = false;
        }

        updateNavigationState();
    }

    function closeNavigationImmediately() {
        clearCloseTimer();

        navigationPinned = false;
        navigationOpen = false;

        closeApplicationMenu();
        updateNavigationState();
    }

    function toggleNavigationByTab() {
        clearCloseTimer();

        if (navigationOpen) {
            /*
             * Erneuter Klick auf den Reiter schließt
             * die Navigation vollständig.
             */
            closeNavigation({
                force: true
            });

            return;
        }

        /*
         * Beim Öffnen per Klick bleibt die Navigation
         * so lange geöffnet, bis außerhalb geklickt oder
         * der Reiter erneut betätigt wird.
         */
        openNavigation({
            pin: true
        });
    }

    /*
     * ========================================================
     * ANWENDUNGSMENÜ
     * ========================================================
     */

    function openApplicationMenu() {
        if (
            !applicationMenu ||
            !applicationButton
        ) {
            return;
        }

        clearCloseTimer();

        /*
         * Die Hauptnavigation bleibt geöffnet, solange
         * das Anwendungsmenü verwendet wird.
         */
        navigationOpen = true;

        applicationMenu.hidden = false;

        applicationButton.setAttribute(
            "aria-expanded",
            "true"
        );

        updateNavigationState();

        /*
         * Auf Touchgeräten wird kein Menüpunkt automatisch
         * fokussiert, damit die Bildschirmtastatur oder
         * der Fokus nicht unerwartet springt.
         */
        if (!isTouchDevice()) {
            applicationMenu
                .querySelector(
                    ".hotel-nav-application:not([aria-current='page'])"
                )
                ?.focus();
        }
    }

    function closeApplicationMenu() {
        if (
            !applicationMenu ||
            !applicationButton
        ) {
            return;
        }

        applicationMenu.hidden = true;

        applicationButton.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    function toggleApplicationMenu() {
        if (!applicationMenu) {
            return;
        }

        if (applicationMenu.hidden) {
            openApplicationMenu();
        } else {
            closeApplicationMenu();

            /*
             * War die Navigation nicht festgehalten,
             * darf sie nach dem Schließen des Menüs
             * wieder automatisch einklappen.
             */
            if (!navigationPinned) {
                scheduleNavigationClose();
            }
        }
    }

    /*
     * ========================================================
     * ABMELDUNG
     * ========================================================
     */

    async function handleLogout() {
        if (logoutRunning) {
            return;
        }

        /*
         * Falls die aktuelle Seite keine eigene Prüfung
         * über window.canLogout() besitzt, zeigt die
         * Navigation die normale Rückfrage.
         *
         * Existiert window.canLogout(), übernimmt auth.js
         * die endgültige Prüfung innerhalb von logout().
         */
        if (
            typeof window.canLogout !==
            "function"
        ) {
            const confirmed =
                window.confirm(
                    "Sind Sie sicher, dass Sie sich abmelden möchten?"
                );

            if (!confirmed) {
                return;
            }
        }

        closeApplicationMenu();

        if (
            typeof window.logout !==
            "function"
        ) {
            console.error(
                "navigation.js: logout() ist nicht verfügbar."
            );

            window.alert(
                "Die Abmeldung konnte nicht gestartet werden."
            );

            return;
        }

        logoutRunning = true;

        const logoutButton =
            navigationShadow?.getElementById(
                "hotelNavigationLogoutButton"
            );

        if (logoutButton) {
            logoutButton.disabled = true;
            logoutButton.textContent =
                "Abmeldung …";
        }

        try {
            const logoutSuccessful =
                await window.logout();

            /*
             * false bedeutet:
             *
             * - canLogout() hat die Abmeldung abgebrochen
             * - oder auth.js konnte nicht abmelden
             */
            if (
                logoutSuccessful === false
            ) {
                logoutRunning = false;

                if (logoutButton) {
                    logoutButton.disabled =
                        false;

                    logoutButton.innerHTML =
                        '<span aria-hidden="true">🚪</span>' +
                        '<span class="hotel-nav-desktop-label">Abmelden</span>' +
                        '<span class="hotel-nav-mobile-label">Abmelden</span>';
                }

                return;
            }
        } catch (error) {
            console.error(
                "navigation.js: Fehler bei der Abmeldung:",
                error
            );

            window.alert(
                "Die Abmeldung ist fehlgeschlagen."
            );

            logoutRunning = false;

            if (logoutButton) {
                logoutButton.disabled =
                    false;

                logoutButton.innerHTML =
                    '<span aria-hidden="true">🚪</span>' +
                    '<span class="hotel-nav-desktop-label">Abmelden</span>' +
                    '<span class="hotel-nav-mobile-label">Abmelden</span>';
            }
        }
    }

    /*
     * ========================================================
     * ANWENDUNGSMENÜ AUFBAUEN
     * ========================================================
     */

    function buildApplicationMenu(role) {
        const menuList =
            navigationShadow?.getElementById(
                "hotelApplicationList"
            );

        if (!menuList) {
            return;
        }

        menuList.innerHTML = "";

        const allowedApplications =
            getAllowedApplications(role);

        if (
            allowedApplications.length ===
            0
        ) {
            const emptyMessage =
                document.createElement(
                    "div"
                );

            emptyMessage.className =
                "hotel-nav-empty";

            emptyMessage.textContent =
                "Für diesen Benutzer sind keine Anwendungen freigegeben.";

            menuList.appendChild(
                emptyMessage
            );

            return;
        }

        allowedApplications.forEach(
            function (application) {
                const button =
                    document.createElement(
                        "button"
                    );

                button.type = "button";

                button.className =
                    "hotel-nav-application";

                button.setAttribute(
                    "role",
                    "menuitem"
                );

                const current =
                    isCurrentApplication(
                        application.url
                    );

                if (current) {
                    button.classList.add(
                        "hotel-nav-application-current"
                    );

                    button.setAttribute(
                        "aria-current",
                        "page"
                    );

                    button.title =
                        "Diese Anwendung ist bereits geöffnet";
                } else {
                    button.title =
                        application.name;
                }

                const icon =
                    document.createElement(
                        "span"
                    );

                icon.className =
                    "hotel-nav-application-icon";

                icon.setAttribute(
                    "aria-hidden",
                    "true"
                );

                icon.textContent =
                    application.icon;

                const label =
                    document.createElement(
                        "span"
                    );

                label.className =
                    "hotel-nav-application-label";

                label.textContent =
                    application.name;

                button.appendChild(icon);
                button.appendChild(label);

                if (current) {
                    const currentLabel =
                        document.createElement(
                            "span"
                        );

                    currentLabel.className =
                        "hotel-nav-current-label";

                    currentLabel.textContent =
                        "Geöffnet";

                    button.appendChild(
                        currentLabel
                    );
                }

                button.addEventListener(
                    "click",
                    function () {
                        if (current) {
                            closeApplicationMenu();

                            return;
                        }

                        navigateTo(
                            application.url
                        );
                    }
                );

                menuList.appendChild(
                    button
                );
            }
        );
    }

    /*
     * ========================================================
     * NAVIGATION ERZEUGEN
     * ========================================================
     */

    function createNavigation() {
        if (navigationHost) {
            return;
        }

        navigationHost =
            document.createElement("div");

        navigationHost.id =
            "hotelGlobalNavigationHost";

        /*
         * Der Host liegt oben mittig.
         *
         * Durch Shadow DOM und !important wird verhindert,
         * dass CSS-Regeln der einzelnen Anwendungen die
         * Navigation verändern oder ausblenden.
         */
        navigationHost.style.setProperty(
            "position",
            "fixed",
            "important"
        );

        navigationHost.style.setProperty(
            "top",
            "0",
            "important"
        );

        navigationHost.style.setProperty(
            "left",
            "65%",
            "important"
        );

        navigationHost.style.setProperty(
            "right",
            "auto",
            "important"
        );

        navigationHost.style.setProperty(
            "transform",
            "translateX(-50%)",
            "important"
        );

        navigationHost.style.setProperty(
            "z-index",
            "2147483647",
            "important"
        );

        navigationHost.style.setProperty(
            "display",
            "none",
            "important"
        );

        navigationHost.style.setProperty(
            "width",
            "max-content",
            "important"
        );

        navigationHost.style.setProperty(
            "max-width",
            "100vw",
            "important"
        );

        navigationHost.style.setProperty(
            "font-family",
            "Arial, sans-serif",
            "important"
        );

        navigationShadow =
            navigationHost.attachShadow({
                mode: "open"
            });

        const style =
            document.createElement("style");

        style.textContent = `
            :host {
                all: initial;
            }

            * {
                box-sizing: border-box;
            }

            button {
                font: inherit;
            }

            /*
             * Gesamter ausfahrbarer Bereich.
             *
             * Im eingeklappten Zustand wird die eigentliche
             * Navigation nach oben geschoben. Sichtbar bleibt
             * ausschließlich der untere Reiter.
             */
            .hotel-navigation-panel {
                position: relative;
                width: max-content;
                max-width: 100vw;
                padding-bottom: 29px;
                transform:
                    translateY(
                        calc(-100% + 29px)
                    );
                transition:
                    transform 0.22s ease;
                will-change: transform;
            }

            .hotel-navigation-panel.hotel-navigation-open {
                transform:
                    translateY(0);
            }

            /*
             * Eigentliche Navigationsleiste.
             */
            .hotel-navigation {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                min-height: 52px;
                padding: 7px;
                color: #222222;
                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.98
                    );
                border-right:
                    1px solid #c6c6c6;
                border-bottom:
                    1px solid #c6c6c6;
                border-left:
                    1px solid #c6c6c6;
                border-radius:
                    0 0 11px 11px;
                box-shadow:
                    0 4px 16px
                    rgba(0, 0, 0, 0.2);
                font-family:
                    Arial,
                    sans-serif;
                line-height: 1.2;
            }

            /*
             * Kleiner sichtbarer Reiter.
             */
            .hotel-navigation-tab {
                appearance: none;
                position: absolute;
                right: 50%;
                bottom: 0;
                transform:
                    translateX(50%);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                min-width: 102px;
                height: 30px;
                margin: 0;
                padding: 4px 13px;
                border:
                    1px solid #9d9d9d;
                border-top: 0;
                border-radius:
                    0 0 10px 10px;
                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.98
                    );
                color: #333333;
                box-shadow:
                    0 4px 8px
                    rgba(0, 0, 0, 0.16);
                font-family:
                    Arial,
                    sans-serif;
                font-size: 12px;
                font-weight: 700;
                line-height: 1;
                cursor: pointer;
                touch-action: manipulation;
            }

            .hotel-navigation-tab:hover {
                background: #eeeeee;
            }

            .hotel-navigation-tab:active {
                background: #dddddd;
            }

            .hotel-navigation-tab-text {
                white-space: nowrap;
            }

            .hotel-navigation-arrow {
                display: inline-block;
                min-width: 12px;
                color: #555555;
                font-size: 11px;
                text-align: center;
            }

            /*
             * Hauptbuttons.
             */
            .hotel-nav-button {
                appearance: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                min-height: 38px;
                margin: 0;
                padding: 8px 12px;
                border:
                    1px solid #a9a9a9;
                border-radius: 7px;
                background: #f2f2f2;
                color: #111111;
                font-family:
                    Arial,
                    sans-serif;
                font-size: 15px;
                font-weight: 600;
                line-height: 20px;
                white-space: nowrap;
                cursor: pointer;
                transition:
                    background 0.15s ease,
                    border-color 0.15s ease,
                    transform 0.1s ease;
                touch-action: manipulation;
            }

            .hotel-nav-button:hover {
                background: #dedede;
                border-color: #888888;
            }

            .hotel-nav-button:active {
                transform: scale(0.97);
            }

            .hotel-nav-button:disabled {
                opacity: 0.65;
                cursor: wait;
            }

            .hotel-navigation-tab:focus-visible,
            .hotel-nav-button:focus-visible,
            .hotel-nav-application:focus-visible {
                outline:
                    3px solid #3b82f6;
                outline-offset: 2px;
            }

            .hotel-nav-apps-button[aria-expanded="true"] {
                background: #d9e8f8;
                border-color: #6e96bd;
            }

            .hotel-nav-logout {
                background: #8f2020;
                border-color: #721919;
                color: white;
            }

            .hotel-nav-logout:hover {
                background: #711818;
                border-color: #5e1111;
            }

            .hotel-nav-mobile-label {
                display: none;
            }

            /*
             * Ausklappbares Anwendungsmenü.
             */
            .hotel-nav-menu {
                position: absolute;
                top: calc(100% + 8px);
                right: 0;
                width: 310px;
                max-width:
                    calc(100vw - 20px);
                padding: 8px;
                background: white;
                border:
                    1px solid #c6c6c6;
                border-radius: 11px;
                box-shadow:
                    0 12px 30px
                    rgba(0, 0, 0, 0.24);
            }

            .hotel-nav-menu[hidden] {
                display: none;
            }

            .hotel-nav-menu-title {
                padding: 7px 9px 9px;
                color: #555555;
                font-size: 13px;
                font-weight: bold;
            }

            .hotel-nav-application-list {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .hotel-nav-application {
                appearance: none;
                display: grid;
                grid-template-columns:
                    34px minmax(0, 1fr) auto;
                align-items: center;
                gap: 8px;
                width: 100%;
                min-height: 48px;
                margin: 0;
                padding: 8px 10px;
                border:
                    1px solid transparent;
                border-radius: 8px;
                background: transparent;
                color: #222222;
                font-family:
                    Arial,
                    sans-serif;
                font-size: 15px;
                text-align: left;
                cursor: pointer;
                touch-action: manipulation;
            }

            .hotel-nav-application:hover {
                background: #eeeeee;
                border-color: #d0d0d0;
            }

            .hotel-nav-application-current {
                background: #e5eef8;
                border-color: #b3c9df;
                cursor: default;
            }

            .hotel-nav-application-current:hover {
                background: #e5eef8;
                border-color: #b3c9df;
            }

            .hotel-nav-application-icon {
                font-size: 23px;
                text-align: center;
            }

            .hotel-nav-application-label {
                min-width: 0;
                font-weight: 600;
                overflow-wrap: anywhere;
            }

            .hotel-nav-current-label {
                padding: 3px 6px;
                border-radius: 5px;
                background: #c7d9eb;
                color: #294761;
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
            }

            .hotel-nav-empty {
                padding: 12px;
                color: #666666;
                font-size: 14px;
                line-height: 1.4;
            }

            /*
             * iPhone und andere Mobilgeräte.
             */
            @media (max-width: 600px) {
                .hotel-navigation-panel {
                    max-width: 100vw;
                }

                .hotel-navigation {
                    gap: 5px;
                    min-height: 58px;
                    padding: 6px;
                }

                .hotel-nav-button {
                    flex-direction: column;
                    gap: 1px;
                    min-width: 62px;
                    min-height: 45px;
                    padding: 5px 8px;
                    font-size: 22px;
                    line-height: 23px;
                }

                .hotel-nav-desktop-label {
                    display: none;
                }

                .hotel-nav-mobile-label {
                    display: block;
                    font-size: 9px;
                    font-weight: bold;
                    line-height: 10px;
                }

                .hotel-navigation-tab {
                    min-width: 92px;
                    height: 30px;
                    padding:
                        4px 10px;
                    font-size: 11px;
                }

                .hotel-nav-menu {
                    position: fixed;
                    top: 67px;
                    right: 10px;
                    left: 10px;
                    width: auto;
                    max-width: none;
                    max-height:
                        calc(100vh - 80px);
                    overflow-y: auto;
                    -webkit-overflow-scrolling:
                        touch;
                }

                .hotel-nav-application {
                    min-height: 56px;
                    font-size: 16px;
                }

                .hotel-nav-application-icon {
                    font-size: 26px;
                }
            }

            @media (max-width: 390px) {
                .hotel-navigation {
                    gap: 3px;
                    padding:
                        5px 4px;
                }

                .hotel-nav-button {
                    min-width: 57px;
                    padding:
                        5px 6px;
                }
            }

            /*
             * Benutzer, die weniger Bewegung bevorzugen,
             * erhalten keine Ausfahranimation.
             */
            @media (
                prefers-reduced-motion:
                reduce
            ) {
                .hotel-navigation-panel {
                    transition: none;
                }

                .hotel-nav-button {
                    transition: none;
                }
            }
        `;

        navigationPanel =
            document.createElement("div");

        navigationPanel.className =
            "hotel-navigation-panel";

        const navigation =
            document.createElement("nav");

        navigation.className =
            "hotel-navigation";

        navigation.setAttribute(
            "aria-label",
            "Hotelprogramm-Navigation"
        );

        /*
         * ====================================================
         * STARTSEITENBUTTON
         * ====================================================
         */

        const homeButton =
            document.createElement("button");

        homeButton.id =
            "hotelHomeButton";

        homeButton.type =
            "button";

        homeButton.className =
            "hotel-nav-button hotel-nav-home";

        homeButton.innerHTML =
            '<span aria-hidden="true">🏠</span>' +
            '<span class="hotel-nav-desktop-label">Startseite</span>' +
            '<span class="hotel-nav-mobile-label">Start</span>';

        homeButton.addEventListener(
            "click",
            function () {
                navigateTo(
                    STARTSEITE_URL
                );
            }
        );

        /*
         * ====================================================
         * ANWENDUNGSBUTTON
         * ====================================================
         */

        applicationButton =
            document.createElement("button");

        applicationButton.id =
            "hotelApplicationsButton";

        applicationButton.type =
            "button";

        applicationButton.className =
            "hotel-nav-button hotel-nav-apps-button";

        applicationButton.innerHTML =
            '<span aria-hidden="true">🧩</span>' +
            '<span class="hotel-nav-desktop-label">Anwendungen</span>' +
            '<span class="hotel-nav-mobile-label">Apps</span>';

        applicationButton.setAttribute(
            "aria-haspopup",
            "menu"
        );

        applicationButton.setAttribute(
            "aria-expanded",
            "false"
        );

        applicationButton.setAttribute(
            "aria-controls",
            "hotelApplicationMenu"
        );

        applicationButton.addEventListener(
            "click",
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                toggleApplicationMenu();
            }
        );

        /*
         * ====================================================
         * LOGOUTBUTTON
         * ====================================================
         */

        const logoutButton =
            document.createElement("button");

        logoutButton.id =
            "hotelNavigationLogoutButton";

        logoutButton.type =
            "button";

        logoutButton.className =
            "hotel-nav-button hotel-nav-logout";

        logoutButton.innerHTML =
            '<span aria-hidden="true">🚪</span>' +
            '<span class="hotel-nav-desktop-label">Abmelden</span>' +
            '<span class="hotel-nav-mobile-label">Abmelden</span>';

        logoutButton.addEventListener(
            "click",
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                handleLogout();
            }
        );

        /*
         * ====================================================
         * ANWENDUNGSMENÜ
         * ====================================================
         */

        applicationMenu =
            document.createElement("div");

        applicationMenu.id =
            "hotelApplicationMenu";

        applicationMenu.className =
            "hotel-nav-menu";

        applicationMenu.setAttribute(
            "role",
            "menu"
        );

        applicationMenu.setAttribute(
            "aria-labelledby",
            "hotelApplicationsButton"
        );

        applicationMenu.hidden = true;

        const menuTitle =
            document.createElement("div");

        menuTitle.className =
            "hotel-nav-menu-title";

        menuTitle.textContent =
            "Anwendung öffnen";

        const menuList =
            document.createElement("div");

        menuList.id =
            "hotelApplicationList";

        menuList.className =
            "hotel-nav-application-list";

        applicationMenu.appendChild(
            menuTitle
        );

        applicationMenu.appendChild(
            menuList
        );

        /*
         * ====================================================
         * MENÜ-REITER
         * ====================================================
         */

        navigationTab =
            document.createElement("button");

        navigationTab.id =
            "hotelNavigationTab";

        navigationTab.type =
            "button";

        navigationTab.className =
            "hotel-navigation-tab";

        navigationTab.setAttribute(
            "aria-controls",
            "hotelNavigation"
        );

        navigationTab.setAttribute(
            "aria-expanded",
            "false"
        );

        navigationTab.innerHTML =
            '<span class="hotel-navigation-tab-text">Hotel-Menü</span>' +
            '<span id="hotelNavigationArrow" class="hotel-navigation-arrow" aria-hidden="true">▼</span>';

        navigationTab.addEventListener(
            "click",
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                toggleNavigationByTab();
            }
        );

        /*
         * Auf der Startseite wird der zusätzliche
         * Startseitenbutton nicht benötigt.
         */
        if (!isStartPage()) {
            navigation.appendChild(
                homeButton
            );
        }

        navigation.appendChild(
            applicationButton
        );

        navigation.appendChild(
            logoutButton
        );

        navigation.appendChild(
            applicationMenu
        );

        navigation.id =
            "hotelNavigation";

        navigationPanel.appendChild(
            navigation
        );

        navigationPanel.appendChild(
            navigationTab
        );

        navigationShadow.appendChild(
            style
        );

        navigationShadow.appendChild(
            navigationPanel
        );

        document.body.appendChild(
            navigationHost
        );

        /*
         * ====================================================
         * DESKTOP-HOVER
         * ====================================================
         */

        navigationPanel.addEventListener(
            "mouseenter",
            function () {
                /*
                 * Hover wird nur bei Geräten verwendet,
                 * die tatsächlich einen Mauszeiger besitzen.
                 */
                if (!isTouchDevice()) {
                    openNavigation();
                }
            }
        );

        navigationPanel.addEventListener(
            "mouseleave",
            function () {
                if (!isTouchDevice()) {
                    scheduleNavigationClose();
                }
            }
        );

        /*
         * Auch Tastaturfokus hält die Navigation geöffnet.
         */
        navigationPanel.addEventListener(
            "focusin",
            function () {
                openNavigation();
            }
        );

        navigationPanel.addEventListener(
            "focusout",
            function () {
                window.setTimeout(
                    function () {
                        const activeElement =
                            navigationShadow.activeElement;

                        if (
                            activeElement &&
                            navigationPanel.contains(
                                activeElement
                            )
                        ) {
                            return;
                        }

                        scheduleNavigationClose();
                    },
                    0
                );
            }
        );

        /*
         * Klicks innerhalb der Navigation dürfen nicht an
         * die jeweilige Anwendung weitergereicht werden.
         *
         * Das ist besonders für den Belegungsplan wichtig.
         */
        [
            "click",
            "mousedown",
            "pointerdown",
            "touchstart"
        ].forEach(
            function (eventName) {
                navigationHost.addEventListener(
                    eventName,
                    function (event) {
                        event.stopPropagation();
                    }
                );
            }
        );

        /*
         * ====================================================
         * KLICK AUSSERHALB
         * ====================================================
         */

        document.addEventListener(
            "click",
            function (event) {
                if (!navigationVisible) {
                    return;
                }

                const eventPath =
                    typeof event.composedPath ===
                    "function"
                        ? event.composedPath()
                        : [];

                if (
                    eventPath.includes(
                        navigationHost
                    )
                ) {
                    return;
                }

                closeNavigation({
                    force: true
                });
            },
            true
        );

        /*
         * ====================================================
         * ESCAPE-TASTE
         * ====================================================
         */

        document.addEventListener(
            "keydown",
            function (event) {
                if (
                    event.key !==
                    "Escape"
                ) {
                    return;
                }

                if (
                    applicationMenu &&
                    !applicationMenu.hidden
                ) {
                    event.preventDefault();
                    event.stopPropagation();

                    closeApplicationMenu();

                    applicationButton?.focus();

                    return;
                }

                if (navigationOpen) {
                    event.preventDefault();
                    event.stopPropagation();

                    closeNavigation({
                        force: true
                    });

                    navigationTab?.focus();
                }
            },
            true
        );

        /*
         * Nach dem Aufbau ist die Navigation eingeklappt.
         */
        updateNavigationState();
    }

    /*
     * ========================================================
     * NAVIGATION ANZEIGEN
     * ========================================================
     */

    function showNavigation() {
        createNavigation();

        const user =
            getUser();

        const role =
            getRole();

        if (
            !user ||
            !isKnownRole(role)
        ) {
            hideNavigation();

            if (
                role &&
                !isKnownRole(role)
            ) {
                console.error(
                    "navigation.js: Unbekannte Rolle:",
                    role
                );
            }

            return;
        }

        buildApplicationMenu(role);

        navigationHost.style.setProperty(
            "display",
            "block",
            "important"
        );

        navigationVisible = true;

        /*
         * Nach einem Login ist die Navigation zunächst
         * eingeklappt und verdeckt keinen Seiteninhalt.
         */
        closeNavigationImmediately();
    }

    function hideNavigation() {
        if (!navigationHost) {
            return;
        }

        clearCloseTimer();

        navigationVisible = false;
        navigationOpen = false;
        navigationPinned = false;
        logoutRunning = false;

        closeApplicationMenu();
        updateNavigationState();

        navigationHost.style.setProperty(
            "display",
            "none",
            "important"
        );
    }

    /*
     * ========================================================
     * INITIALISIERUNG
     * ========================================================
     */

    function initializeNavigation() {
        createNavigation();

        /*
         * Falls der Benutzer bereits geladen wurde,
         * kann die Navigation sofort angezeigt werden.
         *
         * Das ist hilfreich, falls navigation.js erst nach
         * dem Ereignis auth:ready geladen wurde.
         */
        const user =
            getUser();

        const role =
            getRole();

        if (
            user &&
            isKnownRole(role)
        ) {
            showNavigation();
        } else {
            hideNavigation();
        }
    }

    /*
     * auth.js meldet, dass Benutzer und Rolle
     * vollständig bereitstehen.
     */
    document.addEventListener(
        "auth:ready",
        function () {
            showNavigation();
        }
    );

    /*
     * Navigation bei Abmeldung ausblenden.
     */
    document.addEventListener(
        "auth:signed-out",
        function () {
            hideNavigation();
        }
    );

    /*
     * navigation.js kann sowohl im <head> als auch
     * am Ende des <body> eingebunden werden.
     */
    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initializeNavigation,
            {
                once: true
            }
        );
    } else {
        initializeNavigation();
    }
})();