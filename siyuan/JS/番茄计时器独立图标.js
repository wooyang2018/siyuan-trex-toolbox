(() => {
    "use strict";

    const TIMER_SELECTOR = "#siyuan-tomato-timer";
    const MAX_FIND_ATTEMPTS = 10;
    const FIND_INTERVAL_MS = 1000;

    const TOMATO_ICON = `
        <svg class="toolbar__icon tomy-tomato-symbol"
             viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 7c-4.5 0-7 2.7-7 6.4 0 4.2 3.1 7.6 7 7.6s7-3.4 7-7.6C19 9.7 16.5 7 12 7Z"
                fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
                d="M12 7c-.2-2 1-3.6 3.1-4.2M12 7c-.9-1.5-2.4-2.1-4.1-1.8M12 5.2c1.1-.8 2.1-1.1 3.1-1.4"
                fill="none" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round" />
            <path
                d="M9 13.5h.01M12 16h.01M15 13.5h.01"
                fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" />
        </svg>`;

    const PAUSE_ICON = `
        <svg class="toolbar__icon tomy-toggle-symbol"
             viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
        </svg>`;

    const PLAY_ICON = `
        <svg class="toolbar__icon tomy-toggle-symbol"
             viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor"
                  d="M8 5.2a1 1 0 0 1 1.5-.86l9.2 6.8a1 1 0 0 1 0 1.72l-9.2 6.8A1 1 0 0 1 8 18.8V5.2Z" />
        </svg>`;

    let findAttempts = 0;
    let patchQueued = false;

    function ensureTimerIcon(timeElement) {
        const existingIcon = timeElement.querySelector(".tomy-timer-icon");

        if (existingIcon) {
            if (!existingIcon.querySelector(".tomy-tomato-symbol")) {
                existingIcon.innerHTML = TOMATO_ICON;
            }
            return;
        }

        const walker = document.createTreeWalker(
            timeElement,
            NodeFilter.SHOW_TEXT
        );

        let textNode;
        while ((textNode = walker.nextNode())) {
            if (!textNode.nodeValue.includes("⏱️")) continue;

            textNode.nodeValue = textNode.nodeValue.replace("⏱️", "");

            const icon = document.createElement("span");
            icon.className = "tomy-timer-icon";
            icon.innerHTML = TOMATO_ICON;
            textNode.parentNode.insertBefore(icon, textNode);
            return;
        }
    }

    function ensureToggleIcon(toggleElement) {
        if (toggleElement.querySelector(".tomy-toggle-symbol")) return;

        const isPlaying = /▶|⏵/.test(toggleElement.textContent || "");
        toggleElement.innerHTML = isPlaying ? PLAY_ICON : PAUSE_ICON;
    }

    function patchTimer(root) {
        if (!root?.isConnected) return;

        const timeElement = root.querySelector('[data-tomato-role="time"]');
        if (timeElement) ensureTimerIcon(timeElement);

        const toggleElement = root.querySelector('[data-tomato-role="toggle"]');
        if (toggleElement) ensureToggleIcon(toggleElement);
    }

    function observeTimer(root) {
        const observer = new MutationObserver(() => {
            if (patchQueued) return;

            patchQueued = true;
            requestAnimationFrame(() => {
                patchQueued = false;
                patchTimer(root);
            });
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true
        });

        patchTimer(root);
    }

    function findTimer() {
        const root = document.querySelector(TIMER_SELECTOR);
        if (root) {
            observeTimer(root);
            return;
        }

        if (findAttempts++ < MAX_FIND_ATTEMPTS) {
            setTimeout(findTimer, FIND_INTERVAL_MS);
        }
    }

    findTimer();
})();
