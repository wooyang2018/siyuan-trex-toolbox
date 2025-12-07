/**
 * obj1 字段为空的值由 obj2 补上。
 * @param obj1 
 * @param obj2 默认配置对象
 * @returns 
 */
export function mergeObjects<T extends object, U extends object>(obj1: T, obj2: U): T & U {
    const result = { ...obj1 } as T & U;
    for (const key in obj2) {
        if (obj2.hasOwnProperty(key)) {
            // 仅当 obj1[key] 为 null 或 undefined 时才覆盖
            if (result[key] === null || result[key] === undefined) {
                (result as any)[key] = obj2[key];
            }
        }
    }
    return result;
}