import { standardNames } from "./standardName";

interface IgnoreBlock {
    start: number;
    end: number;
}

class FormatUtil {
    /** 获取当前文档 id */
    getDocid() {
        return document
            .querySelector(
                ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background"
            )
            ?.getAttribute("data-node-id");
    }

    /** 压缩多余空行，制表符转空格 */
    condenseContent(content: string) {
        content = content.replace(/\t/g, "    ");
        content = content.replace(/(\n){3,}/g, "$1$1");
        content = content.replace(/(\r\n){3,}/g, "$1$1");
        return content;
    }

    /** 获取代码块区间（用于跳过格式化） */
    getIgnoreBlocks(lines: string[], token = "```") {
        const ignoreBlocks: IgnoreBlock[] = [];
        let block: { start: number; end: number | null } | null = null;
        lines.forEach((line, index) => {
            line = line.trim();
            if (line.startsWith(token)) {
                if (!block) {
                    block = { start: index, end: null };
                } else {
                    if (line === token) {
                        block.end = index;
                        ignoreBlocks.push(block as IgnoreBlock);
                        block = null;
                    }
                }
            }
        });
        return ignoreBlocks;
    }

    deleteSpaces(content: string) {
        content = content.replace(/\s+([\(\)\[\]\{\}<>'":])\s+/g, " $1 ");
        content = content.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
        content = content.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
        content = content.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
        content = content.replace(/([<\(\{\[])\s([<\(\{\[])\s/g, "$1$2 ");
        content = content.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");
        content = content.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");
        content = content.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");
        content = content.replace(/\s([>\)\]\}])\s([>\)\]\}])/g, " $1$2");

        content = content.replace(
            /([`\$])\s*([<\(\[\{])([^\$]*)\s*([`\$])/g,
            "$1$2$3$4"
        );
        content = content.replace(
            /([`\$])\s*([^\$]*)([>\)\]\}])\s*([`\$])/g,
            "$1$2$3$4"
        );
        content = content.replace(/\)\s([_\^])/g, ")$1");
        content = content.replace(/\[\s*\^([^\]\s]*)\s*\]/g, "[^$1]");
        content = content.replace(
            /\s*\[\s*([^\]]+)\s*\]\s*[（(]\s*([^\s\)]*)\s*[)）]\s*/g,
            "[$1]($2)"
        );
        content = content.replace(
            /([\w:;,.!?\'\"'])\[\s*([^\]]+)\s*\]\s*[（(]\s*([^\s\)]*)\s*[)）]/g,
            "$1 [$2]($3)"
        );
        content = content.replace(
            /\[\s*([^\]]+)\s*\]\s*[（(]\s*([^\s\)]*)\s*[)）](\w)/g,
            "[$1]($2) $3"
        );

        content = content.replace(/\!\[\]\(/g, "![img](");

        content = content.replace(/^\s*([\[\(])/g, "$1");

        content = content.replace(
            /!\s*\[\s*([^\]]+)\s*\]\s*[（(]\s*([^\s\)]*)\s*[)）]\s*/g,
            "![$1]($2) "
        );

        content = content.replace(/\s+([!,.;?])/g, "$1");
        content = content.replace(/([!,.;?])\s+/g, "$1 ");

        content = content.replace(/\s*([!,.;?])\s*(["'])/g, "$1$2");

        content = content.replace(/([0-9])\s*([°%])/g, "$1$2");
        content = content.replace(/([0-9])\s*-\s*([0-9])/g, "$1-$2");
        content = content.replace(/([0-9])\s*:\s*([0-9])/g, "$1:$2");
        content = content.replace(/([0-9])\s*,\s*([0-9])/g, "$1,$2");

        content = content.replace(
            /(?<!#)\s*([，。、《》？『』「」；∶【】｛｝！＠￥％…（）])\s*/g,
            "$1"
        );

        content = content.replace(
            /^(?<![-|\d.]\s*)\s*([，。、《》？『』「」；：【】｛｝—！＠￥％…（）])\s*/g,
            "$1"
        );
        return content;
    }

    insertSpace(content: string) {
        content = content.replace(
            /(?<!\[.*\]\(.*)([\u4e00-\u9fa5\u3040-\u30FF])([a-zA-Z0-9`])/g,
            "$1 $2"
        );
        content = content.replace(
            /(?<!\[.*\]\(.*)([a-zA-Z0-9%`])([*]*[\u4e00-\u9fa5\u3040-\u30FF])/g,
            "$1 $2"
        );
        content = content.replace(/([:])\s*([a-zA-z])/g, "$1 $2");
        return content;
    }

    replacePunctuations(content: string) {
        content = content.replace(/[.]{3,}/g, "……");

        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF]),/g, "$1，");
        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF]);/g, "$1；");
        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF]):/g, "$1：");
        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF])!/g, "$1！");
        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF])\?/g, "$1？");
        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF])\\/g, "$1、");
        content = content.replace(/([\u4e00-\u9fa5\u3040-\u30FF])＼s*\:/g, "$1：");

        if (!/`.*?`/.test(content)) {
            content = content.replace(/"(.*?)"/g, "\u201c$1\u201d");
        }

        content = content.replace(/\u2018/g, "『");
        content = content.replace(/\u2019/g, "』");
        content = content.replace(/\u201c/g, "「");
        content = content.replace(/\u201d/g, "」");

        content = content.replace(
            /([\u4e00-\u9fa5\u3040-\u30FF」，。！？：])\.($|\s*)/g,
            "$1。"
        );

        content = content.replace(
            /（([!@#$%^&*()_+-=\[\]{};':"./<>【】「」《》]*\w.*?[!@#$%^&*()_+-=\[\]{};':"./<>]*)）/g,
            " ($1) "
        );

        content = content.replace(
            /([\u4e00-\u9fa5\u3040-\u30FF，。、《》？『』「」；：【】｛｝—！＠￥％…（）])\s*\((.*?)\)/g,
            "$1（$2）"
        );
        content = content.replace(
            /(?<![\])])\((.*?)\)\s*([\u4e00-\u9fa5\u3040-\u30FF，。、《》？『』「」；：【】｛｝—！＠￥％…（）])/g,
            "（$1）$2"
        );

        content = content.replace(
            /\((.*?[\u4e00-\u9fa5\u3040-\u30FF])\)/g,
            "（$1）"
        );
        content = content.replace(
            /\(([\u4e00-\u9fa5\u3040-\u30FF].*?)\)/g,
            "（$1）"
        );

        content = content.replace(/(\w)\s*，\s*(\w)/g, "$1, $2");
        content = content.replace(/(\w)\s*。\s*(\w)/g, "$1. $2");
        content = content.replace(/(\w)\s*。\s*(")/g, "$1. $2");
        content = content.replace(/(\w)\s*；\s*(\w)/g, "$1; $2");
        content = content.replace(/(\w)\s*：\s*/g, "$1: ");
        content = content.replace(/(\w)\s*？\s*(\w)/g, "$1? $2");
        content = content.replace(/(\w)\s*！\s*(\w)/g, "$1! $2");
        content = content.replace(/(\w)\s*＠\s*(\w)/g, "$1@$2");
        content = content.replace(/(\w)\s*＃\s*(\w)/g, "$1#$2");
        content = content.replace(/(\w)\s*％\s*(\w)/g, "$1 % $2");
        content = content.replace(/(\w)\s*＆\s*(\w)/g, "$1 & $2");
        content = content.replace(/(\w)\s*－\s*(\w)/g, "$1 - $2");
        content = content.replace(/(\w)\s*＝\s*(\w)/g, "$1 = $2");
        content = content.replace(/(\w)\s*＋\s*(\w)/g, "$1 + $2");
        content = content.replace(/(\w)\s*｛\s*(\w)/g, "$1 {$2");
        content = content.replace(/(\w)\s*｝\s*(\w)/g, "$1} $2");
        content = content.replace(/(\w)\s*[【\[]\s*(\w)/g, "$1 [$2");
        content = content.replace(/(\w)\s*[】\]]\s*(\w)/g, "$1] $2");
        content = content.replace(/(\w)\s*｜\s*(\w)/g, "$1 | $2");
        content = content.replace(/(\w)\s*＼\s*(\w)/g, "$1  $2");
        content = content.replace(/(\w)\s*～\s*(\w)/g, "$1~$2");

        content = content.replace(
            /(\w[:;,.!?\'\"']?[:;,.!?\'\"']?)\s*「\s*(\w)/g,
            '$1 "$2"'
        );
        content = content.replace(
            /(\w[:;,.!?\'\"']?[:;,.!?\'\"']?)\s*『\s*(\w)/g,
            "$1 '$2"
        );
        content = content.replace(/(\w[:;,.!?\'\"']?[:;,.!?\'\"']?)\s*』/g, "$1'");

        content = content.replace(/(\w[,.!?]?)\s*」\s*([「]?\w?)/g, '$1" $2');
        content = content.replace(/(\w)\s*『\s*(\w)/g, "$1'f$2");
        content = content.replace(/(\w)\s*』\s*(\w)/g, "$1'$2");

        content = content.replace(/(\w)\s*『\s*(\w)/g, "$1'f$2");
        content = content.replace(/(\w)\s*』\s*(\w)/g, "$1'$2");

        content = content.replace(/(\b\w+')\s(\w*\b)/g, "$1$2");

        content = content.replace(/「(.*?)"/g, "「$1」");
        content = content.replace(/「(.*?)"/g, "「$1」");
        content = content.replace(/"(.*?)」/g, "「$1」");
        content = content.replace(
            /"(\w.*?\w[:;,.!?\'\"']?[:;,.!?\'\"']?)」/g,
            '\u201c$1\u201d'
        );
        content = content.replace(
            /"(\w.*?\w[:;,.!?\'\"']?[:;,.!?\'\"']?)。」/g,
            '\u201c$1.\u201d'
        );
        content = content.replace(/'(\w.*?\w)"/g, '\u201c$1\u201d');

        content = content.replace(/(\w)'(\w)?/g, "$1'$2");

        content = content.replace(/\s*「(\w.*?\w[,.!?]?)」\s*/g, '\u201c$1\u201d ');
        content = content.replace(
            /\s*「(\w.*?\w[:;,.!?'\)]?[:;,.!?'\)]?)」\s*/g,
            '\u201c$1\u201d '
        );
        content = content.replace(/"(\w)」/g, '\u201c$1\u201d');
        content = content.replace(/「(\w)"/g, '\u201c$1\u201d');

        content = content.replace(
            /([\u4e00-\u9fa5\u3040-\u30FF，。、《》？『』「」；：【】｛｝—！＠￥％…（）])\s*"(.*?)"/g,
            "$1「$2」"
        );
        content = content.replace(
            /"(.*?)"\s*([\u4e00-\u9fa5\u3040-\u30FF，。、《》？『』「」；：【】｛｝—！＠￥％…（）])/g,
            "「$1」$2"
        );
        content = content.replace('「📌」', '"📌"');

        content = content.replace(/"\s*([,.!?]\1?)/g, '\u201d$1');

        content = content.replace(/[。]{3,}/g, "……");

        content = content.replace(/([！？]+)\1{1,}/g, "$1");
        content = content.replace(/([。，；：、""『』〖〗《》【】])\1{1,}/g, "$1");

        content = content.replace(
            /「([^「」]*?)「([^「」]*?)」([^「」]*?)」/g,
            "「$1『$2』$3」"
        );

        content = content.replace(/\*\*(.*?)\s*\*\*/g, "**$1**");
        content = content.replace(/\*\*(.*?)\s*\*\*\s+/g, "**$1** ");
        content = content.replace(/\s+\*\*(.*?)\s*\*\*/g, " **$1**");

        content = content.replaceAll("** **", " ");
        content = content.replaceAll("****", " ");

        standardNames.forEach((ele) => {
            content = content.replace(ele.key, ele.value);
        });

        return content;
    }

    replaceFullNumbersAndChars(content: string) {
        return content.replace(/[\uFF10-\uFF19\uFF21-\uFF5A]/g, (c) =>
            String.fromCharCode(c.charCodeAt(0) - 0xfee0)
        );
    }

    formatContent(content: string) {
        content = this.replaceFullNumbersAndChars(content);
        content = this.condenseContent(content);

        const lines = content.split("\n");
        const ignoreBlocks: IgnoreBlock[] = this.getIgnoreBlocks(lines);
        const formatPattern = /\{:.*?\}/g;
        const jumpPatterns = [
            /\(\(.*\)\)|\[\[.*\]\]|\{\{.*\}\}/,
        ];

        content = lines
            .map((line, index) => {
                if (
                    ignoreBlocks.some(({ start, end }) => {
                        return index >= start && index <= end;
                    })
                ) {
                    return line;
                }
                for (let i = 0; i < jumpPatterns.length; i++) {
                    if (jumpPatterns[i].test(line)) {
                        return line;
                    }
                }

                const matches = line.match(formatPattern);
                const nonMatches = line.split(formatPattern);

                if (matches) {
                    const uppercasedNonMatches = nonMatches.map((match) => {
                        return `${this.replacePunctuations(match)}`;
                    });
                    let result = uppercasedNonMatches[0];
                    for (let i = 0; i < matches.length; i++) {
                        result += matches[i] + uppercasedNonMatches[i + 1];
                    }
                    line = result;
                    return line;
                }

                const spaceMatched = line.match(/^(\s*?)(\S.*?\S?)(\s*)$/);

                if (spaceMatched) {
                    line =
                        spaceMatched[1] +
                        this.deleteSpaces(this.replacePunctuations(spaceMatched[2]));
                } else if (line.match(/^\s*$/)) {
                    return line;
                } else {
                    line = this.replacePunctuations(line);
                    line = this.deleteSpaces(line);
                }

                return line;
            })
            .join("\n");

        content = content.replace(/(\n){2,}$/g, "$1");
        content = content.replace(/(\r\n){2,}$/g, "$1");
        return content;
    }
}

export const formatUtil = new FormatUtil();
