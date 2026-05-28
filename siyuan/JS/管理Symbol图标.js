// ==========放大Symbol图标==========
const replacements1 = [
    {
        id: "#iconQueryView",
        transform: "scale(0.95)"
    }
];

function transformIcon() {
    replacements1.forEach(replacement => {
        const useElements = document.querySelectorAll(`svg use`);
        useElements.forEach(useElement => {
            // baseVal 可以通过 JavaScript 直接修改；animVal 是只读的，不能直接修改。
            if (useElement.href.baseVal === replacement.id) {
                const svgElement = useElement.parentNode;
                svgElement.style.transform = replacement.transform;
            }
        });
    });
}

whenElementExist('#barPlugins').then((barPlugins) => {
    barPlugins.addEventListener('click', () => {
        waitForElements('div.b3-menu__items > button.b3-menu__item > svg.b3-menu__icon').then(transformIcon);
    });
});


// ==========替换Symbol图标==========
const replacements2 = [
    {
        oldId: "#iconQueryView",
        newSymbol: `
                <symbol id="iconQueryView" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310.42 310.42" xml:space="preserve">
                    <path d="M273.587 214.965c49.11-49.111 49.109-129.021 0-178.132-49.111-49.111-129.02-49.111-178.13 0C53.793 78.497 47.483 140.462 76.51 188.85c0 0 2.085 3.498-.731 6.312l-64.263 64.263c-12.791 12.79-15.836 30.675-4.493 42.02l1.953 1.951c11.343 11.345 29.229 8.301 42.019-4.49l64.128-64.128c2.951-2.951 6.448-.866 6.448-.866 48.387 29.026 110.352 22.717 152.016-18.947M118.711 191.71c-36.288-36.288-36.287-95.332.001-131.62 36.288-36.287 95.332-36.288 131.619 0s36.288 95.332 0 131.62c-36.288 36.286-95.331 36.286-131.62 0"/>
                    <path d="M126.75 118.424c-1.689 0-3.406-.332-5.061-1.031-6.611-2.798-9.704-10.426-6.906-17.038 17.586-41.559 65.703-61.062 107.261-43.476 6.611 2.798 9.704 10.426 6.906 17.038s-10.425 9.703-17.039 6.906c-28.354-11.998-61.186 1.309-73.183 29.663-2.099 4.959-6.913 7.938-11.978 7.938"/>
                </symbol>`
    },
    {
        oldId: "#iconSfsrSearchReplace",
        newSymbol: `
                <symbol id="iconSfsrSearchReplace" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
                    <path d="M33 41C27.5203 44.0026 23 44 17 42C10.9236 39.9745 7 33 7 28C7 25.2562 11.1135 23.6282 12.5286 23.1494C12.8074 23.055 13 22.7966 13 22.5023V15C13 13.067 14.567 11.5 16.5 11.5C18.433 11.5 20 13.067 20 15V12.5C20 10.567 21.567 9 23.5 9C25.433 9 27 10.567 27 12.5V15C27 13.067 28.567 11.5 30.5 11.5C32.433 11.5 34 13.067 34 15V7.49999C34 5.567 35.567 4 37.5 4C39.433 4 41 5.567 41 7.49999V28.2319C41 30.7041 40.4077 33.1603 38.962 35.1657C37.4919 37.2049 35.3574 39.7083 33 41Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </symbol>`
    }
];

replacements2.forEach(replacement => {
    whenElementExist(replacement.oldId).then(existingSymbol => {
        const parser = new DOMParser();
        const newSymbolElement = parser.parseFromString(replacement.newSymbol, 'image/svg+xml').documentElement;
        existingSymbol.parentNode.replaceChild(newSymbolElement, existingSymbol);
    })
});


// ==========直接替换SVG图标==========
// 通过 selector 定位页面上已存在的 <svg> 元素，整体替换为新的 svg 字符串
const replacements3 = [
    {
        // 查看全部任务
        selector: "#plugin_pinch_0 > svg",
        newSvg: `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -35 380 490">
                    <g fill="currentColor" stroke="currentColor" stroke-width="14" stroke-linejoin="round" fill-rule="evenodd">
                        <path d="M185.469407,39.207713 L356.136074,39.207713 L356.136074,81.8743797 L185.469407,81.8743797 L185.469407,39.207713 Z M185.469407,188.541046 L356.136074,188.541046 L356.136074,231.207713 L185.469407,231.207713 L185.469407,188.541046 Z M14.8027404,295.207713 L121.469407,295.207713 L121.469407,401.87438 L14.8027404,401.87438 L14.8027404,295.207713 Z M46.8027404,327.207713 L46.8027404,369.87438 L89.4694071,369.87438 L89.4694071,327.207713 L46.8027404,327.207713 Z M185.469407,337.87438 L356.136074,337.87438 L356.136074,380.541046 L185.469407,380.541046 L185.469407,337.87438 Z M119.285384,-7.10542736e-15 L144.649352,19.5107443 L68.6167605,118.353113 L1.42108547e-14,58.3134476 L21.0721475,34.2309934 L64.0400737,71.8050464 L119.285384,-7.10542736e-15 Z M119.285384,149.333333 L144.649352,168.844078 L68.6167605,267.686446 L1.42108547e-14,207.646781 L21.0721475,183.564327 L64.0400737,221.13838 L119.285384,149.333333 Z"/>
                    </g>
                </svg>`
    }
];

replacements3.forEach(replacement => {
    whenElementExist(replacement.selector).then(existingSvg => {
        const parser = new DOMParser();
        const newSvgElement = parser.parseFromString(replacement.newSvg, 'image/svg+xml').documentElement;
        // 保留原 svg 上的 class、style 等属性，避免破坏原有布局
        for (const attr of existingSvg.attributes) {
            if (!newSvgElement.hasAttribute(attr.name)) {
                newSvgElement.setAttribute(attr.name, attr.value);
            }
        }
        existingSvg.parentNode.replaceChild(newSvgElement, existingSvg);
    });
});