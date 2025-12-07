import { Vector2 } from "../../utils/position-util";

export function zoomImageKeepPosition(
    oldContainerRect: DOMRect,
    newContainerRect: DOMRect,
    zoomPosition: Vector2,
): Vector2 {
    // 鼠标在旧容器内的相对位置（归一化）
    const ratioX =
        (zoomPosition.x - oldContainerRect.left) / oldContainerRect.width;
    const ratioY =
        (zoomPosition.y - oldContainerRect.top) / oldContainerRect.height;

    // 鼠标对应的新容器内位置
    const targetX = newContainerRect.width * ratioX;
    const targetY = newContainerRect.height * ratioY;

    const worldX = zoomPosition.x;
    const worldY = zoomPosition.y;

    // 新位置应该使得世界坐标落在鼠标位置
    let newX = worldX - targetX;
    let newY = worldY - targetY;

    return { x: newX, y: newY };
}


export function changeImageKeepPosition(oldContainerRect: DOMRect, newContainerRect: DOMRect, oldPosition: Vector2): Vector2 {
    // 如果新图片顶部被遮挡，就顶部对齐
    const prevCenterX = oldPosition.x + oldContainerRect.width / 2;
    const prevCenterY = oldPosition.y + oldContainerRect.height / 2;
    const newCenterX = newContainerRect.width / 2;
    const newCenterY = newContainerRect.height / 2;
    // 计算新图片的 translate 值，使其中心对齐前一张图片的中心
    let translateX = prevCenterX - newCenterX;
    let translateY = prevCenterY - newCenterY;
    let topMin = 0;
    if (translateY < topMin) {
        translateY = topMin;
    }
    return { x: translateX, y: translateY };
}