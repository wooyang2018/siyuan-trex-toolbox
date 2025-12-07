export class Vector2 {
    x: number;
    y: number;
}

export function getEventPosition(event: MouseEvent | TouchEvent): {
    x: number;
    y: number;
} {
    if (event instanceof TouchEvent) {
        const touch = event.touches[0] || event.changedTouches[0];
        return { x: touch.clientX, y: touch.clientY };
    } else {
        return { x: event.clientX, y: event.clientY };
    }
}

export function getDistance(touches: TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    // console.log(`getDistance dx ${dx} , dy ${dy}`);
    return Math.sqrt(dx * dx + dy * dy);
}

export function getTouchCenterPosition(
    touches: TouchList,
): { x: number; y: number } | null {
    if (touches.length === 0) return null;

    let totalX = 0;
    let totalY = 0;

    for (let i = 0; i < touches.length; i++) {
        totalX += touches[i].clientX;
        totalY += touches[i].clientY;
    }

    const centerX = totalX / touches.length;
    const centerY = totalY / touches.length;

    return { x: centerX, y: centerY };
}