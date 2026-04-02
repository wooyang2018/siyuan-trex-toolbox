function whenElementExist(selector) {
    return new Promise((resolve) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
        } else {
            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect(); // 停止观察
                    resolve(element);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    });
}

function waitForElements(selector) {
    return new Promise(resolve => {
        const checkForElements = () => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                resolve(elements);
            } else {
                requestAnimationFrame(checkForElements);
            }
        };
        checkForElements();
    });
}