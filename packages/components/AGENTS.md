# packages/components — 共享 UI 组件库

`@gospeak/components`：Radix 无头组件 + 自有主题 token 的通用 UI 层。**以源码形式被消费**（`exports` 直接指向 `src/index.ts`），不产出构建物。

## 结构

```
src/
├── index.ts        # 唯一出口，逐个具名导出
├── components/     # button/badge/checkbox/avatar/dialog/hover-card/input/
│                   # radio-group/scroll-area/select/skeleton/slider/switch/
│                   # toast/toggle/tooltip/card/dropdown-menu/popover/context-menu + *.stories.tsx
│                   # context-menu 另导出 showContextMenu / closeContextMenu 命令式 API
├── lib/utils.ts    # cn()：clsx + tailwind-merge
└── theme.css       # 主题 token 单一事实源
```

## theme.css 是设计 token 的唯一来源

- 亮色为基准（daisyUI acid 实测值），暗色**由亮色派生**，不独立选色；文件头写了四条派生规则（色相一致、表面单调阶梯、描边方向翻转、文字按对比度对齐）。
- 圆角档位：`xs/sm/md/lg/xl/2xl/3xl/full`，语义别名 `field(=sm)` `card(=lg)` `panel(=xl)` `overlay(=2xl)` `pill(=full)`。
- 文字层级**只有三档**：`text-foreground` / `text-muted-foreground` / `text-faint-foreground`。

## 硬约束（由 `scripts/check-ui-tokens.mjs` 强制）

- 禁止任意圆角 `rounded-[4px]`、裸 `rounded`；
- 禁止任意字号 `text-[13px]`（只允许 `text-2xs/xs/sm/base/lg/xl`）；
- 禁止 `text-foreground/45` 这类任意透明度；
- 禁止 `ds-*` 语义类（已并入 token）；
- 图标 `size` 只允许 `12|14|16|20|24|32`。

## 约定

- 新组件：`src/components/<name>.tsx` + 在 `src/index.ts` 具名导出；需要视觉基线时加 `<name>.stories.tsx`。
- 组件保持无业务语义（不 import `@gospeak/web`、不发请求），业务组件放 `web/src/components`。
- 改 token 会影响全站亮/暗两套观感；改前先跑 Storybook 基线对照（`storybook-baseline/`）。
- `build` 只是 `tsc`（`noEmit` 语义），没有 `dist`；turbo `outputs` 为空是刻意的。
