/**
 * Claude Note 模块集成验证器
 * @description 验证 Claude Note 模块是否正确集成到主插件中
 */

import type { IFuncModule } from "./types";
import * as claudeNoteModule from "./module";

// ===== 验证结果接口 =====
interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    details: {
        moduleInterface: boolean;
        metadata: boolean;
        functions: boolean;
        exports: boolean;
    };
}

// ===== 验证函数 =====

/**
 * 验证模块接口实现
 */
function validateModuleInterface(): { isValid: boolean; errors: string[] } {
    console.log("🔍 验证模块接口实现...");

    const requiredExports: (keyof IFuncModule)[] = [
        'name',
        'enabled',
        'load',
        'unload'
    ];

    const errors: string[] = [];

    for (const exportName of requiredExports) {
        if (!(exportName in claudeNoteModule)) {
            errors.push(`缺少必需的导出: ${exportName}`);
        }
    }

    const isValid = errors.length === 0;
    if (isValid) {
        console.log("✅ 模块接口验证通过");
    } else {
        console.log("❌ 模块接口验证失败:", errors);
    }

    return { isValid, errors };
}

/**
 * 验证模块元数据
 */
function validateModuleMetadata(): { isValid: boolean; errors: string[]; warnings: string[] } {
    console.log("🔍 验证模块元数据...");

    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证模块名称
    if (typeof claudeNoteModule.name !== 'string') {
        errors.push('模块名称必须是字符串');
    } else if (!claudeNoteModule.name.trim()) {
        errors.push('模块名称不能为空');
    }

    // 验证启用状态
    if (typeof claudeNoteModule.enabled !== 'boolean') {
        errors.push('启用状态必须是布尔值');
    }

    // 验证切换配置（可选）
    if (claudeNoteModule.declareToggleEnabled) {
        const toggleConfig = claudeNoteModule.declareToggleEnabled;
        if (typeof toggleConfig.title !== 'string') {
            errors.push('切换配置标题必须是字符串');
        }
        if (typeof toggleConfig.description !== 'string') {
            errors.push('切换配置描述必须是字符串');
        }
        if (toggleConfig.defaultEnabled === undefined) {
            warnings.push('建议为切换配置设置默认启用状态');
        }
    } else {
        warnings.push('模块缺少切换配置声明，用户将无法在设置中启用/禁用');
    }

    const isValid = errors.length === 0;
    if (isValid) {
        console.log("✅ 模块元数据验证通过");
    } else {
        console.log("❌ 模块元数据验证失败:", errors);
    }

    return { isValid, errors, warnings };
}

/**
 * 验证函数签名
 */
function validateFunctionSignatures(): { isValid: boolean; errors: string[] } {
    console.log("🔍 验证函数签名...");

    const errors: string[] = [];

    // 验证 load 函数
    if (typeof claudeNoteModule.load !== 'function') {
        errors.push('load 函数必须是函数');
    } else if (claudeNoteModule.load.length !== 1) {
        errors.push('load 函数应接受一个参数 (plugin)');
    }

    // 验证 unload 函数
    if (typeof claudeNoteModule.unload !== 'function') {
        errors.push('unload 函数必须是函数');
    } else if (claudeNoteModule.unload.length > 1) {
        errors.push('unload 函数最多接受一个可选参数 (plugin)');
    }

    // 验证 allowToUse 函数（如果存在）
    if (claudeNoteModule.allowToUse && typeof claudeNoteModule.allowToUse !== 'function') {
        errors.push('allowToUse 必须是函数');
    }

    const isValid = errors.length === 0;
    if (isValid) {
        console.log("✅ 函数签名验证通过");
    } else {
        console.log("❌ 函数签名验证失败:", errors);
    }

    return { isValid, errors };
}

/**
 * 验证导出完整性
 */
function validateExports(): { isValid: boolean; errors: string[]; warnings: string[] } {
    console.log("🔍 验证导出完整性...");

    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查是否有导出冲突
    const allExports = Object.keys(claudeNoteModule);
    const reservedNames = ['default', 'prototype', 'constructor'];

    for (const exportName of allExports) {
        if (reservedNames.includes(exportName)) {
            errors.push(`导出名称 ${exportName} 是保留关键字`);
        }
    }

    // 检查是否有重复导出
    const uniqueExports = new Set(allExports);
    if (uniqueExports.size !== allExports.length) {
        errors.push('存在重复的导出名称');
    }

    // 检查是否有未使用的导出
    const expectedExports = ['name', 'enabled', 'load', 'unload', 'declareToggleEnabled', 'allowToUse'];
    const actualExports = new Set(allExports);

    for (const expected of expectedExports) {
        if (!actualExports.has(expected)) {
            warnings.push(`缺少预期的导出: ${expected}`);
        }
    }

    const isValid = errors.length === 0;
    if (isValid) {
        console.log("✅ 导出完整性验证通过");
    } else {
        console.log("❌ 导出完整性验证失败:", errors);
    }

    return { isValid, errors, warnings };
}

// ===== 主验证函数 =====

/**
 * 执行完整的集成验证
 */
export function validateClaudeNoteIntegration(): ValidationResult {
    console.log("🚀 开始 Claude Note 模块集成验证...\n");

    const interfaceResult = validateModuleInterface();
    const metadataResult = validateModuleMetadata();
    const functionsResult = validateFunctionSignatures();
    const exportsResult = validateExports();

    const allErrors = [
        ...interfaceResult.errors,
        ...metadataResult.errors,
        ...functionsResult.errors,
        ...exportsResult.errors
    ];

    const allWarnings = [
        ...metadataResult.warnings,
        ...exportsResult.warnings
    ];

    const isValid = allErrors.length === 0;

    const result: ValidationResult = {
        isValid,
        errors: allErrors,
        warnings: allWarnings,
        details: {
            moduleInterface: interfaceResult.isValid,
            metadata: metadataResult.isValid,
            functions: functionsResult.isValid,
            exports: exportsResult.isValid
        }
    };

    // 输出验证结果
    console.log("\n=== 验证结果 ===");
    console.log(`总体状态: ${isValid ? '✅ 通过' : '❌ 失败'}`);

    if (allErrors.length > 0) {
        console.log("\n❌ 错误列表:");
        allErrors.forEach(error => console.log(`  - ${error}`));
    }

    if (allWarnings.length > 0) {
        console.log("\n⚠️  警告列表:");
        allWarnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log("\n📊 详细验证结果:");
    console.log(`  - 模块接口: ${result.details.moduleInterface ? '✅' : '❌'}`);
    console.log(`  - 元数据: ${result.details.metadata ? '✅' : '❌'}`);
    console.log(`  - 函数签名: ${result.details.functions ? '✅' : '❌'}`);
    console.log(`  - 导出完整性: ${result.details.exports ? '✅' : '❌'}`);

    if (isValid) {
        console.log("\n🎉 Claude Note 模块集成验证通过！");
        console.log("✅ 模块已正确实现 IFuncModule 接口");
        console.log("✅ 可以安全集成到主插件中");
    } else {
        console.log("\n💥 Claude Note 模块集成验证失败");
        console.log("❌ 需要修复上述问题后才能集成");
    }

    return result;
}

/**
 * 获取验证报告
 */
export function getValidationReport(): string {
    const result = validateClaudeNoteIntegration();

    let report = `# Claude Note 模块集成验证报告\n\n`;
    report += `**验证时间:** ${new Date().toLocaleString('zh-CN')}\n`;
    report += `**总体状态:** ${result.isValid ? '✅ 通过' : '❌ 失败'}\n\n`;

    if (result.errors.length > 0) {
        report += `## ❌ 错误列表\n`;
        result.errors.forEach(error => report += `- ${error}\n`);
        report += `\n`;
    }

    if (result.warnings.length > 0) {
        report += `## ⚠️ 警告列表\n`;
        result.warnings.forEach(warning => report += `- ${warning}\n`);
        report += `\n`;
    }

    report += `## 📊 详细验证结果\n`;
    report += `- 模块接口: ${result.details.moduleInterface ? '✅' : '❌'}\n`;
    report += `- 元数据: ${result.details.metadata ? '✅' : '❌'}\n`;
    report += `- 函数签名: ${result.details.functions ? '✅' : '❌'}\n`;
    report += `- 导出完整性: ${result.details.exports ? '✅' : '❌'}\n`;

    return report;
}

// ===== 自动验证 =====

// 如果作为模块导入，不自动执行验证
if (typeof window !== 'undefined' && import.meta.url === new URL(import.meta.url).href) {
    // 在浏览器环境中自动运行验证
    window.addEventListener('DOMContentLoaded', () => {
        console.log("🌐 在浏览器环境中运行 Claude Note 集成验证...");
        validateClaudeNoteIntegration();
    });
}

// 导出验证函数
export default validateClaudeNoteIntegration;